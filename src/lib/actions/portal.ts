'use server';

import { redirect } from 'next/navigation';
import { db } from '../db';
import { getSupplierByToken } from '../auth';
import { audit } from '../audit';
import { checkTyposquatting, holderMatchesRazonSocial, raiseRedFlag } from '../bec';
import { validateBank, validateTaxId } from '../countries';
import { encryptFile, MAX_FILE_MSG, MAX_FILE_SIZE } from '../files';

function backTo(token: string, tab: string, error?: string, ok?: string): never {
  const q = new URLSearchParams({ tab });
  if (error) q.set('error', error);
  else if (ok) q.set('ok', ok);
  redirect(`/portal/${token}?${q.toString()}`);
}

/** Proveedor: actualiza razón social, Tax ID, domicilio, sitio web y contacto. */
export async function updateSupplierData(formData: FormData) {
  const token = String(formData.get('token'));
  try {
    const supplier = await getSupplierByToken(token);
    if (!supplier) throw new Error('Enlace inválido');

    const razonSocial = String(formData.get('razonSocial') ?? '').trim();
    const taxId = String(formData.get('taxId') ?? '').trim();
    const domicilio = String(formData.get('domicilio') ?? '').trim();
    const website = String(formData.get('website') ?? '').trim();
    const email = String(formData.get('email') ?? '').trim();
    const phoneProvided = String(formData.get('phoneProvided') ?? '').trim();
    const contactName = String(formData.get('contactName') ?? '').trim();

    if (!razonSocial) throw new Error('La razón social es obligatoria');
    if (taxId) {
      const err = validateTaxId(supplier.country, taxId);
      if (err) throw new Error(err);
    }

    await db.supplier.update({
      where: { id: supplier.id },
      data: {
        razonSocial,
        taxId: taxId || null,
        domicilio: domicilio || null,
        website: website || null,
        email: email || supplier.email,
        contactName: contactName || null,
        phoneProvided: phoneProvided || null,
        // Si había correcciones pendientes, el reenvío reinicia la validación
        ...(supplier.status === 'CORRECCIONES_SOLICITADAS'
          ? { status: 'DATOS_CARGADOS', correctionNote: null }
          : {}),
      },
    });

    const alerts = await checkTyposquatting(supplier.id, email || supplier.email, website);
    for (const a of alerts) await raiseRedFlag(supplier.id, 'TYPOSQUATTING', a);

    await audit({
      actorLabel: `Proveedor (portal): ${razonSocial}`,
      action: 'ACTUALIZACION_DATOS_PROVEEDOR',
      entityType: 'Supplier',
      entityId: supplier.id,
      supplierId: supplier.id,
      detail: 'El proveedor actualizó sus datos desde el portal',
    });
  } catch (e) {
    backTo(token, 'datos', e instanceof Error ? e.message : 'Error inesperado');
  }
  backTo(token, 'datos', undefined, 'Datos guardados correctamente');
}

/**
 * Proveedor: carga o modifica sus datos bancarios. Un cambio sobre una cuenta
 * ya validada dispara una alerta anti-BEC y reinicia el circuito de validación.
 */
export async function saveBankData(formData: FormData) {
  const token = String(formData.get('token'));
  try {
    const supplier = await getSupplierByToken(token);
    if (!supplier) throw new Error('Enlace inválido');

    const titular = String(formData.get('titular') ?? '').trim();
    if (!titular) throw new Error('Debe indicar el titular de la cuenta');
    if (!holderMatchesRazonSocial(titular, supplier.razonSocial)) {
      throw new Error(
        `El titular de la cuenta ("${titular}") no coincide con la razón social registrada ("${supplier.razonSocial}"). Por seguridad la cuenta debe estar a nombre del proveedor.`,
      );
    }

    const data: Record<string, string> = {};
    for (const k of ['cbu', 'aliasCbu', 'bankName', 'accountNumber', 'accountType', 'bankAddress', 'routingNumber']) {
      data[k] = String(formData.get(k) ?? '').trim();
    }
    const err = validateBank(supplier.country, data);
    if (err) throw new Error(err);

    const existing = await db.bankAccount.findFirst({ where: { supplierId: supplier.id, active: true } });
    if (existing) {
      await db.bankAccount.update({ where: { id: existing.id }, data: { active: false } });
      await raiseRedFlag(
        supplier.id,
        'CAMBIO_BANCARIO',
        `El proveedor modificó sus datos bancarios desde el portal (cuenta anterior en estado ${existing.status}). Se reinicia el circuito de validación anti-BEC.`,
      );
    }

    await db.bankAccount.create({
      data: {
        supplierId: supplier.id,
        titular,
        cbu: data.cbu || null,
        aliasCbu: data.aliasCbu || null,
        bankName: data.bankName || null,
        accountNumber: data.accountNumber || null,
        accountType: data.accountType || null,
        bankAddress: data.bankAddress || null,
        routingNumber: data.routingNumber || null,
      },
    });

    // Cargar/cambiar la cuenta bancaria (re)inicia el circuito de validación
    await db.supplier.update({ where: { id: supplier.id }, data: { status: 'DATOS_CARGADOS' } });

    await audit({
      actorLabel: `Proveedor (portal): ${supplier.razonSocial}`,
      action: existing ? 'CAMBIO_DATOS_BANCARIOS' : 'CARGA_DATOS_BANCARIOS',
      entityType: 'BankAccount',
      supplierId: supplier.id,
      detail: existing
        ? 'El proveedor MODIFICÓ sus datos bancarios (alerta anti-BEC generada)'
        : 'El proveedor cargó sus datos bancarios',
    });
  } catch (e) {
    backTo(token, 'datos', e instanceof Error ? e.message : 'Error inesperado');
  }
  backTo(token, 'datos', undefined, 'Datos bancarios guardados. Quedan pendientes de validación anti-fraude.');
}

/** Proveedor: sube documentos obligatorios (alta, constancias fiscales, W-9). */
export async function uploadSupplierDocument(formData: FormData) {
  const token = String(formData.get('token'));
  try {
    const supplier = await getSupplierByToken(token);
    if (!supplier) throw new Error('Enlace inválido');
    const file = formData.get('file') as File | null;
    const type = String(formData.get('type') ?? 'OTRO');
    if (!file || file.size === 0) throw new Error('Debe seleccionar un archivo');
    if (file.size > MAX_FILE_SIZE) throw new Error(MAX_FILE_MSG);

    await db.document.create({
      data: {
        supplierId: supplier.id,
        type,
        filename: file.name,
        data: encryptFile(Buffer.from(await file.arrayBuffer())),
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        uploadedBy: 'proveedor',
      },
    });
    if (supplier.status === 'CORRECCIONES_SOLICITADAS') {
      await db.supplier.update({
        where: { id: supplier.id },
        data: { status: 'DATOS_CARGADOS', correctionNote: null },
      });
    }
    await audit({
      actorLabel: `Proveedor (portal): ${supplier.razonSocial}`,
      action: 'CARGA_DOCUMENTO_PROVEEDOR',
      entityType: 'Document',
      supplierId: supplier.id,
      detail: `${type}: ${file.name}`,
    });
  } catch (e) {
    backTo(token, 'documentos', e instanceof Error ? e.message : 'Error inesperado');
  }
  backTo(token, 'documentos', undefined, 'Documento subido correctamente');
}

/** Proveedor: adjunta una factura / nota de crédito con sus datos. */
export async function createInvoice(formData: FormData) {
  const token = String(formData.get('token'));
  try {
    const supplier = await getSupplierByToken(token);
    if (!supplier) throw new Error('Enlace inválido');

    const kind = String(formData.get('kind') ?? 'FACTURA');
    const number = String(formData.get('number') ?? '').trim();
    const issueDate = String(formData.get('issueDate') ?? '');
    const dueDate = String(formData.get('dueDate') ?? '');
    const amount = parseFloat(String(formData.get('amount')));
    const currency = String(formData.get('currency') ?? 'ARS');
    const file = formData.get('file') as File | null;

    if (!number) throw new Error('Debe indicar el número de comprobante');
    if (!issueDate) throw new Error('Debe indicar la fecha de emisión');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Monto inválido');
    if (!file || file.size === 0) throw new Error('Debe adjuntar el comprobante (PDF/XML)');
    if (file.size > MAX_FILE_SIZE) throw new Error(MAX_FILE_MSG);
    const okType = /pdf|xml/.test(file.type) || /\.(pdf|xml)$/i.test(file.name);
    if (!okType) throw new Error('Solo se aceptan archivos PDF o XML');

    const invoice = await db.invoice.create({
      data: {
        supplierId: supplier.id,
        kind,
        number,
        issueDate: new Date(issueDate),
        dueDate: dueDate ? new Date(dueDate) : null,
        amount,
        currency,
      },
    });
    await db.document.create({
      data: {
        supplierId: supplier.id,
        invoiceId: invoice.id,
        type: 'FACTURA',
        filename: file.name,
        data: encryptFile(Buffer.from(await file.arrayBuffer())),
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        uploadedBy: 'proveedor',
      },
    });
    await audit({
      actorLabel: `Proveedor (portal): ${supplier.razonSocial}`,
      action: 'CARGA_FACTURA',
      entityType: 'Invoice',
      entityId: invoice.id,
      supplierId: supplier.id,
      detail: `${kind} ${number} por ${amount} ${currency}`,
    });
  } catch (e) {
    backTo(token, 'facturas', e instanceof Error ? e.message : 'Error inesperado');
  }
  backTo(token, 'facturas', undefined, 'Comprobante recibido correctamente');
}
