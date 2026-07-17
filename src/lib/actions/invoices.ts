'use server';

import { redirect } from 'next/navigation';
import { db } from '../db';
import { requireRole } from '../auth';
import { audit } from '../audit';
import { encryptFile, MAX_FILE_MSG, MAX_FILE_SIZE } from '../files';
import { sendNotification } from '../notify';
import { getBaseUrl } from '../urls';

function backTo(path: string, error?: string, ok?: string): never {
  const q = error ? `?error=${encodeURIComponent(error)}` : ok ? `?ok=${encodeURIComponent(ok)}` : '';
  redirect(path + q);
}

/** Compras/Auditoría: toma la factura para revisión. */
export async function startReview(formData: FormData) {
  const invoiceId = String(formData.get('invoiceId'));
  try {
    const session = requireRole('COMPRAS', 'AUDITORIA');
    const invoice = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    if (invoice.status !== 'RECIBIDA') throw new Error('La factura no está en estado Recibida');
    await db.invoice.update({ where: { id: invoiceId }, data: { status: 'EN_REVISION' } });
    await audit({
      session,
      action: 'FACTURA_EN_REVISION',
      entityType: 'Invoice',
      entityId: invoiceId,
      supplierId: invoice.supplierId,
      detail: `Factura ${invoice.number}`,
    });
  } catch (e) {
    backTo('/facturas', e instanceof Error ? e.message : 'Error inesperado');
  }
  backTo('/facturas', undefined, 'Factura en revisión');
}

/**
 * Auditoría: aprueba la factura para pago. Si el monto supera el umbral
 * configurado, se exigen aprobaciones de múltiples personas distintas.
 */
export async function approveInvoice(formData: FormData) {
  const invoiceId = String(formData.get('invoiceId'));
  let okMsg = 'Factura aprobada para pago';
  try {
    const session = requireRole('AUDITORIA', 'COMPRAS');
    const invoice = await db.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { supplier: true, approvals: true },
    });
    if (invoice.status !== 'EN_REVISION') throw new Error('La factura debe estar En revisión');
    if (invoice.supplier.status !== 'APROBADO') {
      throw new Error('El proveedor aún no tiene la cuenta aprobada por Auditoría (protocolo anti-BEC incompleto)');
    }
    if (invoice.approvals.some((a) => a.userId === session.uid)) {
      throw new Error('Usted ya aprobó esta factura; se requiere la aprobación de otra persona');
    }

    await db.invoiceApproval.create({ data: { invoiceId, userId: session.uid } });
    await audit({
      session,
      action: 'APROBACION_FACTURA',
      entityType: 'Invoice',
      entityId: invoiceId,
      supplierId: invoice.supplierId,
      detail: `Aprobación de factura ${invoice.number} por ${invoice.amount} ${invoice.currency}`,
    });

    // Regla de doble aprobación: la más específica (país) tiene prioridad
    const rules = await db.approvalRule.findMany({
      where: {
        threshold: { lte: invoice.amount },
        OR: [{ country: invoice.supplier.country }, { country: null }],
      },
      orderBy: { requiredApprovals: 'desc' },
    });
    const required = rules[0]?.requiredApprovals ?? 1;
    const count = invoice.approvals.length + 1;

    if (count >= required) {
      await db.invoice.update({ where: { id: invoiceId }, data: { status: 'APROBADA_PARA_PAGO' } });
    } else {
      okMsg = `Aprobación registrada (${count}/${required}). Faltan ${required - count} aprobación(es) por el umbral configurado.`;
    }
  } catch (e) {
    backTo('/facturas', e instanceof Error ? e.message : 'Error inesperado');
  }
  backTo('/facturas', undefined, okMsg);
}

/** Tesorería: programa el pago de la factura. */
export async function scheduleInvoice(formData: FormData) {
  const invoiceId = String(formData.get('invoiceId'));
  try {
    const session = requireRole('TESORERIA');
    const invoice = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    if (invoice.status !== 'APROBADA_PARA_PAGO') throw new Error('La factura debe estar Aprobada para pago');
    await db.invoice.update({ where: { id: invoiceId }, data: { status: 'PROGRAMADA' } });
    await audit({
      session,
      action: 'FACTURA_PROGRAMADA',
      entityType: 'Invoice',
      entityId: invoiceId,
      supplierId: invoice.supplierId,
      detail: `Factura ${invoice.number}`,
    });
  } catch (e) {
    backTo('/facturas', e instanceof Error ? e.message : 'Error inesperado');
  }
  backTo('/facturas', undefined, 'Pago programado');
}

/** Tesorería: sube el recibo de pago / certificado de retención y marca la factura como pagada. */
export async function uploadPaymentReceipt(formData: FormData) {
  const invoiceId = String(formData.get('invoiceId'));
  try {
    const session = requireRole('TESORERIA');
    const type = String(formData.get('type') ?? 'RECIBO_PAGO');
    const markPaid = formData.get('markPaid') === 'on';
    const file = formData.get('file') as File | null;
    if (!file || file.size === 0) throw new Error('Debe seleccionar un archivo');
    if (file.size > MAX_FILE_SIZE) throw new Error(MAX_FILE_MSG);

    const invoice = await db.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { supplier: true },
    });
    const doc = await db.document.create({
      data: {
        supplierId: invoice.supplierId,
        invoiceId,
        type,
        filename: file.name,
        data: encryptFile(Buffer.from(await file.arrayBuffer())),
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        uploadedBy: session.email,
      },
    });
    if (markPaid) {
      if (invoice.status !== 'PROGRAMADA') throw new Error('Solo se puede marcar como pagada una factura Programada');
      await db.invoice.update({ where: { id: invoiceId }, data: { status: 'PAGADA' } });
    }
    await audit({
      session,
      action: markPaid ? 'FACTURA_PAGADA' : 'CARGA_COMPROBANTE_PAGO',
      entityType: 'Document',
      entityId: doc.id,
      supplierId: invoice.supplierId,
      detail: `${type}: ${file.name} (factura ${invoice.number})`,
    });
    if (invoice.supplier.email) {
      await sendNotification(
        invoice.supplier.email,
        markPaid
          ? `Su factura ${invoice.number} fue pagada`
          : `Nuevo comprobante disponible para su factura ${invoice.number}`,
        `Estimado proveedor:\n\n${
          markPaid
            ? `Registramos el pago de su factura ${invoice.number} por ${invoice.amount} ${invoice.currency}.`
            : `Hay un nuevo comprobante disponible para su factura ${invoice.number}.`
        }\nPuede descargar el comprobante desde su portal:\n${getBaseUrl()}/portal/${invoice.supplier.accessToken}\n\nGracias.`,
      );
    }
  } catch (e) {
    backTo('/facturas', e instanceof Error ? e.message : 'Error inesperado');
  }
  backTo('/facturas', undefined, 'Comprobante cargado');
}
