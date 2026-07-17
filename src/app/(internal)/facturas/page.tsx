import Link from 'next/link';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { approveInvoice, scheduleInvoice, startReview, uploadPaymentReceipt } from '@/lib/actions/invoices';
import { INVOICE_STATUS_LABELS } from '@/lib/countries';
import { Flash, StatusBadge } from '@/components/Alerts';

export const dynamic = 'force-dynamic';

export default async function InvoicesPage({ searchParams }: { searchParams: { error?: string; ok?: string } }) {
  const session = getSession();
  const invoices = await db.invoice.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      supplier: true,
      documents: true,
      approvals: { include: { user: true } },
    },
  });
  const role = session?.role;
  const can = (...roles: string[]) => role === 'ADMIN' || roles.includes(role ?? '');

  return (
    <>
      <h1>Facturas y comprobantes</h1>
      <Flash searchParams={searchParams} />
      <p className="muted">
        Flujo: Recibida → En revisión → Aprobada para pago → Programada → Pagada. Las facturas de
        montos altos requieren doble aprobación según las reglas configuradas.
      </p>

      {invoices.length === 0 ? (
        <div className="card"><p className="muted">No hay comprobantes cargados.</p></div>
      ) : (
        invoices.map((inv) => (
          <div className="card" key={inv.id}>
            <h2>
              {inv.kind === 'NOTA_CREDITO' ? 'Nota de crédito' : inv.kind === 'RECIBO' ? 'Recibo' : 'Factura'}{' '}
              {inv.number} — <Link href={`/proveedores/${inv.supplierId}`}>{inv.supplier.razonSocial}</Link>{' '}
              <StatusBadge status={inv.status} labels={INVOICE_STATUS_LABELS} />
            </h2>
            <p className="muted">
              Emisión: {inv.issueDate.toLocaleDateString('es-AR')}
              {inv.dueDate ? ` · Vencimiento: ${inv.dueDate.toLocaleDateString('es-AR')}` : ''} · Monto:{' '}
              <strong>{inv.amount.toLocaleString('es-AR')} {inv.currency}</strong>
              {inv.approvals.length > 0 && (
                <> · Aprobada por: {inv.approvals.map((a) => a.user.name).join(', ')}</>
              )}
            </p>
            {inv.documents.length > 0 && (
              <p>
                Adjuntos:{' '}
                {inv.documents.map((d) => (
                  <span key={d.id} style={{ marginRight: 12 }}>
                    <a href={`/api/files/${d.id}`}>{d.filename}</a>{' '}
                    <span className="badge">{d.type}</span>
                  </span>
                ))}
              </p>
            )}

            <div className="inline" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
