'use server';

import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { db } from '../db';
import { requireRole, requireSession } from '../auth';
import { audit } from '../audit';

const ROLES = ['COMPRAS', 'VALIDACION', 'TESORERIA', 'AUDITORIA', 'ADMIN'];

function backTo(path: string, error?: string, ok?: string): never {
  const q = error ? `?error=${encodeURIComponent(error)}` : ok ? `?ok=${encodeURIComponent(ok)}` : '';
  redirect(path + q);
}

function validatePassword(p: string) {
  if (p.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
}

/** Admin: crea un usuario interno con su rol. */
export async function createUser(formData: FormData) {
  try {
    const session = requireRole('ADMIN');
    const name = String(formData.get('name') ?? '').trim();
    const email = String(formData.get('email') ?? '').trim().toLowerCase();
    const role = String(formData.get('role') ?? '');
    const password = String(formData.get('password') ?? '');

    if (!name) throw new Error('Debe indicar el nombre');
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Email inválido');
    if (!ROLES.includes(role)) throw new Error('Rol inválido');
    validatePassword(password);
    if (await db.user.findUnique({ where: { email } })) {
      throw new Error('Ya existe un usuario con ese email');
    }

    const user = await db.user.create({
      data: { name, email, role, passwordHash: await bcrypt.hash(password, 10) },
    });
    await audit({
      session,
      action: 'ALTA_USUARIO',
      entityType: 'User',
      entityId: user.id,
      detail: `Alta de ${name} <${email}> con rol ${role}`,
    });
  } catch (e) {
    backTo('/usuarios', e instanceof Error ? e.message : 'Error inesperado');
  }
  backTo('/usuarios', undefined, 'Usuario creado');
}

/** Admin: cambia el rol de un usuario (no el propio, para no perder acceso). */
export async function setUserRole(formData: FormData) {
  try {
    const session = requireRole('ADMIN');
    const userId = String(formData.get('userId'));
    const role = String(formData.get('role') ?? '');
    if (!ROLES.includes(role)) throw new Error('Rol inválido');
    if (userId === session.uid) throw new Error('No puede cambiar su propio rol');

    const user = await db.user.update({ where: { id: userId }, data: { role } });
    await audit({
      session,
      action: 'CAMBIO_ROL_USUARIO',
      entityType: 'User',
      entityId: userId,
      detail: `${user.email} pasa a rol ${role}`,
    });
  } catch (e) {
    backTo('/usuarios', e instanceof Error ? e.message : 'Error inesperado');
  }
  backTo('/usuarios', undefined, 'Rol actualizado');
}

/** Admin: activa o desactiva un usuario (nunca a sí mismo ni al último admin). */
export async function toggleUserActive(formData: FormData) {
  let msg = 'Usuario actualizado';
  try {
    const session = requireRole('ADMIN');
    const userId = String(formData.get('userId'));
    if (userId === session.uid) throw new Error('No puede desactivarse a sí mismo');

    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.active && user.role === 'ADMIN') {
      const otherAdmins = await db.user.count({
        where: { role: 'ADMIN', active: true, id: { not: userId } },
      });
      if (otherAdmins === 0) throw new Error('No se puede desactivar al único administrador activo');
    }

    await db.user.update({ where: { id: userId }, data: { active: !user.active } });
    msg = user.active ? 'Usuario desactivado' : 'Usuario reactivado';
    await audit({
      session,
      action: user.active ? 'DESACTIVACION_USUARIO' : 'REACTIVACION_USUARIO',
      entityType: 'User',
      entityId: userId,
      detail: user.email,
    });
  } catch (e) {
    backTo('/usuarios', e instanceof Error ? e.message : 'Error inesperado');
  }
  backTo('/usuarios', undefined, msg);
}

/** Admin: asigna una nueva contraseña a un usuario. */
export async function adminResetPassword(formData: FormData) {
  try {
    const session = requireRole('ADMIN');
    const userId = String(formData.get('userId'));
    const password = String(formData.get('password') ?? '');
    validatePassword(password);

    const user = await db.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(password, 10) },
    });
    await audit({
      session,
      action: 'RESETEO_PASSWORD',
      entityType: 'User',
      entityId: userId,
      detail: `Reseteo de contraseña de ${user.email}`,
    });
  } catch (e) {
    backTo('/usuarios', e instanceof Error ? e.message : 'Error inesperado');
  }
  backTo('/usuarios', undefined, 'Contraseña actualizada');
}

/** Cualquier usuario: cambia su propia contraseña verificando la actual. */
export async function changeOwnPassword(formData: FormData) {
  try {
    const session = requireSession();
    const current = String(formData.get('current') ?? '');
    const password = String(formData.get('password') ?? '');
    const confirm = String(formData.get('confirm') ?? '');
    validatePassword(password);
    if (password !== confirm) throw new Error('La nueva contraseña y su confirmación no coinciden');

    const user = await db.user.findUniqueOrThrow({ where: { id: session.uid } });
    if (!(await bcrypt.compare(current, user.passwordHash))) {
      throw new Error('La contraseña actual es incorrecta');
    }

    await db.user.update({
      where: { id: session.uid },
      data: { passwordHash: await bcrypt.hash(password, 10) },
    });
    await audit({
      session,
      action: 'CAMBIO_PASSWORD',
      entityType: 'User',
      entityId: session.uid,
    });
  } catch (e) {
    backTo('/perfil', e instanceof Error ? e.message : 'Error inesperado');
  }
  backTo('/perfil', undefined, 'Contraseña cambiada correctamente');
}
