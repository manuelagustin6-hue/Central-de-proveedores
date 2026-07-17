import { db } from './db';
import { getClientIp, Session } from './auth';

type AuditInput = {
  session?: Session | null;
  actorLabel?: string; // para el proveedor externo
  action: string;
  entityType: string;
  entityId?: string;
  supplierId?: string;
  detail?: string;
};

/**
 * Trazabilidad imborrable: cada acción queda registrada con actor, fecha/hora e IP.
 * La aplicación nunca actualiza ni elimina filas de AuditLog.
 */
export async function audit(input: AuditInput) {
  await db.auditLog.create({
    data: {
      userId: input.session?.uid ?? null,
      actorLabel: input.actorLabel ?? (input.session ? `${input.session.name} <${input.session.email}>` : 'Sistema'),
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      supplierId: input.supplierId,
      detail: input.detail,
      ip: getClientIp(),
    },
  });
}

/**
 * Segregación de funciones: ningún usuario puede ejecutar dos acciones
 * críticas consecutivas sobre el mismo proveedor. Se compara al actor
 * actual contra el último evento crítico registrado del proveedor.
 */
const CRITICAL_ACTIONS = [
  'ALTA_PROVEEDOR',
  'VALIDACION_TELEFONICA',
  'TRANSFERENCIA_PRUEBA',
  'CONFIRMACION_TRANSFERENCIA',
  'APROBACION_FINAL',
];

export async function assertSegregation(supplierId: string, session: Session) {
  const last = await db.auditLog.findFirst({
    where: { supplierId, action: { in: CRITICAL_ACTIONS } },
    orderBy: { createdAt: 'desc' },
  });
  if (last && last.userId === session.uid) {
    throw new Error(
      'Segregación de funciones: no puede ejecutar dos acciones consecutivas sobre el mismo proveedor. ' +
        `La acción anterior (${last.action}) fue realizada por usted.`,
    );
  }
}
