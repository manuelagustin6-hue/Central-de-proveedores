import { db } from './db';
import { requireSession, Session } from './auth';

/**
 * Catálogo de permisos del sistema. El Admin asigna permisos a cada rol
 * desde la pantalla de Usuarios; ADMIN siempre tiene todos.
 * La segregación de funciones (no ejecutar dos pasos consecutivos sobre el
 * mismo proveedor) se aplica siempre, independientemente de los permisos.
 */
export const PERMISSIONS: { key: string; label: string }[] = [
  { key: 'PROVEEDOR_ALTA', label: 'Solicitar altas de proveedores y cargar documentación' },
  { key: 'VALIDACION_TELEFONICA', label: 'Registrar la validación telefónica (fuente independiente)' },
  { key: 'TRANSFERENCIA_PRUEBA', label: 'Registrar y confirmar transferencias de prueba' },
  { key: 'APROBACION_FINAL', label: 'Aprobación final, rechazo, correcciones y resolución de alertas' },
  { key: 'FACTURA_REVISION', label: 'Pasar facturas a revisión' },
  { key: 'FACTURA_APROBACION', label: 'Aprobar facturas para pago' },
  { key: 'PAGOS', label: 'Programar pagos y subir comprobantes de pago/retenciones' },
  { key: 'VER_AUDITORIA', label: 'Ver el registro completo de auditoría' },
];

export const DEFAULT_ROLE_PERMS: Record<string, string[]> = {
  COMPRAS: ['PROVEEDOR_ALTA', 'FACTURA_REVISION', 'FACTURA_APROBACION'],
  VALIDACION: ['VALIDACION_TELEFONICA'],
  TESORERIA: ['TRANSFERENCIA_PRUEBA', 'PAGOS'],
  AUDITORIA: ['APROBACION_FINAL', 'FACTURA_REVISION', 'FACTURA_APROBACION', 'VER_AUDITORIA'],
};

export const CONFIGURABLE_ROLES = ['COMPRAS', 'VALIDACION', 'TESORERIA', 'AUDITORIA'];

/** Permisos efectivos de un rol. ADMIN tiene todos. */
export async function getRolePerms(role: string): Promise<Set<string>> {
  if (role === 'ADMIN') return new Set(PERMISSIONS.map((p) => p.key));
  const rows = await db.rolePermission.findMany({ where: { role } });
  return new Set(rows.map((r) => r.permission));
}

/** Exige sesión activa con el permiso indicado (o rol ADMIN). */
export async function requirePermission(permission: string): Promise<Session> {
  const session = requireSession();
  if (session.role === 'ADMIN') return session;
  const perms = await getRolePerms(session.role);
  if (!perms.has(permission)) {
    const label = PERMISSIONS.find((p) => p.key === permission)?.label ?? permission;
    throw new Error(`Su rol no tiene el permiso requerido: ${label}`);
  }
  return session;
}
