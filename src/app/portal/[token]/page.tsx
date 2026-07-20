import Link from 'next/link';
import { db } from '@/lib/db';
import { getSupplierByToken } from '@/lib/auth';
import { saveBankData, updateSupplierData, uploadSupplierDocument } from '@/lib/actions/portal';
import { InvoiceUploadForm } from '@/components/InvoiceUploadForm';
import {
  COUNTRIES,
  Country,
  INVOICE_FLOW,
  INVOICE_STATUS_LABELS,
  missingRequiredDocs,
  REQUIRED_DOCS,
  SUPPLIER_STATUS_LABELS,
} from '@/lib/countries';
import { Flash, StatusBadge } from '@/components/Alerts';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'inicio', label: 'Inicio' },
  { key: 'datos', label: 'Mis datos' },
  { key: 'documentos', label: 'Documentación' },
  { key: 'facturas', label: 'Facturas y pagos' },
];

const FLOW = [
  'PENDIENTE_DATOS',
  'DATOS_CARGADOS',
  'VALIDADO_TELEFONICAMENTE',
  'PRUEBA_ENVIADA',
  'PRUEBA_CONFIRMADA',
  'APROBADO',
];

export default async function PortalPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { error?: string; ok?: string; tab?: string; estado?: string };
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
  const tab = TABS.some((t) => t.key === searchParams.tab) ? searchParams.tab! : 'inicio';
  const base = `/portal/${token}`;

  const [activeAccount, documents, invoices] = await Promise.all([
    db.bankAccount.findFirst({ where: { supplierId: supplier.id, active: true } }),
    db.document.findMany({
      where: { supplierId: supplier.id, uploadedBy: 'proveedor', invoiceId: null },
      orderBy: { createdAt: 'desc' },
    }),
    db.invoice.findMany({
      where: { supplierId: supplier.id },
      include: {
        documents: { select: { id: true, filename: true, type: true } },
        documentLinks: { include: { document: { select: { id: true, filename: true, type: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const missingDocs = missingRequiredDocs(supplier.country, documents);
  const pendiente = invoices.filter((i) => i.status !== 'PAGADA').reduce((a, i) => a + i.amount, 0);
  const cobrado = invoices.filter((i) => i.status === 'PAGADA').reduce((a, i) => a + i.amount, 0);
  const invoiceCounts = invoices.reduce<Record<string, number>>((acc, i) => {
    acc[i.status] = (acc[i.status] ?? 0) + 1;
    return acc;
  }, {});
  const estado = searchParams.estado;
  const invoicesFiltered = estado ? invoices.filter((i) => i.status === estado) : invoices;
  const currentIdx = FLOW.indexOf(supplier.status);

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

        {supplier.status === 'CORRECCIONES_SOLICITADAS' && supplier.correctionNote && (
          <div className="alert redflag">
            ✏️ <strong>Se requieren correcciones en su información:</strong>
            <br />
            {supplier.correctionNote}
            <br />
            <span style={{ fontWeight: 400 }}>
              Corrija los datos o documentos indicados y vuelva a guardarlos — su alta se reenviará
              automáticamente a verificación.
            </span>
          </div>
        )}

        <nav className="tabs">
          {TABS.map((t) => (
            <Link key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} href={`${base}?tab=${t.key}`}>
              {t.label}
            </Link>
          ))}
        </nav>

        {tab === 'inicio' && (
          <>
            {supplier.status !== 'RECHAZADO' && supplier.status !== 'CORRECCIONES_SOLICITADAS' && (
              <div className="card">
                <h2>Estado de su alta</h2>
                <div className="steps">
                  {FLOW.map((s, i) => (
                    <span
                      key={s}
                      className={`step ${i < currentIdx ? 'done' : i === currentIdx ? 'current' : ''}`}
                    >
                      {i + 1}. {SUPPLIER_STATUS_LABELS[s]}
                    </span>
                  ))}
                </div>
                {supplier.status === 'PENDIENTE_DATOS' && (
                  <p className="alert" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e40af' }}>
                    👉 Para comenzar, complete <Link href={`${base}?tab=datos`}>sus datos y cuenta bancaria</Link>{' '}
                    y suba la <Link href={`${base}?tab=documentos`}>documentación obligatoria</Link>.
                  </p>
                )}
                {supplier.status === 'DATOS_CARGADOS' && missingDocs.length > 0 && (
                  <p className="alert error">
                    ⚠️ Falta subir documentación obligatoria:{' '}
                    <strong>{missingDocs.map((d) => d.label).join(', ')}</strong> —{' '}
                    <Link href={`${base}?tab=documentos`}>subir ahora</Link>. Sin ella no podremos avanzar
                    con la verificación.
                  </p>
                )}
                {supplier.status === 'DATOS_CARGADOS' && missingDocs.length === 0 && (
                  <p className="muted">
                    Su información está completa. Nuestro equipo está realizando las verificaciones de
                    seguridad; le avisaremos por email cuando su alta esté aprobada.
                  </p>
                )}
                {supplier.status === 'APROBADO' && (
                  <p className="alert ok">
                    ✓ Su alta está aprobada. Ya puede <Link href={`${base}?tab=facturas`}>cargar facturas</Link> y
                    consultar sus pagos.
                  </p>
                )}
              </div>
            )}

            <div className="grid cols-4">
              <div className="card stat">
                <div className="num">{invoices.length}</div>
                <div className="label">Comprobantes cargados</div>
              </div>
              <div className="card stat">
                <div className="num">{invoiceCounts['PAGADA'] ?? 0}</div>
                <div className="label">Pagados</div>
              </div>
              <div className="card stat">
                <div className="num">{pendiente.toLocaleString('es-AR')}</div>
                <div className="label">Pendiente de cobro</div>
              </div>
              <div className="card stat">
                <div className="num">{cobrado.toLocaleString('es-AR')}</div>
                <div className="label">Cobrado</div>
              </div>
            </div>

            {invoices.length > 0 && (
              <div className="card">
                <h2>Últimos comprobantes</h2>
                <table>
                  <thead>
                    <tr><th>Comprobante</th><th>Emisión</th><th>Monto</th><th>Estado</th></tr>
                  </thead>
                  <tbody>
                    {invoices.slice(0, 5).map((inv) => (
                      <tr key={inv.id}>
                        <td>{inv.kind === 'NOTA_CREDITO' ? 'NC' : inv.kind === 'RECIBO' ? 'Recibo' : 'Factura'} {inv.number}</td>
                        <td>{inv.issueDate.toLocaleDateString('es-AR')}</td>
                        <td>{inv.amount.toLocaleString('es-AR')} {inv.currency}</td>
                        <td><StatusBadge status={inv.status} labels={INVOICE_STATUS_LABELS} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p><Link href={`${base}?tab=facturas`}>Ver todos →</Link></p>
              </div>
            )}
          </>
        )}

        {tab === 'datos' && (
          <div className="grid cols-2">
            <div className="card">
              <h2>Datos de la empresa</h2>
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
              <h2>Datos bancarios</h2>
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
        )}

        {tab === 'documentos' && (
          <div className="card">
            <h2>Documentación obligatoria ({country.name})</h2>
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
        )}

        {tab === 'facturas' && (
          <>
            <div className="card">
              <h2>Cargar factura / nota de crédito</h2>
              {supplier.status !== 'APROBADO' ? (
                <p className="muted">
                  Podrá cargar facturas cuando su alta esté aprobada por nuestro equipo de verificación.
                </p>
              ) : (
                <>
                  <p className="muted">
                    Si adjunta el <strong>XML</strong> de la factura electrónica, el sistema completa
                    automáticamente número, fecha, monto y moneda para que solo los confirme.
                  </p>
                  <InvoiceUploadForm token={token} defaultCurrency={country.currency} />
                </>
              )}
            </div>

            <div className="card">
              <h2>Mis comprobantes y pagos</h2>
              <div className="steps">
                <Link className={`step ${!estado ? 'current' : ''}`} href={`${base}?tab=facturas`}>
                  Todos ({invoices.length})
                </Link>
                {INVOICE_FLOW.map((s) => (
                  <Link
                    key={s}
                    className={`step ${estado === s ? 'current' : ''}`}
                    href={`${base}?tab=facturas&estado=${s}`}
                  >
                    {INVOICE_STATUS_LABELS[s]} ({invoiceCounts[s] ?? 0})
                  </Link>
                ))}
              </div>
              {invoicesFiltered.length === 0 ? (
                <p className="muted">No hay comprobantes{estado ? ' en este estado' : ' cargados'}.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Comprobante</th>
                      <th>Emisión</th>
                      <th>Monto</th>
                      <th>Estado</th>
                      <th>Comprobantes de pago / retenciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoicesFiltered.map((inv) => (
                      <tr key={inv.id}>
                        <td>{inv.kind === 'NOTA_CREDITO' ? 'NC' : inv.kind === 'RECIBO' ? 'Recibo' : 'Factura'} {inv.number}</td>
                        <td>{inv.issueDate.toLocaleDateString('es-AR')}</td>
                        <td>{inv.amount.toLocaleString('es-AR')} {inv.currency}</td>
                        <td><StatusBadge status={inv.status} labels={INVOICE_STATUS_LABELS} /></td>
                        <td>
                          {(() => {
                            const pagos = [...inv.documents, ...inv.documentLinks.map((l) => l.document)].filter(
                              (d) => d.type === 'RECIBO_PAGO' || d.type === 'RETENCION',
                            );
                            return pagos.length === 0
                              ? '—'
                              : pagos.map((d) => (
                                  <div key={d.id}>
                                    <a href={`/api/files/${d.id}?token=${token}`}>⬇ {d.filename}</a>{' '}
                                    <span className="badge">{d.type === 'RETENCION' ? 'Retención' : 'Recibo'}</span>
                                  </div>
                                ));
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        <p className="muted">
          🔒 Nunca le pediremos cambiar datos bancarios por email ni por teléfono. Ante cualquier duda
          contacte a su comprador por los canales habituales.
        </p>
      </main>
    </>
  );
}
