import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { approveInvoice, scheduleInvoice, startReview, uploadPaymentReceipt } from '@/lib/actions/invoices';
import { INVOICE_FLOW, INVOICE_STATUS_LABELS, SUPPLIER_STATUS_LABELS, countryName } from '@/lib/countries';
import { Flash, StatusBadge } from '@/components/Alerts';

export const dynamic = 'force-dynamic';

export default async function SupplierInvoicesPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string; ok?: string; estado?: string };
}) {
  const session = getSession();
  const supplier = await db.supplier.findUnique({
    where: { id: params.id },
    include: {
      invoices: {
        include: { documents: true, approvals: { include: { user: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!supplier || !session) notFound();

  const role = session.role;
  const can = (...roles: string[]) => role === 'ADMIN' || roles.includes(role);

  const estado = searchParams.estado;
  const invoices = estado ? supplier.invoices.filter((i) => i.status === estado) : supplier.invoices;
  const counts = supplier.invoices.reduce<Record<string, number>>((acc, i) => {
    acc[i.status] = (acc[i.status] ?? 0) + 1;
    return acc;
  }, {});
  const pendiente = supplier.invoices.filter((i) => i.status !== 'PAGADA').reduce((a, i) => a + i.amount, 0);
  const pagado = supplier.invoices.filter((i) => i.status === 'PAGADA').reduce((a, i) => a + i.amount, 0);
  const base = `/proveedores/${supplier.id}/facturas`;

  return (
    <>
      <p>
        <Link href="/facturas">← Facturas</Link> ·{' '}
        <Link href={`/proveedores/${supplier.id}`}>Ficha del proveedor</Link>
      </p>
      <h1>
        Facturas de {supplier.razonSocial}{' '}
        <StatusBadge status={supplier.status} labels={SUPPLIER_STATUS_LABELS} />
      </h1>
      <p className="muted">{countryName(supplier.country)}</p>
      <Flash searchParams={searchParams} />

      <div className="grid cols-4">
        <div className="card stat">
          <div className="num">{supplier.invoices.length}</div>
          <div className="label">Comprobantes</div>
        </div>
        <div className="card stat">
          <div className="num">{counts['PAGADA'] ?? 0}</div>
          <div className="label">Pagadas</div>
        </div>
        <div className="card stat">
          <div className="num">{pendiente.toLocaleString('es-AR')}</div>
          <div className="label">Pendiente de pago</div>
        </div>
        <div className="card stat">
          <div className="num">{pagado.toLocaleString('es-AR')}</div>
          <div className="label">Pagado</div>
        </div>
      </div>

      <div className="steps">
        <Link className={`step ${!estado ? 'current' : ''}`} href={base}>
          Todas ({supplier.invoices.length})
        </Link>
        {INVOICE_FLOW.map((s) => (
          <Link key={s} className={`step ${estado === s ? 'current' : ''}`} href={`${base}?estado=${s}`}>
            {INVOICE_STATUS_LABELS[s]} ({counts[s] ?? 0})
          </Link>
        ))}
      </div>

      {invoices.length === 0 ? (
        <div className="card">
          <p className="muted">No hay comprobantes {estado ? `en estado "${INVOICE_STATUS_LABELS[estado]}"` : ''}.</p>
        </div>
      ) : (
        invoices.map((inv) => (
          <div className="card" key={inv.id}>
            <h2>
              {inv.kind === 'NOTA_CREDITO' ? 'Nota de crédito' : inv.kind === 'RECIBO' ? 'Recibo' : 'Factura'}{' '}
              {inv.number} <StatusBadge status={inv.status} labels={INVOICE_STATUS_LABELS} />
            </h2>
            <p className="muted">
              Emisión: {inv.issueDate.toLocaleDateString('es-AR')}
              {inv.dueDate ? ` · Vencimiento: ${inv.dueDate.toLocaleDateString('es-AR')}` : ''} · Monto:{' '}
              <strong>
                {inv.amount.toLocaleString('es-AR')} {inv.currency}
              </strong>
              {inv.approvals.length > 0 && <> · Aprobada por: {inv.approvals.map((a) => a.user.name).join(', ')}</>}
            </p>
            {inv.documents.length > 0 && (
              <p>
                Adjuntos:{' '}
                {inv.documents.map((d) => (
                  <span key={d.id} style={{ marginRight: 12 }}>
                    <a href={`/api/files/${d.id}`}>{d.filename}</a> <span className="badge">{d.type}</span>
                  </span>
                ))}
              </p>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {inv.status === 'RECIBIDA' && can('COMPRAS', 'AUDITORIA') && (
                <form action={startReview}>
                  <input type="hidden" name="invoiceId" value={inv.id} />
                  <button className="small" type="submit">Pasar a revisión</button>
                </form>
              )}
              {inv.status === 'EN_REVISION' && can('COMPRAS', 'AUDITORIA') && (
                <form action={approveInvoice}>
                  <input type="hidden" name="invoiceId" value={inv.id} />
                  <button className="small" type="submit">Aprobar para pago</button>
                </form>
              )}
              {inv.status === 'APROBADA_PARA_PAGO' && can('TESORERIA') && (
                <form action={scheduleInvoice}>
                  <input type="hidden" name="invoiceId" value={inv.id} />
                  <button className="small" type="submit">Programar pago</button>
                </form>
              )}
            </div>

            {['PROGRAMADA', 'PAGADA'].includes(inv.status) && can('TESORERIA') && (
              <>
                <h3>Subir comprobante de pago / retención (Tesorería)</h3>
                <form action={uploadPaymentReceipt} className="inline">
                  <input type="hidden" name="invoiceId" value={inv.id} />
                  <label>
                    Tipo
                    <select name="type">
                      <option value="RECIBO_PAGO">Recibo de pago</option>
                      <option value="RETENCION">Certificado de retención</option>
                    </select>
                  </label>
                  <label>
                    Archivo
                    <input type="file" name="file" required />
                  </label>
                  {inv.status === 'PROGRAMADA' && (
                    <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <input type="checkbox" name="markPaid" /> Marcar como pagada
                    </label>
                  )}
                  <button className="small" type="submit">Subir</button>
                </form>
              </>
            )}
          </div>
        ))
      )}
    </>
  );
}
