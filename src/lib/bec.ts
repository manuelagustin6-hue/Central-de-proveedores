import { db } from './db';

/** Distancia de Levenshtein para detectar dominios similares (typosquatting). */
export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
}

export function extractDomain(input: string): string | null {
  if (!input) return null;
  let s = input.trim().toLowerCase();
  if (s.includes('@')) s = s.split('@')[1];
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  return s || null;
}

/**
 * Detección de typosquatting: compara el dominio del email del proveedor
 * contra el dominio de su sitio web oficial y contra los dominios de los
 * demás proveedores registrados. Una distancia 1-2 (sin ser idéntico)
 * es una señal típica de BEC.
 */
export async function checkTyposquatting(
  supplierId: string,
  email: string | null,
  website: string | null,
): Promise<string[]> {
  const alerts: string[] = [];
  const emailDomain = extractDomain(email ?? '');
  if (!emailDomain) return alerts;

  const webDomain = extractDomain(website ?? '');
  if (webDomain && emailDomain !== webDomain) {
    const d = levenshtein(emailDomain, webDomain);
    if (d <= 2) {
      alerts.push(
        `Posible typosquatting: el dominio del email (${emailDomain}) es muy similar pero NO idéntico al del sitio web oficial (${webDomain}).`,
      );
    }
  }

  const others = await db.supplier.findMany({
    where: { id: { not: supplierId }, email: { not: null } },
    select: { email: true, razonSocial: true },
  });
  for (const o of others) {
    const od = extractDomain(o.email ?? '');
    if (!od || od === emailDomain) continue;
    const d = levenshtein(emailDomain, od);
    if (d <= 1) {
      alerts.push(
        `Posible typosquatting: el dominio ${emailDomain} es casi idéntico al dominio ${od} del proveedor "${o.razonSocial}".`,
      );
    }
  }
  return alerts;
}

export async function raiseRedFlag(supplierId: string, type: string, message: string) {
  await db.redFlag.create({ data: { supplierId, type, message } });
}

/** Coincidencia flexible titular vs razón social (mayúsculas, puntuación, S.A./SRL, etc.). */
export function holderMatchesRazonSocial(titular: string, razonSocial: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\b(s\.?a\.?|s\.?r\.?l\.?|llc|inc|corp|ltda?)\b/g, '')
      .replace(/[^a-z0-9]/g, '');
  const a = norm(titular);
  const b = norm(razonSocial);
  return a === b || a.includes(b) || b.includes(a);
}

export function normalizePhone(p: string): string {
  return (p ?? '').replace(/[^0-9]/g, '').replace(/^0+/, '');
}
