import { db } from '@/lib/db';
import { getSupplierByToken } from '@/lib/auth';
import {
  createInvoice,
  saveBankData,
  updateSupplierData,
  uploadSupplierDocument,
} from '@/lib/actions/portal';
import { COUNTRIES, Country, INVOICE_STATUS_LABELS, SUPPLIER_STATUS_LABELS } from '@/lib/countries';
import { Flash, StatusBadge } from '@/components/Alerts';

export const dynamic = 'force-dynamic';

export default async function PortalPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { error?: string; ok?: string };
}) {
  const supplier = await getSupplierByToken(params.token);
  if (!supplier) {
    return (
      <main className="container">
        <div className="card">
          <h1>Enlace inválido</h1>
          <p>El enlace de acceso no es válido o fue revocado. Contacte a su comprador.</p>
        </div>
      </main>
    );
  }

  const country = COUNTRIES[supplier.country as Country];
  const token = params.token;
  const [activeAccount, documents, invoices] = await Promise.all([
    db.bankAccount.findFirst({ where: { supplierId: supplier.id, active: true } }),
    db.document.findMany({
      where: { supplierId: supplier.id, uploadedBy: 'proveedor', invoiceId: null },
      orderBy: { createdAt: 'desc' },
    }),
    db.invoice.findMany({
      where: { supplierId: supplier.id },
      include: { documents: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return (
    <>
      <header className="portal-header">
        <h1>Portal de Proveedores — {supplier.razonSocial}</h1>
        <p className="muted">
          {country.name} · Estado de su alta:{' '}
          <StatusBadge status={supplier.status} labels={SUPPLIER_STATUS_LABELS} />
        </p>
      </header>
      <main className="container">
        <Flash searchParams={searchParams} />

        <div className="grid cols-2">
          <div className="card">
            <h2>1. Datos de la empresa</h2>
            <form action={updateSupplierData} className="stack">
              <input type="hidden" name="token" value={token} />
              <label>
                Razón social
                <input name="razonSocial" defaultValue={supplier.razonSocial} required />
              </label>
              <label>
                {country.taxIdLabel}
                <input name="taxId" defaultValue={supplier.taxId ?? ''} required />
              </label>
              <label>
                Domicilio
                <input name="domicilio" defaultValue={supplier.domicilio ?? ''} required />
              </label>
              <label>
                Sitio web oficial
                <input name="website" defaultValue={supplier.website ?? ''} placeholder="https://..." />
              </label>
              <label>
                Email de contacto
                <input type="email" name="email" defaultValue={supplier.email ?? ''} required />
              </label>
              <label>
                Teléfono de contacto
                <input name="phoneProvided" defaultValue={supplier.phoneProvided ?? ''} />
              </label>
              <button type="submit">Guardar datos</button>
            </form>
          </div>

          <div className="card">
            <h2>2. Datos bancarios</h2>
            <p className="muted">
              El titular debe coincidir con la razón social. Todo cambio de cuenta reinicia el proceso
              de verificación anti-fraude.
            </p>
            <form action={saveBankData} className="stack">
              <input type="hidden" name="token" value={token} />
              <label>
                Titular de la cuenta
                <input name="titular" defaultValue={activeAccount?.titular ?? supplier.razonSocial} required />
              </label>
              {supplier.country === 'AR' && (
                <>
                  <label>
                    CBU (22 dígitos)
                    <input name="cbu" defaultValue={activeAccount?.cbu ?? ''} required />
                  </label>
                  <label>
                    Alias CBU
                    <input name="aliasCbu" defaultValue={activeAccount?.aliasCbu ?? ''} />
                  </label>
                </>
              )}
              {supplier.country === 'UY' && (
                <>
                  <label>
                    Banco
                    <input name="bankName" defaultValue={activeAccount?.bankName ?? ''} required />
                  </label>
                  <label>
                    Número de cuenta
                    <input name="accountNumber" defaultValue={activeAccount?.accountNumber ?? ''} required />
                  </label>
                  <label>
                    Tipo de cuenta
                    <select name="accountType" defaultValue={activeAccount?.accountType ?? 'Caja de ahorro'}>
                      <option>Caja de ahorro</option>
                      <option>Cuenta corriente</option>
                    </select>
                  </label>
                </>
              )}
              {supplier.country === 'US' && (
                <>
                  <label>
                    Bank Name
                    <input name="bankName" defaultValue={activeAccount?.bankName ?? ''} required />
                  </label>
                  <label>
                    Bank Address
                    <input name="bankAddress" defaultValue={activeAccount?.bankAddress ?? ''} required />
                  </label>
                  <label>
                    Routing Number (9 dígitos)
                    <input name="routingNumber" defaultValue={activeAccount?.routingNumber ?? ''} required />
                  </label>
                  <label>
                    Account Number
                    <input name="accountNumber" defaultValue={activeAccount?.accountNumber ?? ''} required />
                  </label>
                </>
              )}
              <button type="submit">Guardar datos bancarios</button>
            </form>
          </div>
        </div>

        <div className="card">
          <h2>3. Documentación obligatoria ({country.name})</h2>
          <p className="muted">Requeridos: {country.docs.join(' · ')}. Los archivos se almacenan encriptados.</p>
          <form action={uploadSupplierDocument} className="inline">
            <input type="hidden" name="token" value={token} />
            <label>
              Tipo de documento
              <select name="type">
                <option value="ALTA">Formulario de alta</option>
                {supplier.country === 'US' ? (
                  <option value="W9">W-9</option>
                ) : (
                  <option value="FISCAL">Constancia fiscal</option>
                )}
                <option value="OTRO">Otro</option>
              </select>
            </label>
            <label>
              Archivo
              <input type="file" name="file" required />
            </label>
            <button type="submit">Subir</button>
          </form>
          {documents.length > 0 && (
            <table style={{ marginTop: 12 }}>
              <thead>
                <tr><th>Tipo</th><th>Archivo</th><th>Fecha</th></tr>
              </thead>
              <tbody>
                {documents.map((d) => (
                  <tr key={d.id}>
                    <td>{d.type}</td>
                    <td><a href={`/api/files/${d.id}?token=${token}`}>{d.filename}</a></td>
                    <td>{d.createdAt.toLocaleDateString('es-AR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2>4. Cargar factura / nota de crédito</h2>
          {supplier.status !== 'APROBADO' ? (
            <p className="muted">
              Podrá cargar facturas cuando su alta esté aprobada por nuestro equipo de verificación.
            </p>
          ) : (
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
                Número de comprobante
                <input name="number" required placeholder="0001-00001234" />
              </label>
              <label>
                Fecha de emisión
                <input type="date" name="issueDate" required />
              </label>
              <label>
                Fecha de vencimiento
                <input type="date" name="dueDate" />
              </label>
              <label>
                Monto
                <input type="number" step="0.01" name="amount" required />
              </label>
              <label>
                Moneda
                <input name="currency" defaultValue={country.currency} required />
              </label>
              <label>
                Archivo (PDF o XML)
                <input type="file" name="file" accept=".pdf,.xml" required />
              </label>
              <button type="submit">Enviar comprobante</button>
            </form>
          )}
        </div>

        <div className="card">
          <h2>5. Estado de mis comprobantes y pagos</h2>
          {invoices.length === 0 ? (
            <p className="muted">Aún no cargó comprobantes.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Comprobante</th><th>Emisión</th><th>Monto</th><th>Estado</th><th>Comprobantes de pago / retenciones</th></tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>{inv.kind === 'NOTA_CREDITO' ? 'NC' : inv.kind === 'RECIBO' ? 'Recibo' : 'Factura'} {inv.number}</td>
                    <td>{inv.issueDate.toLocaleDateString('es-AR')}</td>
                    <td>{inv.amount.toLocaleString('es-AR')} {inv.currency}</td>
                    <td><StatusBadge status={inv.status} labels={INVOICE_STATUS_LABELS} /></td>
                    <td>
                      {inv.documents.filter((d) => d.type === 'RECIBO_PAGO' || d.type === 'RETENCION').length === 0
                        ? '—'
                        : inv.documents
                            .filter((d) => d.type === 'RECIBO_PAGO' || d.type === 'RETENCION')
                            .map((d) => (
                              <div key={d.id}>
                                <a href={`/api/files/${d.id}?token=${token}`}>⬇ {d.filename}</a>{' '}
                                <span className="badge">{d.type === 'RETENCION' ? 'Retención' : 'Recibo'}</span>
                              </div>
                            ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="muted">
          🔒 Nunca le pediremos cambiar datos bancarios por email ni por teléfono. Ante cualquier duda
          contacte a su comprador por los canales habituales.
        </p>
      </main>
    </>
  );
}
