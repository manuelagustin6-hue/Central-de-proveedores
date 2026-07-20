'use client';

import { useState } from 'react';
import { uploadPaymentReceipt } from '@/lib/actions/invoices';

type Inv = { id: string; label: string; status: string; statusLabel: string };

/**
 * Pago en lote: Tesorería selecciona varias facturas y sube un único
 * comprobante que las cubre a todas, con opción de marcarlas pagadas.
 * Se muestra colapsado; se abre con un clic.
 */
export function BatchReceipt({ supplierId, invoices }: { supplierId: string; invoices: Inv[] }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setSel((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const all = () => setSel(new Set(invoices.map((i) => i.id)));
  const none = () => setSel(new Set());

  if (!open) {
    return (
      <div className="card" style={{ background: '#f4f4f4', borderColor: '#e0e0e0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <strong>Pago en lote</strong>
            <p className="muted" style={{ margin: '2px 0 0' }}>
              {invoices.length} factura(s) lista(s) para pagar. Subí un comprobante que cubra varias de una vez.
            </p>
          </div>
          <button type="button" onClick={() => setOpen(true)}>
            💳 Registrar pago de varias
          </button>
        </div>
      </div>
    );
  }

  const selectedPagables = invoices.filter((i) => sel.has(i.id) && i.status === 'PROGRAMADA').length;

  return (
    <form action={uploadPaymentReceipt} className="card" style={{ background: '#f4f4f4', borderColor: '#e0e0e0' }}>
      <input type="hidden" name="supplierId" value={supplierId} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Registrar pago de varias facturas</h2>
        <button type="button" className="small secondary" onClick={() => setOpen(false)}>Cerrar</button>
      </div>

      <p style={{ margin: '10px 0 4px' }}>
        <button type="button" className="small secondary" onClick={all}>Seleccionar todas</button>{' '}
        <button type="button" className="small secondary" onClick={none}>Ninguna</button>
        <span className="muted" style={{ marginLeft: 10 }}>{sel.size} seleccionada(s)</span>
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '8px 0' }}>
        {invoices.map((i) => (
          <label key={i.id} className="chk" style={{ padding: '4px 0' }}>
            <input type="checkbox" name="invoiceIds" value={i.id} checked={sel.has(i.id)} onChange={() => toggle(i.id)} />
            {i.label} <span className="badge">{i.statusLabel}</span>
          </label>
        ))}
      </div>

      <div className="grid cols-2" style={{ gap: 12 }}>
        <label>
          Tipo de comprobante
          <select name="type">
            <option value="RECIBO_PAGO">Recibo de pago</option>
            <option value="RETENCION">Certificado de retención</option>
          </select>
        </label>
        <label>
          Archivo (PDF)
          <input type="file" name="file" required />
        </label>
      </div>
      <label className="chk" style={{ marginTop: 8 }}>
        <input type="checkbox" name="markPaid" defaultChecked /> Marcar como pagadas las facturas programadas
        seleccionadas{selectedPagables > 0 ? ` (${selectedPagables})` : ''}
      </label>
      <p style={{ marginTop: 12 }}>
        <button type="submit" disabled={sel.size === 0}>Guardar comprobante para {sel.size} factura(s)</button>
      </p>
    </form>
  );
}
