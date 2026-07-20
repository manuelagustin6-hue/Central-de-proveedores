'use client';

import { useState } from 'react';
import { uploadPaymentReceipt } from '@/lib/actions/invoices';

/**
 * Carga de comprobante inline para una factura (Tesorería). Se despliega bajo
 * la factura con un clic, sin ir a otro formulario. Permite marcar la factura
 * como pagada en el mismo paso.
 */
export function PaymentUpload({
  supplierId,
  invoiceId,
  invoiceNumber,
  canMarkPaid,
}: {
  supplierId: string;
  invoiceId: string;
  invoiceNumber: string;
  canMarkPaid: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button className="small" type="button" onClick={() => setOpen(true)}>
        📎 Cargar comprobante de pago
      </button>
    );
  }

  return (
    <form action={uploadPaymentReceipt} className="inline-pay">
      <input type="hidden" name="supplierId" value={supplierId} />
      <input type="hidden" name="invoiceIds" value={invoiceId} />
      <strong style={{ fontSize: 13 }}>Comprobante para {invoiceNumber}</strong>
      <div className="inline-pay-row">
        <select name="type">
          <option value="RECIBO_PAGO">Recibo de pago</option>
          <option value="RETENCION">Certificado de retención</option>
        </select>
        <input type="file" name="file" required />
      </div>
      {canMarkPaid && (
        <label className="chk">
          <input type="checkbox" name="markPaid" defaultChecked /> Marcar la factura como pagada
        </label>
      )}
      <div className="inline-pay-row">
        <button className="small" type="submit">Guardar comprobante</button>
        <button className="small secondary" type="button" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
