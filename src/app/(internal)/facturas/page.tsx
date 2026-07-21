import Link from 'next/link';
import { db } from '@/lib/db';
import { INVOICE_STATUS_LABELS, countryName } from '@/lib/countries';
import { Flash, StatusBadge } from '@/components/Alerts';
import { Pagination } from '@/components/Pagination';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

export default async function InvoicesOverviewPage({
  searchParams,
}: {
  searchParams: { error?: string; ok?: string; page?: string };
}) {
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);

  // Totales globales por estado sin traer todas las facturas a memoria
  const grouped = await db.invoice.groupBy({ by: ['status'], _count: { _all: true } });
  const countBy = (s: string) => grouped.find((g) => g.status === s)?._count._all ?? 0;
  const pagadas = countBy('PAGADA');
  const porPagar = countBy('APROBADA_PARA_PAGO') + countBy('PROGRAMADA');
  const enCircuito = grouped.filter((g) => g.status !== 'PAGADA').reduce((a, g) => a + g._count._all, 0);
  const pendienteAgg = await db.invoice.aggregate({
    _sum: { amount: true },
    where: { status: { not: 'PAGADA' } },
  });

  // Proveedores con facturas, paginados; se consultan solo las facturas de esta página
  const where = { invoices: { some: {} } };
  const [total, suppliers] = await Promise.all([
    db.supplier.count({ where }),
    db.supplier.findMany({
      where,
      orderBy: { razonSocial: 'asc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        invoices: { select: { status: true, amount: true, currency: true } },
      },
    }),
  ]);

  return (
    <>
      <h1>Facturas y comprobantes</h1>
      <Flash searchParams={searchParams} />

      <div className="grid cols-4">
        <div className="card stat">
          <div className="num">{enCircuito}</div>
          <div className="label">En circuito</div>
        </div>
        <div className="card stat">
          <div className="num">{porPagar}</div>
          <div className="label">Listas para pagar</div>
        </div>
        <div className="card stat">
          <div className="num">{pagadas}</div>
          <div className="label">Pagadas</div>
        </div>
        <div className="card stat">
          <div className="num">{(pendienteAgg._sum.amount ?? 0).toLocaleString('es-AR')}</div>
          <div className="label">Monto pendiente (todas las monedas)</div>
        </div>
      </div>

      <div className="card">
        <h2>Por proveedor</h2>
        {suppliers.length === 0 ? (
          <p className="muted">
            Todavía no hay comprobantes cargados. Los proveedores aprobados cargan sus facturas desde
            su portal.
          </p>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th>País</th>
                  <th>Comprobantes</th>
                  <th>Pendiente de pago</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => {
                  const counts = s.invoices.reduce<Record<string, number>>((acc, i) => {
                    acc[i.status] = (acc[i.status] ?? 0) + 1;
                    return acc;
                  }, {});
                  const pendiente = s.invoices
                    .filter((i) => i.status !== 'PAGADA')
                    .reduce((a, i) => a + i.amount, 0);
                  return (
                    <tr key={s.id}>
                      <td>
                        <Link href={`/proveedores/${s.id}/facturas`}>
                          <strong>{s.razonSocial}</strong>
                        </Link>
                      </td>
                      <td>{countryName(s.country)}</td>
                      <td>
                        {Object.entries(counts).map(([status, n]) => (
                          <span key={status} style={{ marginRight: 6 }}>
                            <StatusBadge status={status} labels={INVOICE_STATUS_LABELS} /> ×{n}
                          </span>
                        ))}
                      </td>
                      <td>
                        {pendiente > 0
                          ? `${pendiente.toLocaleString('es-AR')} ${s.invoices[0]?.currency ?? ''}`
                          : '—'}
                      </td>
                      <td>
                        <Link className="btn small" href={`/proveedores/${s.id}/facturas`}>
                          Gestionar
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination basePath="/facturas" params={{}} page={page} pageSize={PAGE_SIZE} total={total} />
          </>
        )}
      </div>
    </>
  );
}
