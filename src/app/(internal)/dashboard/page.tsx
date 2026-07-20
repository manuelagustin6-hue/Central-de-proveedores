import Link from 'next/link';
import { db } from '@/lib/db';
import { SUPPLIER_STATUS_LABELS, countryName } from '@/lib/countries';
import { StatusBadge } from '@/components/Alerts';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [suppliers, pendingFlags, invoicesPending, invoicesPaid, recentFlags] = await Promise.all([
    db.supplier.count(),
    db.redFlag.count({ where: { resolved: false } }),
    db.invoice.count({ where: { status: { notIn: ['PAGADA'] } } }),
    db.invoice.count({ where: { status: 'PAGADA' } }),
    db.redFlag.findMany({
      where: { resolved: false },
      include: { supplier: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  const inProgress = await db.supplier.findMany({
    where: { status: { notIn: ['APROBADO', 'RECHAZADO'] } },
    orderBy: { updatedAt: 'desc' },
    take: 8,
  });

  return (
    <>
      <h1>Panel de control</h1>
      <div className="grid cols-4">
        <Link className="card stat" href="/proveedores" style={{ color: 'inherit' }}>
          <div className="num">{suppliers}</div>
          <div className="label">Proveedores</div>
        </Link>
        <div className="card stat">
          <div className="num" style={{ color: pendingFlags ? 'var(--danger)' : undefined }}>{pendingFlags}</div>
          <div className="label">Alertas BEC sin resolver</div>
        </div>
        <Link className="card stat" href="/facturas" style={{ color: 'inherit' }}>
          <div className="num">{invoicesPending}</div>
          <div className="label">Facturas en circuito</div>
        </Link>
        <Link className="card stat" href="/facturas" style={{ color: 'inherit' }}>
          <div className="num">{invoicesPaid}</div>
          <div className="label">Facturas pagadas</div>
        </Link>
      </div>

      {recentFlags.length > 0 && (
        <div className="card">
          <h2>🚩 Alertas de seguridad (Red Flags BEC)</h2>
          {recentFlags.map((f) => (
            <div key={f.id} className="alert redflag">
              <Link href={`/proveedores/${f.supplierId}`}>{f.supplier.razonSocial}</Link> — {f.message}
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2>Proveedores en circuito de validación</h2>
        {inProgress.length === 0 ? (
          <p className="muted">No hay proveedores en proceso.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Razón social</th>
                <th>País</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {inProgress.map((s) => (
                <tr key={s.id}>
                  <td>{s.razonSocial}</td>
                  <td>{countryName(s.country)}</td>
                  <td><StatusBadge status={s.status} labels={SUPPLIER_STATUS_LABELS} /></td>
                  <td><Link href={`/proveedores/${s.id}`}>Ver</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
