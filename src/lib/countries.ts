export type Country = 'AR' | 'UY' | 'US';

export const COUNTRIES: Record<Country, { name: string; taxIdLabel: string; currency: string }> = {
  AR: { name: 'Argentina', taxIdLabel: 'CUIT', currency: 'ARS' },
  UY: { name: 'Uruguay', taxIdLabel: 'RUT', currency: 'UYU' },
  US: { name: 'Estados Unidos', taxIdLabel: 'EIN', currency: 'USD' },
};

// Documentos obligatorios por país. El formulario de alta no es un documento:
// son los datos que el proveedor completa directamente en el portal.
export const REQUIRED_DOCS: Record<Country, { type: string; label: string }[]> = {
  AR: [
    { type: 'FISCAL', label: 'Constancia de inscripción AFIP' },
    { type: 'BANCARIO', label: 'Constancia de CBU' },
  ],
  UY: [
    { type: 'FISCAL', label: 'Constancia de inscripción DGI' },
    { type: 'BANCARIO', label: 'Certificado bancario' },
  ],
  US: [{ type: 'W9', label: 'Formulario W-9' }],
};

/** Tipos de documento obligatorios que aún no fueron subidos. */
export function missingRequiredDocs(
  country: string,
  documents: { type: string }[],
): { type: string; label: string }[] {
  const uploaded = new Set(documents.map((d) => d.type));
  return (REQUIRED_DOCS[country as Country] ?? []).filter((d) => !uploaded.has(d.type));
}

export function countryName(code: string): string {
  return COUNTRIES[code as Country]?.name ?? code;
}

/** Validación básica del Tax ID por país. */
export function validateTaxId(country: string, taxId: string): string | null {
  const clean = taxId.replace(/[-.\s]/g, '');
  if (country === 'AR' && !/^\d{11}$/.test(clean)) return 'El CUIT debe tener 11 dígitos';
  if (country === 'UY' && !/^\d{12}$/.test(clean)) return 'El RUT debe tener 12 dígitos';
  if (country === 'US' && !/^\d{9}$/.test(clean)) return 'El EIN debe tener 9 dígitos';
  return null;
}

/** Validación de datos bancarios por país. */
export function validateBank(country: string, data: Record<string, string>): string | null {
  if (country === 'AR') {
    if (!/^\d{22}$/.test(data.cbu?.replace(/\s/g, '') ?? '')) return 'El CBU debe tener 22 dígitos';
  }
  if (country === 'UY') {
    if (!data.bankName) return 'Debe indicar el banco';
    if (!data.accountNumber) return 'Debe indicar el número de cuenta';
    if (!data.accountType) return 'Debe indicar el tipo de cuenta';
  }
  if (country === 'US') {
    if (!data.bankName) return 'Debe indicar Bank Name';
    if (!/^\d{9}$/.test(data.routingNumber ?? '')) return 'El Routing Number debe tener 9 dígitos';
    if (!data.accountNumber) return 'Debe indicar Account Number';
  }
  return null;
}

export const SUPPLIER_STATUS_LABELS: Record<string, string> = {
  PENDIENTE_DATOS: 'Pendiente de datos',
  DATOS_CARGADOS: 'Datos cargados',
  VALIDADO_TELEFONICAMENTE: 'Validado telefónicamente',
  PRUEBA_ENVIADA: 'Transferencia de prueba enviada',
  PRUEBA_CONFIRMADA: 'Transferencia confirmada',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  RECIBIDA: 'Recibida',
  EN_REVISION: 'En revisión',
  APROBADA_PARA_PAGO: 'Aprobada para pago',
  PROGRAMADA: 'Programada',
  PAGADA: 'Pagada',
};

export const INVOICE_FLOW = ['RECIBIDA', 'EN_REVISION', 'APROBADA_PARA_PAGO', 'PROGRAMADA', 'PAGADA'];
