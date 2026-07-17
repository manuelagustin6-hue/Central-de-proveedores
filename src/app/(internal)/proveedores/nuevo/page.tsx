import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { createSupplier } from '@/lib/actions/suppliers';
import { COUNTRIES } from '@/lib/countries';
import { Flash } from '@/components/Alerts';

export default function NewSupplierPage({ searchParams }: { searchParams: { error?: string } }) {
  const session = getSession();
  if (session?.role !== 'COMPRAS' && session?.role !== 'ADMIN') redirect('/proveedores');

  return (
    <>
      <h1>Solicitar alta de proveedor</h1>
      <Flash searchParams={searchParams} />
      <div className="card">
        <p className="muted">
          Al crear el proveedor se genera un <strong>enlace único de autogestión</strong> para que
          complete sus datos, documentación y cuenta bancaria según los requisitos de su país.
        </p>
        <form action={createSupplier} className="stack">
          <label>
            País
            <select name="country" required>
              {Object.entries(COUNTRIES).map(([code, c]) => (
                <option key={code} value={code}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Razón social
            <input name="razonSocial" required />
          </label>
          <label>
            Tax ID (CUIT / RUT / EIN) — opcional, el proveedor puede completarlo
            <input name="taxId" />
          </label>
          <label>
            Email de contacto del proveedor
            <input type="email" name="email" />
          </label>
          <button type="submit">Crear y generar enlace</button>
        </form>
      </div>
    </>
  );
}
