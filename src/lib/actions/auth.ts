'use server';

import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { db } from '../db';
import { audit } from '../audit';
import { clearSessionCookie, createSessionToken, getSession, setSessionCookie, Role } from '../auth';

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '').toLowerCase().trim();
  const password = String(formData.get('password') ?? '');

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
    await audit({
      actorLabel: email || 'desconocido',
      action: 'LOGIN_FALLIDO',
      entityType: 'User',
      detail: 'Credenciales inválidas',
    });
    redirect('/login?error=' + encodeURIComponent('Credenciales inválidas'));
  }

  const token = createSessionToken({
    uid: user.id,
    email: user.email,
    name: user.name,
    role: user.role as Role,
  });
  setSessionCookie(token);
  await audit({
    session: { uid: user.id, email: user.email, name: user.name, role: user.role as Role, exp: 0 },
    action: 'LOGIN',
    entityType: 'User',
    entityId: user.id,
  });
  redirect('/dashboard');
}

export async function logout() {
  const s = getSession();
  if (s) await audit({ session: s, action: 'LOGOUT', entityType: 'User', entityId: s.uid });
  clearSessionCookie();
  redirect('/login');
}
