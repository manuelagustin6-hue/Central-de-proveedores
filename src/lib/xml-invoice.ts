/**
 * Extractor de datos de facturas electrónicas en XML.
 * Best-effort sobre los formatos más comunes de Argentina (AFIP/ARCA) y
 * Uruguay (DGI/CFE): busca los campos por nombre de etiqueta de forma flexible
 * (sin importar mayúsculas, prefijos de namespace ni orden). Lo que no puede
 * determinar queda vacío para que la persona lo complete/confirme.
 */

export type ParsedInvoice = {
  number?: string;
  issueDate?: string; // yyyy-mm-dd
  dueDate?: string;
  amount?: number;
  currency?: string;
  taxId?: string;
};

/** Devuelve el contenido del primer tag cuyo nombre local coincida (case-insensitive). */
function tag(xml: string, ...names: string[]): string | undefined {
  for (const name of names) {
    // <ns:Name ...>valor</ns:Name> — ignora prefijo de namespace y atributos
    const re = new RegExp(`<(?:[\\w.-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`, 'i');
    const m = xml.match(re);
    if (m && m[1].trim()) return m[1].trim();
  }
  return undefined;
}

/** Normaliza fechas yyyymmdd, yyyy-mm-dd o dd/mm/yyyy a yyyy-mm-dd. */
function normalizeDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  let m = s.match(/^(\d{4})-?(\d{2})-?(\d{2})/); // yyyymmdd o yyyy-mm-dd
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); // dd/mm/yyyy
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return undefined;
}

/** Convierte "1.234.567,89" o "1234567.89" a número. */
function parseAmount(raw?: string): number | undefined {
  if (!raw) return undefined;
  let s = raw.trim().replace(/[^\d.,-]/g, '');
  if (s.includes(',') && s.includes('.')) {
    // el último separador es el decimal
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

const CURRENCY_MAP: Record<string, string> = {
  PES: 'ARS', ARS: 'ARS', DOL: 'USD', USD: 'USD', UYU: 'UYU', UYI: 'UYU', EUR: 'EUR',
};

export function parseInvoiceXml(xml: string): ParsedInvoice {
  const result: ParsedInvoice = {};

  // Número de comprobante: punto de venta + número, o número directo
  const ptoVta = tag(xml, 'PtoVta', 'PuntoVenta', 'Serie');
  const nro = tag(xml, 'CbteDesde', 'NroComprobante', 'NroCFE', 'Nro', 'Numero', 'NumeroComprobante');
  if (ptoVta && nro) {
    // Solo se rellena con ceros si el punto de venta es numérico (Argentina);
    // en Uruguay la serie es una letra y se deja tal cual.
    const pv = /^\d+$/.test(ptoVta) ? ptoVta.padStart(4, '0') : ptoVta;
    const n = /^\d+$/.test(nro) ? nro.padStart(8, '0') : nro;
    result.number = `${pv}-${n}`;
  } else if (nro) {
    result.number = nro;
  }

  result.issueDate = normalizeDate(
    tag(xml, 'CbteFch', 'FechaEmision', 'FchEmision', 'FchEmis', 'Fecha', 'FecEmis'),
  );
  result.dueDate = normalizeDate(tag(xml, 'FchVtoPago', 'FechaVencimiento', 'FchVenc', 'Vencimiento'));

  result.amount = parseAmount(
    tag(xml, 'ImpTotal', 'MntTotal', 'MontoTotal', 'Total', 'ImporteTotal', 'TotalMonto'),
  );

  const cur = tag(xml, 'MonId', 'Moneda', 'TpoMoneda', 'Currency', 'CodMoneda');
  if (cur) result.currency = CURRENCY_MAP[cur.toUpperCase()] ?? cur.toUpperCase();

  // Tax ID del emisor (CUIT / RUT). Se toma el primero disponible.
  const taxId = tag(xml, 'Cuit', 'CUIT', 'RUCEmisor', 'RutEmisor', 'DocNro', 'NroDoc', 'TaxID');
  if (taxId) result.taxId = taxId.replace(/[^\d]/g, '');

  return result;
}
