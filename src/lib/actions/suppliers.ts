'use server';

import { randomBytes } from 'crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db } from '../db';
import { requirePermission } from '../permissions';
import { audit, assertSegregation } from '../audit';
import { checkTyposquatting, normalizePhone, raiseRedFlag } from '../bec';
import { missingRequiredDocs, validateTaxId } from '../countries';
import { encryptFile, MAX_FILE_MSG, MAX_FILE_SIZE } from '../files';
import { sendNotification } from '../notify';
import { getBaseUrl } from '../urls';

function backTo(path: string, error?: string, ok?: string): never {
  const q = error ? `?error=${encodeURIComponent(error)}` : ok ? `?ok=${encodeURIComponent(ok)}` : '';
  redirect(path + q);
}

/** Compras: solicita el alta de un proveedor y genera el enlace único. */
export async function createSupplier(formData: FormData) {
  let id = '';
  let error = '';
  try {
    const session = await requirePermission('PROVEEDOR_ALTA');
    const country = String(formData.get('country'));
    const razonSocial = String(formData.get('razonSocial') ?? '').trim();
    const email = String(formData.get('email') ?? '').trim() || null;
    const taxId = String(formData.get('taxId') ?? '').trim() || null;
    if (!['AR', 'UY', 'US'].includes(country)) throw new Error('País inválido');
    if (!razonSocial) throw new Error('La razón social es obligatoria');
    if (taxId) {
      const err = validateTaxId(country, taxId);
      if (err) throw new Error(err);
    }

    const supplier = await db.supplier.create({
      data: {
        country,
        razonSocial,
        email,
        taxId,
        accessToken: randomBytes(24).toString('hex'),
        createdById: session.uid,
      },
    });
    id = supplier.id;

    await audit({
      session,
      action: 'ALTA_PROVEEDOR',
      entityType: 'Supplier',
      entityId: supplier.id,
      supplierId: supplier.id,
      detail: `Alta de "${razonSocial}" (${country})`,
    });

    if (email) {
      const alerts = await checkTyposquatting(supplier.id, email, null);
      for (const a of alerts) await raiseRedFlag(supplier.id, 'TYPOSQUATTING', a);
      await sendNotification(
        email,
        'Alta en portal de proveedores',
        `Complete sus datos en: ${getBaseUrl()}/portal/${supplier.accessToken}`,
      );
    }
  } catch (e) {
    error = e instanceof Error ? e.message : 'Error inesperado';
  }
  if (error) backTo('/proveedores/nuevo', error);
  backTo(`/proveedores/${id}`, undefined, 'Proveedor creado. Envíe el enlace único al proveedor.');
}

/**
 * Validación Datos: registra el teléfono obtenido por fuente independiente y
 * la validación telefónica de los datos bancarios. Bloquea si el teléfono
 * coincide con el declarado por el proveedor (no sería independiente).
 */
export async function registerPhoneValidation(formData: FormData) {
  const supplierId = String(formData.get('supplierId'));
  const path = `/proveedores/${supplierId}`;
  try {
    const session = await requirePermission('VALIDACION_TELEFONICA');
    const phone = String(formData.get('phoneIndependent') ?? '').trim();
    const source = String(formData.get('phoneSource') ?? '').trim();
    if (!phone || !source) throw new Error('Debe indicar teléfono y fuente independiente');

    const supplier = await db.supplier.findUniqueOrThrow({
      where: { id: supplierId },
      include: { documents: true },
    });
    if (supplier.status !== 'DATOS_CARGADOS') {
      throw new Error('El proveedor debe tener los datos y cuenta bancaria cargados antes de la validación telefónica');
    }
    const missing = missingRequiredDocs(supplier.country, supplier.documents);
    if (missing.length > 0) {
      throw new Error(
        `Faltan documentos obligatorios del proveedor: ${missing.map((d) => d.label).join(', ')}. No se puede avanzar hasta que los suba.`,
      );
    }
    await assertSegregation(supplierId, session);

    if (supplier.phoneProvided && normalizePhone(phone) === normalizePhone(supplier.phoneProvided)) {
      await raiseRedFlag(
        supplierId,
        'TELEFONO_NO_INDEPENDIENTE',
        `Se intentó validar con el mismo teléfono declarado por el proveedor (${phone}). La validación debe hacerse a un número obtenido por fuente independiente.`,
      );
      await audit({
        session,
        action: 'VALIDACION_BLOQUEADA',
        entityType: 'Supplier',
        entityId: supplierId,
        supplierId,
        detail: 'Teléfono coincide con el declarado por el proveedor',
      });
      throw new Error(
        'BLOQUEADO: el teléfono coincide con el declarado por el proveedor. Debe obtenerse de una fuente independiente (web oficial o registro público).',
      );
    }

    await db.supplier.update({
      where: { id: supplierId },
      data: {
        phoneIndependent: phone,
        phoneSource: source,
        phoneValidatedAt: new Date(),
        status: 'VALIDADO_TELEFONICAMENTE',
      },
    });
    await db.bankAccount.updateMany({
      where: { supplierId, active: true },
      data: { status: 'VALIDADA_TELEFONICAMENTE' },
    });
    await audit({
      session,
      action: 'VALIDACION_TELEFONICA',
      entityType: 'Supplier',
      entityId: supplierId,
      supplierId,
      detail: `Validación telefónica al ${phone} (fuente: ${source})`,
    });
  } catch (e) {
    backTo(path, e instanceof Error ? e.message : 'Error inesperado');
  }
  backTo(path, undefined, 'Validación telefónica registrada');
}

/** Tesorería: registra la transferencia de prueba de monto simbólico. */
export async function registerTestTransfer(formData: FormData) {
  const supplierId = String(formData.get('supplierId'));
  const path = `/proveedores/${supplierId}`;
  try {
    const session = await requirePermission('TRANSFERENCIA_PRUEBA');
    const amount = parseFloat(String(formData.get('amount')));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Monto inválido');

    const supplier = await db.supplier.findUniqueOrThrow({ where: { id: supplierId } });
    if (supplier.status !== 'VALIDADO_TELEFONICAMENTE') {
      throw new Error('La cuenta debe estar validada telefónicamente antes de la transferencia de prueba (no se pueden saltar pasos del protocolo)');
    }
    const account = await db.bankAccount.findFirst({ where: { supplierId, active: true } });
    if (!account) throw new Error('El proveedor no tiene cuenta bancaria activa');
    await assertSegregation(supplierId, session);

    const transfer = await db.testTransfer.create({
      data: {
        supplierId,
        bankAccountId: account.id,
        amount,
        currency: String(formData.get('currency') ?? 'ARS'),
        executedById: session.uid,
        notes: String(formData.get('notes') ?? '') || null,
      },
    });
    await db.supplier.update({ where: { id: supplierId }, data: { status: 'PRUEBA_ENVIADA' } });
    await db.bankAccount.update({ where: { id: account.id }, data: { status: 'PRUEBA_ENVIADA' } });
    await audit({
      session,
      action: 'TRANSFERENCIA_PRUEBA',
      entityType: 'TestTransfer',
      entityId: transfer.id,
      supplierId,
      detail: `Transferencia de prueba por ${amount} ${transfer.currency}`,
    });
  } catch (e) {
    backTo(path, e instanceof Error ? e.message : 'Error inesperado');
  }
  backTo(path, undefined, 'Transferencia de prueba registrada');
}

/** Tesorería: registra la confirmación verbal de la transferencia con el proveedor. */
export async function confirmTestTransfer(formData: FormData) {
  const supplierId = String(formData.get('supplierId'));
  const path = `/proveedores/${supplierId}`;
  try {
    const session = await requirePermission('TRANSFERENCIA_PRUEBA');
    const supplier = await db.supplier.findUniqueOrThrow({ where: { id: supplierId } });
    if (supplier.status !== 'PRUEBA_ENVIADA') throw new Error('No hay transferencia de prueba pendiente de confirmar');
    await assertSegregation(supplierId, session);

    const transfer = await db.testTransfer.findFirst({
      where: { supplierId, confirmedAt: null },
      orderBy: { executedAt: 'desc' },
    });
    if (!transfer) throw new Error('No se encontró la transferencia de prueba');

    await db.testTransfer.update({
      where: { id: transfer.id },
      data: { confirmedById: session.uid, confirmedAt: new Date() },
    });
    await db.supplier.update({ where: { id: supplierId }, data: { status: 'PRUEBA_CONFIRMADA' } });
    await db.bankAccount.updateMany({ where: { supplierId, active: true }, data: { status: 'PRUEBA_CONFIRMADA' } });
    await audit({
      session,
      action: 'CONFIRMACION_TRANSFERENCIA',
      entityType: 'TestTransfer',
      entityId: transfer.id,
      supplierId,
      detail: `Confirmación verbal de la transferencia de prueba. ${String(formData.get('notes') ?? '')}`,
    });
  } catch (e) {
    backTo(path, e instanceof Error ? e.message : 'Error inesperado');
  }
  backTo(path, undefined, 'Confirmación registrada');
}

/** Auditoría: aprobación final de la cuenta tras revisar la trazabilidad completa. */
export async function finalApprove(formData: FormData) {
  const supplierId = String(formData.get('supplierId'));
  const path = `/proveedores/${supplierId}`;
  try {
    const session = await requirePermission('APROBACION_FINAL');
    const supplier = await db.supplier.findUniqueOrThrow({ where: { id: supplierId } });
    if (supplier.status !== 'PRUEBA_CONFIRMADA') {
      throw new Error('La aprobación final requiere la transferencia de prueba confirmada (no se pueden saltar pasos del protocolo)');
    }
    const pendingFlags = await db.redFlag.count({ where: { supplierId, resolved: false } });
    if (pendingFlags > 0) throw new Error(`Hay ${pendingFlags} alerta(s) de seguridad sin resolver. Resuélvalas antes de aprobar.`);
    await assertSegregation(supplierId, session);

    await db.supplier.update({
      where: { id: supplierId },
      data: { status: 'APROBADO', correctionNote: null },
    });
    await db.bankAccount.updateMany({ where: { supplierId, active: true }, data: { status: 'APROBADA' } });
    await audit({
      session,
      action: 'APROBACION_FINAL',
      entityType: 'Supplier',
      entityId: supplierId,
      supplierId,
      detail: 'Aprobación final de la cuenta del proveedor',
    });
    if (supplier.email) {
      await sendNotification(
        supplier.email,
        'Su alta de proveedor fue aprobada',
        `Estimado proveedor:\n\nSu alta fue verificada y aprobada. Ya puede cargar facturas y consultar el estado de sus pagos desde su portal:\n${getBaseUrl()}/portal/${supplier.accessToken}\n\nGracias.`,
      );
    }
  } catch (e) {
    backTo(path, e instanceof Error ? e.message : 'Error inesperado');
  }
  backTo(path, undefined, 'Proveedor aprobado');
}

/**
 * Auditoría: solicita correcciones al proveedor. El proveedor ve las
 * observaciones en su portal, corrige y reenvía; el circuito de validación
 * anti-BEC se reinicia desde "Datos cargados".
 */
export async function requestCorrections(formData: FormData) {
  const supplierId = String(formData.get('supplierId'));
  const path = `/proveedores/${supplierId}`;
  try {
    const session = await requirePermission('APROBACION_FINAL');
    const note = String(formData.get('note') ?? '').trim();
    if (!note) throw new Error('Debe detallar las correcciones solicitadas');

    const supplier = await db.supplier.findUniqueOrThrow({ where: { id: supplierId } });
    const allowed = ['DATOS_CARGADOS', 'VALIDADO_TELEFONICAMENTE', 'PRUEBA_ENVIADA', 'PRUEBA_CONFIRMADA'];
    if (!allowed.includes(supplier.status)) {
      throw new Error('Solo se pueden solicitar correcciones a proveedores en proceso de validación');
    }

    await db.supplier.update({
      where: { id: supplierId },
      data: { status: 'CORRECCIONES_SOLICITADAS', correctionNote: note },
    });
    await audit({
      session,
      action: 'SOLICITUD_CORRECCIONES',
      entityType: 'Supplier',
      entityId: supplierId,
      supplierId,
      detail: note,
    });
    if (supplier.email) {
      await sendNotification(
        supplier.email,
        'Correcciones requeridas en su alta de proveedor',
        `Estimado proveedor:\n\nRevisamos su información y necesitamos que realice las siguientes correcciones:\n\n${note}\n\nIngrese a su portal para corregir y reenviar:\n${getBaseUrl()}/portal/${supplier.accessToken}\n\nGracias.`,
      );
    }
  } catch (e) {
    backTo(path, e instanceof Error ? e.message : 'Error inesperado');
  }
  backTo(path, undefined, 'Correcciones solicitadas y notificadas al proveedor');
}

/** Auditoría: rechazo del proveedor. */
export async function rejectSupplier(formData: FormData) {
  const supplierId = String(formData.get('supplierId'));
  const path = `/proveedores/${supplierId}`;
  try {
    const session = await requirePermission('APROBACION_FINAL');
    const reason = String(formData.get('reason') ?? '').trim();
    if (!reason) throw new Error('Debe indicar el motivo del rechazo');
    await db.supplier.update({ where: { id: supplierId }, data: { status: 'RECHAZADO' } });
    await db.bankAccount.updateMany({ where: { supplierId, active: true }, data: { status: 'RECHAZADA' } });
    await audit({
      session,
      action: 'RECHAZO_PROVEEDOR',
      entityType: 'Supplier',
      entityId: supplierId,
      supplierId,
      detail: `Motivo: ${reason}`,
    });
  } catch (e) {
    backTo(path, e instanceof Error ? e.message : 'Error inesperado');
  }
  backTo(path, undefined, 'Proveedor rechazado');
}

/** Auditoría: marca una alerta de seguridad como resuelta (queda trazado). */
export async function resolveRedFlag(formData: FormData) {
  const flagId = String(formData.get('flagId'));
  const supplierId = String(formData.get('supplierId'));
  const path = `/proveedores/${supplierId}`;
  try {
    const session = await requirePermission('APROBACION_FINAL');
    const note = String(formData.get('note') ?? '').trim();
    if (!note) throw new Error('Debe indicar cómo se verificó/resolvió la alerta');
    await db.redFlag.update({ where: { id: flagId }, data: { resolved: true } });
    await audit({
      session,
      action: 'RESOLUCION_RED_FLAG',
      entityType: 'RedFlag',
      entityId: flagId,
      supplierId,
      detail: note,
    });
  } catch (e) {
    backTo(path, e instanceof Error ? e.message : 'Error inesperado');
  }
  backTo(path, undefined, 'Alerta resuelta');
}

/** Compras: carga documentación fiscal/societaria del proveedor. */
export async function uploadInternalDocument(formData: FormData) {
  const supplierId = String(formData.get('supplierId'));
  const path = `/proveedores/${supplierId}`;
  try {
    const session = await requirePermission('PROVEEDOR_ALTA');
    const file = formData.get('file') as File | null;
    const type = String(formData.get('type') ?? 'OTRO');
    if (!file || file.size === 0) throw new Error('Debe seleccionar un archivo');
    if (file.size > MAX_FILE_SIZE) throw new Error(MAX_FILE_MSG);

    const doc = await db.document.create({
      data: {
        supplierId,
        type,
        filename: file.name,
        data: encryptFile(Buffer.from(await file.arrayBuffer())),
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        uploadedBy: session.email,
      },
    });
    await audit({
      session,
      action: 'CARGA_DOCUMENTO',
      entityType: 'Document',
      entityId: doc.id,
      supplierId,
      detail: `${type}: ${file.name}`,
    });
  } catch (e) {
    backTo(path, e instanceof Error ? e.message : 'Error inesperado');
  }
  revalidatePath(path);
  backTo(path, undefined, 'Documento cargado');
}
