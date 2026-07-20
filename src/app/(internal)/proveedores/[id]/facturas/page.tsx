import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getRolePerms } from '@/lib/permissions';
import { approveInvoice, scheduleInvoice, startReview } from '@/lib/actions/invoices';
import { INVOICE_FLOW, INVOICE_STATUS_LABELS, SUPPLIER_STATUS_LABELS, countryName } from '@/lib/countries';
import { Flash, StatusBadge } from '@/components/Alerts';
import { PaymentUpload } from '@/components/InvoiceActions';
import { BatchReceipt } from '@/components/BatchReceipt';

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
        include: {
          documents: { select: { id: true, filename: true, type: true } },
          documentLinks: { include: { document: { select: { id: true, filename: true, type: true } } } },
          approvals: { include: { user: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!supplier || !session) notFound();

  const perms = await getRolePerms(session.role);
  const can = (perm: string) => perms.has(perm);

  const estado = searchParams.estado;
  const invoices = estado ? supplier.invoices.filter((i) => i.status === estado) : supplier.invoices;
  const counts = supplier.invoices.reduce<Record<string, number>>((acc, i) => {
    acc[i.status] = (acc[i.status] ?? 0) + 1;
    return acc;
  }, {});
  const pendiente = supplier.invoices.filter((i) => i.status !== 'PAGADA').reduce((a, i) => a + i.amount, 0);
  const pagado = supplier.invoices.filter((i) => i.status === 'PAGADA').reduce((a, i) => a + i.amount, 0);
  const base = `/proveedores/${supplier.id}/facturas`;

  // Facturas que Tesorería puede pagar en lote (aprobadas/programadas)
  const pagables = supplier.invoices.filter((i) => ['APROBADA_PARA_PAGO', 'PROGRAMADA'].includes(i.status));

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

      {can('PAGOS') && pagables.length > 0 && (
        <BatchReceipt
          supplierId={supplier.id}
          invoices={pagables.map((i) => ({
            id: i.id,
            label: `${i.kind === 'NOTA_CREDITO' ? 'NC' : 'Factura'} ${i.number} — ${i.amount.toLocaleString('es-AR')} ${i.currency}`,
            status: i.status,
            statusLabel: INVOICE_STATUS_LABELS[i.status],
          }))}
        />
      )}

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
        invoices.map((inv) => {
          const pagos = [...inv.documents, ...inv.documentLinks.map((l) => l.document)].filter(
            (d) => d.type === 'RECIBO_PAGO' || d.type === 'RETENCION',
          );
          const comprobantes = [...inv.documents, ...inv.documentLinks.map((l) => l.document)].filter(
            (d) => d.type === 'FACTURA',
          );
          return (
            <div className="card invoice-card" key={inv.id}>
              <div className="invoice-head">
                <div>
                  <h2 style={{ margin: 0 }}>
                    {inv.kind === 'NOTA_CREDITO' ? 'Nota de crédito' : inv.kind === 'RECIBO' ? 'Recibo' : 'Factura'}{' '}
                    {inv.number}
                  </h2>
                  <p className="muted" style={{ margin: '4px 0 0' }}>
                    Emisión: {inv.issueDate.toLocaleDateString('es-AR')}
                    {inv.dueDate ? ` · Vence: ${inv.dueDate.toLocaleDateString('es-AR')}` : ''}
                    {inv.approvals.length > 0 && ` · Aprobó: ${inv.approvals.map((a) => a.user.name).join(', ')}`}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>
                    {inv.amount.toLocaleString('es-AR')} {inv.currency}
                  </div>
                  <StatusBadge status={inv.status} labels={INVOICE_STATUS_LABELS} />
                </div>
              </div>

              <p style={{ margin: '10px 0 0', fontSize: 13 }}>
                {comprobantes.map((d) => (
                  <span key={d.id} style={{ marginRight: 12 }}>
                    📄 <a href={`/api/files/${d.id}`}>{d.filename}</a>
                  </span>
                ))}
                {pagos.map((d) => (
                  <span key={d.id} style={{ marginRight: 12 }}>
                    <a href={`/api/files/${d.id}`}>⬇ {d.filename}</a>{' '}
                    <span className="badge">{d.type === 'RETENCION' ? 'Retención' : 'Recibo'}</span>
                  </span>
                ))}
              </p>

              <div className="invoice-actions">
                {inv.status === 'RECIBIDA' && can('FACTURA_REVISION') && (
                  <form action={startReview}>
                    <input type="hidden" name="invoiceId" value={inv.id} />
                    <button className="small" type="submit">Pasar a revisión</button>
                  </form>
                )}
                {inv.status === 'EN_REVISION' && can('FACTURA_APROBACION') && (
                  <form action={approveInvoice}>
                    <input type="hidden" name="invoiceId" value={inv.id} />
                    <button className="small" type="submit">✓ Aprobar para pago</button>
                  </form>
                )}
                {inv.status === 'APROBADA_PARA_PAGO' && can('PAGOS') && (
                  <form action={scheduleInvoice}>
                    <input type="hidden" name="invoiceId" value={inv.id} />
                    <button className="small" type="submit">📅 Programar pago</button>
                  </form>
                )}
                {['PROGRAMADA', 'PAGADA'].includes(inv.status) && can('PAGOS') && (
                  <PaymentUpload
                    supplierId={supplier.id}
                    invoiceId={inv.id}
                    invoiceNumber={inv.number}
                    canMarkPaid={inv.status === 'PROGRAMADA'}
                  />
                )}
                {inv.status === 'PAGADA' && <span className="badge ok">✓ Pagada</span>}
              </div>
            </div>
          );
        })
      )}
    </>
  );
}
