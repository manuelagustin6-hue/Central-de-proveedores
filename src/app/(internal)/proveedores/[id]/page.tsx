import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import {
  confirmTestTransfer,
  finalApprove,
  registerPhoneValidation,
  registerTestTransfer,
  rejectSupplier,
  resolveRedFlag,
  uploadInternalDocument,
} from '@/lib/actions/suppliers';
import { COUNTRIES, Country, REQUIRED_DOCS, SUPPLIER_STATUS_LABELS, countryName } from '@/lib/countries';
import { getBaseUrl } from '@/lib/urls';
import { Flash, StatusBadge } from '@/components/Alerts';
import { CopyButton } from '@/components/CopyButton';

export const dynamic = 'force-dynamic';

const FLOW = [
  'PENDIENTE_DATOS',
  'DATOS_CARGADOS',
  'VALIDADO_TELEFONICAMENTE',
  'PRUEBA_ENVIADA',
  'PRUEBA_CONFIRMADA',
  'APROBADO',
];

export default async function SupplierDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string; ok?: string };
}) {
  const session = getSession();
  const supplier = await db.supplier.findUnique({
    where: { id: params.id },
    include: {
      bankAccounts: { orderBy: { createdAt: 'desc' } },
      documents: { orderBy: { createdAt: 'desc' } },
      redFlags: { orderBy: { createdAt: 'desc' } },
      transfers: { orderBy: { executedAt: 'desc' } },
      auditLogs: { orderBy: { createdAt: 'desc' }, take: 30 },
    },
  });
  if (!supplier || !session) notFound();

  const role = session.role;
  const country = COUNTRIES[supplier.country as Country];
  const activeAccount = supplier.bankAccounts.find((a) => a.active);
  const pendingFlags = supplier.redFlags.filter((f) => !f.resolved);
  const currentIdx = FLOW.indexOf(supplier.status);
  const portalUrl = `${getBaseUrl()}/portal/${supplier.accessToken}`;

  const can = (r: string) => role === r || role === 'ADMIN';

  return (
    <>
      <p><Link href="/proveedores">← Proveedores</Link></p>
      <h1>
        {supplier.razonSocial}{' '}
        <StatusBadge status={supplier.status} labels={SUPPLIER_STATUS_LABELS} />
      </h1>
      <Flash searchParams={searchParams} />

      {supplier.status !== 'RECHAZADO' && (
        <div className="steps">
          {FLOW.map((s, i) => (
            <span key={s} className={`step ${i < currentIdx ? 'done' : i === currentIdx ? 'current' : ''}`}>
              {i + 1}. {SUPPLIER_STATUS_LABELS[s]}
            </span>
          ))}
        </div>
      )}

      {pendingFlags.map((f) => (
        <div key={f.id} className="alert redflag">
          🚩 {f.message}
          {can('AUDITORIA') && (
            <form action={resolveRedFlag} className="inline" style={{ marginTop: 8 }}>
              <input type="hidden" name="flagId" value={f.id} />
              <input type="hidden" name="supplierId" value={supplier.id} />
              <input name="note" placeholder="¿Cómo se verificó?" required style={{ flex: 1 }} />
              <button className="small secondary" type="submit">Marcar resuelta</button>
            </form>
          )}
        </div>
      ))}

      <div className="grid cols-2">
        <div className="card">
          <h2>Datos del proveedor</h2>
          <table>
            <tbody>
              <tr><th>País</th><td>{countryName(supplier.country)}</td></tr>
              <tr><th>{country?.taxIdLabel ?? 'Tax ID'}</th><td>{supplier.taxId ?? '—'}</td></tr>
              <tr><th>Domicilio</th><td>{supplier.domicilio ?? '—'}</td></tr>
              <tr><th>Sitio web</th><td>{supplier.website ?? '—'}</td></tr>
              <tr><th>Persona de contacto</th><td>{supplier.contactName ?? '—'}</td></tr>
              <tr><th>Email</th><td>{supplier.email ?? '—'}</td></tr>
              <tr><th>Tel. declarado por proveedor</th><td>{supplier.phoneProvided ?? '—'}</td></tr>
              <tr>
                <th>Tel. fuente independiente</th>
                <td>
                  {supplier.phoneIndependent
                    ? `${supplier.phoneIndependent} (${supplier.phoneSource})`
                    : '—'}
                </td>
              </tr>
            </tbody>
          </table>
          <h3>Enlace único de autogestión</h3>
          <p className="mono">{portalUrl}</p>
          <CopyButton text={portalUrl} />
          <p className="muted">Envíe este enlace únicamente al contacto verificado del proveedor.</p>
        </div>

        <div className="card">
          <h2>Datos bancarios</h2>
          {!activeAccount ? (
            <p className="muted">El proveedor aún no cargó su cuenta bancaria desde el portal.</p>
          ) : (
            <table>
              <tbody>
                <tr><th>Titular</th><td>{activeAccount.titular}</td></tr>
                {supplier.country === 'AR' && (
                  <>
                    <tr><th>CBU</th><td className="mono">{activeAccount.cbu}</td></tr>
                    <tr><th>Alias CBU</th><td>{activeAccount.aliasCbu ?? '—'}</td></tr>
                  </>
                )}
                {supplier.country === 'UY' && (
                  <>
                    <tr><th>Banco</th><td>{activeAccount.bankName}</td></tr>
                    <tr><th>N° de cuenta</th><td className="mono">{activeAccount.accountNumber}</td></tr>
                    <tr><th>Tipo</th><td>{activeAccount.accountType}</td></tr>
                  </>
                )}
                {supplier.country === 'US' && (
                  <>
                    <tr><th>Bank Name</th><td>{activeAccount.bankName}</td></tr>
                    <tr><th>Bank Address</th><td>{activeAccount.bankAddress ?? '—'}</td></tr>
                    <tr><th>Routing Number</th><td className="mono">{activeAccount.routingNumber}</td></tr>
                    <tr><th>Account Number</th><td className="mono">{activeAccount.accountNumber}</td></tr>
                  </>
                )}
                <tr><th>Estado</th><td><StatusBadge status={activeAccount.status} labels={{
                  PENDIENTE: 'Pendiente de validación',
                  VALIDADA_TELEFONICAMENTE: 'Validada telefónicamente',
                  PRUEBA_ENVIADA: 'Prueba enviada',
                  PRUEBA_CONFIRMADA: 'Prueba confirmada',
                  APROBADA: 'Aprobada',
                  RECHAZADA: 'Rechazada',
                }} /></td></tr>
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Circuito de validación anti-BEC</h2>
        <p className="muted">
          Segregación de funciones: el sistema bloquea que una misma persona ejecute dos acciones
          consecutivas sobre este proveedor.
        </p>

        {can('VALIDACION') && supplier.status === 'DATOS_CARGADOS' && (
          <>
            <h3>1. Validación telefónica (rol Validación Datos)</h3>
            <p className="muted">
              Obtenga el teléfono por una <strong>fuente independiente</strong> (web oficial, registro
              público). El sistema bloquea la validación si coincide con el teléfono declarado por el
              proveedor.
            </p>
            <form action={registerPhoneValidation} className="stack">
              <input type="hidden" name="supplierId" value={supplier.id} />
              <label>
                Teléfono obtenido por fuente independiente
                <input name="phoneIndependent" required />
              </label>
              <label>
                Fuente (URL del sitio oficial / registro consultado)
                <input name="phoneSource" required placeholder="https://..." />
              </label>
              <button type="submit">Registrar validación telefónica</button>
            </form>
          </>
        )}

        {can('TESORERIA') && supplier.status === 'VALIDADO_TELEFONICAMENTE' && (
          <>
            <h3>2. Transferencia de prueba (rol Tesorería)</h3>
            <form action={registerTestTransfer} className="stack">
              <input type="hidden" name="supplierId" value={supplier.id} />
              <label>
                Monto simbólico
                <input type="number" step="0.01" name="amount" required defaultValue="1" />
              </label>
              <label>
                Moneda
                <input name="currency" defaultValue={country?.currency ?? 'ARS'} required />
              </label>
              <label>
                Notas
                <input name="notes" />
              </label>
              <button type="submit">Registrar transferencia de prueba</button>
            </form>
          </>
        )}

        {can('TESORERIA') && supplier.status === 'PRUEBA_ENVIADA' && (
          <>
            <h3>3. Confirmación verbal de la transferencia (rol Tesorería)</h3>
            <p className="muted">
              Confirme con el proveedor —al teléfono validado por fuente independiente— que recibió el
              monto de prueba.
            </p>
            <form action={confirmTestTransfer} className="stack">
              <input type="hidden" name="supplierId" value={supplier.id} />
              <label>
                Notas de la confirmación
                <input name="notes" placeholder="Confirmado con Juan Pérez al..." />
              </label>
              <button type="submit">Registrar confirmación verbal</button>
            </form>
          </>
        )}

        {can('AUDITORIA') && supplier.status === 'PRUEBA_CONFIRMADA' && (
          <>
            <h3>4. Aprobación final (rol Auditoría)</h3>
            <p className="muted">Revise la trazabilidad completa antes de aprobar.</p>
            <form action={finalApprove} className="inline">
              <input type="hidden" name="supplierId" value={supplier.id} />
              <button type="submit">✓ Otorgar aprobación final</button>
            </form>
          </>
        )}

        {can('AUDITORIA') && !['APROBADO', 'RECHAZADO'].includes(supplier.status) && (
          <>
            <h3>Rechazar proveedor (rol Auditoría)</h3>
            <form action={rejectSupplier} className="inline">
              <input type="hidden" name="supplierId" value={supplier.id} />
              <input name="reason" placeholder="Motivo del rechazo" required style={{ flex: 1 }} />
              <button className="danger" type="submit">Rechazar</button>
            </form>
          </>
        )}

        {supplier.status === 'APROBADO' && (
          <p className="alert ok">✓ Cuenta aprobada. El proveedor puede operar y cargar facturas.</p>
        )}
      </div>

      {supplier.transfers.length > 0 && (
        <div className="card">
          <h2>Transferencias de prueba</h2>
          <table>
            <thead>
              <tr><th>Fecha</th><th>Monto</th><th>Confirmada</th><th>Notas</th></tr>
            </thead>
            <tbody>
              {supplier.transfers.map((t) => (
                <tr key={t.id}>
                  <td>{t.executedAt.toLocaleString('es-AR')}</td>
                  <td>{t.amount} {t.currency}</td>
                  <td>{t.confirmedAt ? `Sí (${t.confirmedAt.toLocaleString('es-AR')})` : 'No'}</td>
                  <td>{t.notes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2>Documentación</h2>
        <p>
          {REQUIRED_DOCS[supplier.country as Country].map((req) => {
            const ok = supplier.documents.some((d) => d.type === req.type);
            return (
              <span key={req.type} className={`badge ${ok ? 'ok' : 'warn'}`} style={{ marginRight: 8 }}>
                {ok ? '✓' : '⏳'} {req.label}
              </span>
            );
          })}
        </p>
        {supplier.documents.length === 0 ? (
          <p className="muted">Sin documentos.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Tipo</th><th>Archivo</th><th>Subido por</th><th>Fecha</th></tr>
            </thead>
            <tbody>
              {supplier.documents.map((d) => (
                <tr key={d.id}>
                  <td>{d.type}</td>
                  <td><a href={`/api/files/${d.id}`}>{d.filename}</a></td>
                  <td>{d.uploadedBy}</td>
                  <td>{d.createdAt.toLocaleString('es-AR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {can('COMPRAS') && (
          <>
            <h3>Cargar documentación fiscal/societaria</h3>
            <form action={uploadInternalDocument} className="inline">
              <input type="hidden" name="supplierId" value={supplier.id} />
              <label>
                Tipo
                <select name="type">
                  {REQUIRED_DOCS[supplier.country as Country].map((req) => (
                    <option key={req.type} value={req.type}>{req.label}</option>
                  ))}
                  <option value="OTRO">Otro</option>
                </select>
              </label>
              <label>
                Archivo
                <input type="file" name="file" required />
              </label>
              <button type="submit">Subir</button>
            </form>
          </>
        )}
      </div>

      <div className="card">
        <h2>Trazabilidad (últimas 30 acciones)</h2>
        <table>
          <thead>
            <tr><th>Fecha y hora</th><th>Actor</th><th>Acción</th><th>Detalle</th><th>IP</th></tr>
          </thead>
          <tbody>
            {supplier.auditLogs.map((l) => (
              <tr key={l.id}>
                <td>{l.createdAt.toLocaleString('es-AR')}</td>
                <td>{l.actorLabel}</td>
                <td><span className="badge">{l.action}</span></td>
                <td>{l.detail ?? '—'}</td>
                <td className="mono">{l.ip ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
