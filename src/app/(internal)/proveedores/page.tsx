import Link from 'next/link';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { SUPPLIER_STATUS_LABELS, countryName } from '@/lib/countries';
import { Flash, StatusBadge } from '@/components/Alerts';

export const dynamic = 'force-dynamic';

export default async function SuppliersPage({ searchParams }: { searchParams: { error?: string; ok?: string } }) {
  const session = getSession();
  const suppliers = await db.supplier.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { redFlags: { where: { resolved: false } } } } },
  });

  return (
    <>
      <h1>Proveedores</h1>
      <Flash searchParams={searchParams} />
      {(session?.role === 'COMPRAS' || session?.role === 'ADMIN') && (
        <p>
          <Link className="btn" href="/proveedores/nuevo">
            + Solicitar alta de proveedor
          </Link>
        </p>
      )}
      <div className="card">
        {suppliers.length === 0 ? (
          <p className="muted">Aún no hay proveedores registrados.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Razón social</th>
                <th>País</th>
                <th>Tax ID</th>
                <th>Estado</th>
                <th>Alertas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td>{s.razonSocial}</td>
                  <td>{countryName(s.country)}</td>
                  <td>{s.taxId ?? '—'}</td>
                  <td><StatusBadge status={s.status} labels={SUPPLIER_STATUS_LABELS} /></td>
                  <td>{s._count.redFlags > 0 ? <span className="badge danger">🚩 {s._count.redFlags}</span> : '—'}</td>
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
