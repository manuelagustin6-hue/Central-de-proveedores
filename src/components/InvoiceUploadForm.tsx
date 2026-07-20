'use client';

import { useState } from 'react';
import { createInvoice } from '@/lib/actions/portal';
import { parseInvoiceXml } from '@/lib/xml-invoice';

/**
 * Formulario de carga de factura con lectura automática de XML.
 * Al seleccionar un XML de factura electrónica, extrae número, fecha, monto y
 * moneda y precarga los campos para que el proveedor los confirme antes de enviar.
 */
export function InvoiceUploadForm({ token, defaultCurrency }: { token: string; defaultCurrency: string }) {
  const [number, setNumber] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [autofilled, setAutofilled] = useState<string[]>([]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/\.xml$/i.test(file.name) && !/xml/.test(file.type)) {
      setAutofilled([]);
      return;
    }
    const text = await file.text();
    const data = parseInvoiceXml(text);
    const filled: string[] = [];
    if (data.number) { setNumber(data.number); filled.push('número'); }
    if (data.issueDate) { setIssueDate(data.issueDate); filled.push('fecha'); }
    if (data.dueDate) setDueDate(data.dueDate);
    if (data.amount) { setAmount(String(data.amount)); filled.push('monto'); }
    if (data.currency) { setCurrency(data.currency); filled.push('moneda'); }
    setAutofilled(filled);
  }

  return (
    <form action={createInvoice} className="stack">
      <input type="hidden" name="token" value={token} />
      <label>
        Tipo de comprobante
        <select name="kind">
          <option value="FACTURA">Factura</option>
          <option value="NOTA_CREDITO">Nota de crédito</option>
          <option value="RECIBO">Recibo</option>
        </select>
      </label>
      <label>
        Archivo (PDF o XML)
        <input type="file" name="file" accept=".pdf,.xml" required onChange={onFile} />
      </label>
      {autofilled.length > 0 && (
        <div className="alert ok" style={{ margin: 0 }}>
          ✓ Datos leídos del XML: {autofilled.join(', ')}. Revíselos y confirme antes de enviar.
        </div>
      )}
      <label>
        Número de comprobante
        <input name="number" required placeholder="0001-00001234" value={number} onChange={(e) => setNumber(e.target.value)} />
      </label>
      <label>
        Fecha de emisión
        <input type="date" name="issueDate" required value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
      </label>
      <label>
        Fecha de vencimiento
        <input type="date" name="dueDate" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </label>
      <label>
        Monto
        <input type="number" step="0.01" name="amount" required value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <label>
        Moneda
        <input name="currency" required value={currency} onChange={(e) => setCurrency(e.target.value)} />
      </label>
      <button type="submit">Enviar comprobante</button>
    </form>
  );
}
