'use server';

import { redirect } from 'next/navigation';
import { db } from '../db';
import { requirePermission } from '../permissions';
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
  let path = '/facturas';
  try {
    const session = await requirePermission('FACTURA_REVISION');
    const invoice = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    path = `/proveedores/${invoice.supplierId}/facturas`;
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
    backTo(path, e instanceof Error ? e.message : 'Error inesperado');
  }
  backTo(path, undefined, 'Factura en revisión');
}

/**
 * Auditoría: aprueba la factura para pago. Si el monto supera el umbral
 * configurado, se exigen aprobaciones de múltiples personas distintas.
 */
export async function approveInvoice(formData: FormData) {
  const invoiceId = String(formData.get('invoiceId'));
  let okMsg = 'Factura aprobada para pago';
  let path = '/facturas';
  try {
    const session = await requirePermission('FACTURA_APROBACION');
    const invoice = await db.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { supplier: true, approvals: true },
    });
    path = `/proveedores/${invoice.supplierId}/facturas`;
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
    backTo(path, e instanceof Error ? e.message : 'Error inesperado');
  }
  backTo(path, undefined, okMsg);
}

/** Tesorería: programa el pago de la factura. */
export async function scheduleInvoice(formData: FormData) {
  const invoiceId = String(formData.get('invoiceId'));
  let path = '/facturas';
  try {
    const session = await requirePermission('PAGOS');
    const invoice = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    path = `/proveedores/${invoice.supplierId}/facturas`;
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
    backTo(path, e instanceof Error ? e.message : 'Error inesperado');
  }
  backTo(path, undefined, 'Pago programado');
}

/**
 * Tesorería: sube un recibo de pago / certificado de retención que puede
 * cubrir una o varias facturas del proveedor, y opcionalmente marca como
 * pagadas las facturas programadas seleccionadas.
 */
export async function uploadPaymentReceipt(formData: FormData) {
  const supplierId = String(formData.get('supplierId'));
  const path = `/proveedores/${supplierId}/facturas`;
  let okMsg = 'Comprobante cargado';
  try {
    const session = await requirePermission('PAGOS');
    const type = String(formData.get('type') ?? 'RECIBO_PAGO');
    const markPaid = formData.get('markPaid') === 'on';
    const file = formData.get('file') as File | null;
    const invoiceIds = formData.getAll('invoiceIds').map(String).filter(Boolean);

    if (!file || file.size === 0) throw new Error('Debe seleccionar un archivo');
    if (file.size > MAX_FILE_SIZE) throw new Error(MAX_FILE_MSG);
    if (invoiceIds.length === 0) throw new Error('Debe seleccionar al menos una factura');

    const invoices = await db.invoice.findMany({
      where: { id: { in: invoiceIds }, supplierId },
      include: { supplier: true },
    });
    if (invoices.length !== invoiceIds.length) {
      throw new Error('Alguna de las facturas seleccionadas no pertenece a este proveedor');
    }

    const doc = await db.document.create({
      data: {
        supplierId,
        type,
        filename: file.name,
        data: encryptFile(Buffer.from(await file.arrayBuffer())),
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        uploadedBy: session.email,
        invoiceLinks: { create: invoiceIds.map((invoiceId) => ({ invoiceId })) },
      },
    });

    const numbers = invoices.map((i) => i.number).join(', ');
    let paidCount = 0;
    if (markPaid) {
      const programadas = invoices.filter((i) => i.status === 'PROGRAMADA');
      if (programadas.length === 0) {
        throw new Error('Ninguna de las facturas seleccionadas está Programada para marcar como pagada');
      }
      await db.invoice.updateMany({
        where: { id: { in: programadas.map((i) => i.id) } },
        data: { status: 'PAGADA' },
      });
      paidCount = programadas.length;
      okMsg = `Comprobante cargado y ${paidCount} factura(s) marcada(s) como pagada(s)`;
    }

    await audit({
      session,
      action: markPaid ? 'FACTURA_PAGADA' : 'CARGA_COMPROBANTE_PAGO',
      entityType: 'Document',
      entityId: doc.id,
      supplierId,
      detail: `${type}: ${file.name} (facturas: ${numbers})`,
    });

    const supplier = invoices[0].supplier;
    if (supplier.email) {
      await sendNotification(
        supplier.email,
        markPaid
          ? `Pago registrado de ${paidCount} factura(s)`
          : 'Nuevo comprobante disponible en su portal',
        `Estimado proveedor:\n\n${
          markPaid
            ? `Registramos el pago de las siguientes facturas: ${numbers}.`
            : `Hay un nuevo comprobante disponible para las facturas: ${numbers}.`
        }\nPuede descargar el comprobante desde su portal:\n${getBaseUrl()}/portal/${supplier.accessToken}\n\nGracias.`,
      );
    }
  } catch (e) {
    backTo(path, e instanceof Error ? e.message : 'Error inesperado');
  }
  backTo(path, undefined, okMsg);
}
