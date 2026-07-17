'use server';

import { redirect } from 'next/navigation';
import { db } from '../db';
import { requireRole } from '../auth';
import { audit } from '../audit';

function backTo(error?: string, ok?: string): never {
  const q = error ? `?error=${encodeURIComponent(error)}` : ok ? `?ok=${encodeURIComponent(ok)}` : '';
  redirect('/configuracion' + q);
}

/** Admin: crea una regla de doble aprobación por umbral. */
export async function createApprovalRule(formData: FormData) {
  try {
    const session = requireRole('ADMIN');
    const threshold = parseFloat(String(formData.get('threshold')));
    const requiredApprovals = parseInt(String(formData.get('requiredApprovals')), 10);
    const country = String(formData.get('country') ?? '') || null;
    if (!Number.isFinite(threshold) || threshold < 0) throw new Error('Umbral inválido');
    if (!Number.isInteger(requiredApprovals) || requiredApprovals < 1 || requiredApprovals > 5) {
      throw new Error('Las aprobaciones requeridas deben ser entre 1 y 5');
    }
    const rule = await db.approvalRule.create({
      data: { threshold, requiredApprovals, country: country === 'ALL' ? null : country },
    });
    await audit({
      session,
      action: 'CREACION_REGLA_APROBACION',
      entityType: 'ApprovalRule',
      entityId: rule.id,
      detail: `Umbral ${threshold} → ${requiredApprovals} aprobación(es) (${country ?? 'todos los países'})`,
    });
  } catch (e) {
    backTo(e instanceof Error ? e.message : 'Error inesperado');
  }
  backTo(undefined, 'Regla creada');
}

export async function deleteApprovalRule(formData: FormData) {
  try {
    const session = requireRole('ADMIN');
    const id = String(formData.get('id'));
    const rule = await db.approvalRule.delete({ where: { id } });
    await audit({
      session,
      action: 'ELIMINACION_REGLA_APROBACION',
      entityType: 'ApprovalRule',
      entityId: id,
      detail: `Umbral ${rule.threshold} → ${rule.requiredApprovals} aprobación(es)`,
    });
  } catch (e) {
    backTo(e instanceof Error ? e.message : 'Error inesperado');
  }
  backTo(undefined, 'Regla eliminada');
}
