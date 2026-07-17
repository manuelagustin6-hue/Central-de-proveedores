import { db } from '@/lib/db';
import { getSupplierByToken } from '@/lib/auth';
import {
  createInvoice,
  saveBankData,
  updateSupplierData,
  uploadSupplierDocument,
} from '@/lib/actions/portal';
import {
  COUNTRIES,
  Country,
  INVOICE_STATUS_LABELS,
  REQUIRED_DOCS,
  SUPPLIER_STATUS_LABELS,
} from '@/lib/countries';
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
                Persona de contacto (nombre y apellido)
                <input name="contactName" defaultValue={supplier.contactName ?? ''} required />
              </label>
              <label>
                Email de contacto
                <input type="email" name="email" defaultValue={supplier.email ?? ''} required />
              </label>
              <label>
                Teléfono de contacto
                <input name="phoneProvided" defaultValue={supplier.phoneProvided ?? ''} required />
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
          <p className="muted">
            Suba cada documento requerido. Los archivos se almacenan encriptados. Sin la
            documentación completa no podremos avanzar con la verificación de su alta.
          </p>
          <table>
            <thead>
              <tr><th>Documento</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {REQUIRED_DOCS[supplier.country as Country].map((req) => {
                const uploaded = documents.filter((d) => d.type === req.type);
                return (
                  <tr key={req.type} id={`doc-${req.type}`}>
                    <td><strong>{req.label}</strong></td>
                    <td>
                      {uploaded.length > 0 ? (
                        <span className="badge ok">✓ Subido</span>
                      ) : (
                        <span className="badge warn">Pendiente</span>
                      )}
                      {uploaded.map((d) => (
                        <div key={d.id}>
                          <a href={`/api/files/${d.id}?token=${token}`}>{d.filename}</a>
                        </div>
                      ))}
                    </td>
                    <td>
                      <form action={uploadSupplierDocument} className="inline">
                        <input type="hidden" name="token" value={token} />
                        <input type="hidden" name="type" value={req.type} />
                        <input type="file" name="file" required />
                        <button className="small" type="submit">
                          {uploaded.length > 0 ? 'Reemplazar' : 'Subir'}
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <h3>Otros documentos (opcional)</h3>
          <form action={uploadSupplierDocument} className="inline">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="type" value="OTRO" />
            <input type="file" name="file" required />
            <button className="small secondary" type="submit">Subir otro documento</button>
          </form>
          {documents.filter((d) => d.type === 'OTRO').length > 0 && (
            <p>
              {documents
                .filter((d) => d.type === 'OTRO')
                .map((d) => (
                  <span key={d.id} style={{ marginRight: 12 }}>
                    <a href={`/api/files/${d.id}?token=${token}`}>{d.filename}</a>
                  </span>
                ))}
            </p>
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
