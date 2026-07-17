import { headers } from 'next/headers';

/**
 * URL pública del sitio, derivada de la petición actual (host + protocolo).
 * Así los enlaces únicos de proveedores se arman siempre bien, sin depender
 * de que APP_URL esté configurada sin errores de tipeo.
 */
export function getBaseUrl(): string {
  const h = headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (host) {
    const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
    return `${proto}://${host}`;
  }
  return (process.env.APP_URL ?? '').trim().replace(/\/+$/, '');
}
