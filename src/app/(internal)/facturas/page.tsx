import Link from 'next/link';
import { db } from '@/lib/db';
import { INVOICE_STATUS_LABELS, countryName } from '@/lib/countries';
import { Flash, StatusBadge } from '@/components/Alerts';

export const dynamic = 'force-dynamic';

export default async function InvoicesOverviewPage({
  searchParams,
}: {
  searchParams: { error?: string; ok?: string };
}) {
  const suppliers = await db.supplier.findMany({
    where: { invoices: { some: {} } },
    include: { invoices: true },
    orderBy: { razonSocial: 'asc' },
  });

  const all = suppliers.flatMap((s) => s.invoices);
  const enCircuito = all.filter((i) => i.status !== 'PAGADA');
  const pagadas = all.filter((i) => i.status === 'PAGADA');
  const porPagar = all.filter((i) => ['APROBADA_PARA_PAGO', 'PROGRAMADA'].includes(i.status));

  return (
    <>
      <h1>Facturas y comprobantes</h1>
      <Flash searchParams={searchParams} />

      <div className="grid cols-4">
        <div className="card stat">
          <div className="num">{enCircuito.length}</div>
          <div className="label">En circuito</div>
        </div>
        <div className="card stat">
          <div className="num">{porPagar.length}</div>
          <div className="label">Listas para pagar</div>
        </div>
        <div className="card stat">
          <div className="num">{pagadas.length}</div>
          <div className="label">Pagadas</div>
        </div>
        <div className="card stat">
          <div className="num">
            {enCircuito.reduce((a, i) => a + i.amount, 0).toLocaleString('es-AR')}
          </div>
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
        )}
      </div>
    </>
  );
}
