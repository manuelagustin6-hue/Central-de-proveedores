import { createHmac, timingSafeEqual } from 'crypto';
import { cookies, headers } from 'next/headers';
import { db } from './db';

const SECRET = process.env.SESSION_SECRET || 'dev-secret';
const COOKIE = 'cdp_session';
const MAX_AGE = 60 * 60 * 8; // 8 horas

export type Role = 'COMPRAS' | 'VALIDACION' | 'TESORERIA' | 'AUDITORIA' | 'ADMIN';

export type Session = { uid: string; email: string; name: string; role: Role; exp: number };

function sign(payload: string): string {
  return createHmac('sha256', SECRET).update(payload).digest('base64url');
}

export function createSessionToken(s: Omit<Session, 'exp'>): string {
  const payload = Buffer.from(
    JSON.stringify({ ...s, exp: Math.floor(Date.now() / 1000) + MAX_AGE }),
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string): Session | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Session;
    if (session.exp < Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

export function getSession(): Session | null {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export function requireSession(): Session {
  const s = getSession();
  if (!s) throw new Error('No autenticado');
  return s;
}

export function requireRole(...roles: Role[]): Session {
  const s = requireSession();
  if (s.role !== 'ADMIN' && !roles.includes(s.role)) {
    throw new Error(`Acción no permitida para el rol ${s.role}`);
  }
  return s;
}

export function setSessionCookie(token: string) {
  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE,
    path: '/',
  });
}

export function clearSessionCookie() {
  cookies().delete(COOKIE);
}

export function getClientIp(): string {
  const h = headers();
  return (
    h.get('x-forwarded-for')?.split(',')[0].trim() ||
    h.get('x-real-ip') ||
    'desconocida'
  );
}

/** Valida el enlace único de un proveedor (portal de autogestión). */
export async function getSupplierByToken(token: string) {
  if (!token || token.length < 20) return null;
  return db.supplier.findUnique({ where: { accessToken: token } });
}
