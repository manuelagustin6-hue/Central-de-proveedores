import Link from 'next/link';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { SUPPLIER_STATUS_LABELS, countryName } from '@/lib/countries';
import { Flash, StatusBadge } from '@/components/Alerts';
import { Pagination } from '@/components/Pagination';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: { error?: string; ok?: string; q?: string; estado?: string; pais?: string; page?: string };
}) {
  const session = getSession();
  const q = searchParams.q?.trim();
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);
  const where = {
    ...(q
      ? {
          OR: [
            { razonSocial: { contains: q, mode: 'insensitive' as const } },
            { taxId: { contains: q } },
            { email: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(searchParams.estado ? { status: searchParams.estado } : {}),
    ...(searchParams.pais ? { country: searchParams.pais } : {}),
  };
  const [total, suppliers] = await Promise.all([
    db.supplier.count({ where }),
    db.supplier.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { redFlags: { where: { resolved: false } } } } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

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
      <form className="inline card" style={{ padding: 12 }}>
        <input name="q" placeholder="Buscar por razón social, Tax ID o email…" defaultValue={q} style={{ flex: 2, minWidth: 200 }} />
        <select name="estado" defaultValue={searchParams.estado ?? ''}>
          <option value="">Todos los estados</option>
          {Object.entries(SUPPLIER_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select name="pais" defaultValue={searchParams.pais ?? ''}>
          <option value="">Todos los países</option>
          <option value="AR">Argentina</option>
          <option value="UY">Uruguay</option>
          <option value="US">Estados Unidos</option>
        </select>
        <button type="submit" className="secondary">Filtrar</button>
        {(q || searchParams.estado || searchParams.pais) && (
          <Link className="btn small" style={{ background: '#e8edf5', color: 'inherit' }} href="/proveedores">
            Limpiar
          </Link>
        )}
      </form>
      <div className="card">
        {suppliers.length === 0 ? (
          <p className="muted">
            {total === 0 && !q && !searchParams.estado && !searchParams.pais
              ? 'Aún no hay proveedores registrados.'
              : 'No hay proveedores que coincidan con la búsqueda.'}
          </p>
        ) : (
          <>
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
            <Pagination
              basePath="/proveedores"
              params={{ q, estado: searchParams.estado, pais: searchParams.pais }}
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
            />
          </>
        )}
      </div>
    </>
  );
}
