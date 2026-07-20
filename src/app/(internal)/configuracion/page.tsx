import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { createApprovalRule, deleteApprovalRule } from '@/lib/actions/config';
import { countryName } from '@/lib/countries';
import { Flash } from '@/components/Alerts';

export const dynamic = 'force-dynamic';

export default async function ConfigPage({ searchParams }: { searchParams: { error?: string; ok?: string } }) {
  const session = getSession();
  if (session?.role !== 'ADMIN') redirect('/dashboard');

  const rules = await db.approvalRule.findMany({ orderBy: { threshold: 'asc' } });

  return (
    <>
      <h1>Configuración</h1>
      <Flash searchParams={searchParams} />
      <div className="card">
        <h2>Reglas de doble aprobación</h2>
        <p className="muted">
          Las facturas cuyo monto alcance el umbral requerirán la aprobación de múltiples personas
          distintas antes de pasar a &quot;Aprobada para pago&quot;.
        </p>
        {rules.length === 0 ? (
          <p className="muted">Sin reglas configuradas (por defecto: 1 aprobación).</p>
        ) : (
          <table>
            <thead>
              <tr><th>Alcance</th><th>Umbral (monto ≥)</th><th>Aprobaciones requeridas</th><th></th></tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td>{r.country ? countryName(r.country) : 'Todos los países'}</td>
                  <td>{r.threshold.toLocaleString('es-AR')}</td>
                  <td>{r.requiredApprovals}</td>
                  <td>
                    <form action={deleteApprovalRule}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="small danger" type="submit" data-confirm="¿Eliminar esta regla de aprobación?">Eliminar</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <h3>Nueva regla</h3>
        <form action={createApprovalRule} className="inline">
          <label>
            Alcance
            <select name="country">
              <option value="ALL">Todos los países</option>
              <option value="AR">Argentina</option>
              <option value="UY">Uruguay</option>
              <option value="US">Estados Unidos</option>
            </select>
          </label>
          <label>
            Umbral (monto ≥)
            <input type="number" step="0.01" name="threshold" required />
          </label>
          <label>
            Aprobaciones requeridas
            <input type="number" min="1" max="5" name="requiredApprovals" required defaultValue="2" />
          </label>
          <button type="submit">Crear regla</button>
        </form>
      </div>
    </>
  );
}
