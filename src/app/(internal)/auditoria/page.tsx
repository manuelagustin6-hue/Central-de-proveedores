import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getRolePerms } from '@/lib/permissions';
import { Pagination } from '@/components/Pagination';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export default async function AuditPage({ searchParams }: { searchParams: { q?: string; page?: string } }) {
  const session = getSession();
  if (!session) redirect('/login');
  const perms = await getRolePerms(session.role);
  if (!perms.has('VER_AUDITORIA')) redirect('/dashboard');

  const q = searchParams.q?.trim();
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);
  const where = q
    ? {
        OR: [
          { action: { contains: q } },
          { actorLabel: { contains: q } },
          { detail: { contains: q } },
        ],
      }
    : {};
  const [total, logs] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { supplier: { select: { razonSocial: true } } },
    }),
  ]);

  return (
    <>
      <h1>Registro de auditoría</h1>
      <p className="muted">
        Trazabilidad imborrable: cada acción queda registrada con actor, fecha/hora e IP. La
        aplicación solo inserta registros; nunca los modifica ni elimina.
      </p>
      <form className="inline" style={{ marginBottom: 16 }}>
        <input name="q" placeholder="Buscar por acción, actor o detalle..." defaultValue={q} style={{ flex: 1 }} />
        <button type="submit" className="secondary">Buscar</button>
      </form>
      <div className="card">
        <table>
          <thead>
            <tr><th>Fecha y hora</th><th>Actor</th><th>Acción</th><th>Proveedor</th><th>Detalle</th><th>IP</th></tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{l.createdAt.toLocaleString('es-AR')}</td>
                <td>{l.actorLabel}</td>
                <td><span className="badge">{l.action}</span></td>
                <td>{l.supplier?.razonSocial ?? '—'}</td>
                <td>{l.detail ?? '—'}</td>
                <td className="mono">{l.ip ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination basePath="/auditoria" params={{ q }} page={page} pageSize={PAGE_SIZE} total={total} />
      </div>
    </>
  );
}
