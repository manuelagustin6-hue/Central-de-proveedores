import { getSession } from '@/lib/auth';
import { changeOwnPassword } from '@/lib/actions/users';
import { Flash } from '@/components/Alerts';

const ROLE_LABELS: Record<string, string> = {
  COMPRAS: 'Compras',
  VALIDACION: 'Validación Datos',
  TESORERIA: 'Tesorería',
  AUDITORIA: 'Auditoría',
  ADMIN: 'Administrador',
};

export default function ProfilePage({ searchParams }: { searchParams: { error?: string; ok?: string } }) {
  const session = getSession();

  return (
    <>
      <h1>Mi perfil</h1>
      <Flash searchParams={searchParams} />
      <div className="grid cols-2">
        <div className="card">
          <h2>Mis datos</h2>
          <table>
            <tbody>
              <tr><th>Nombre</th><td>{session?.name}</td></tr>
              <tr><th>Email</th><td>{session?.email}</td></tr>
              <tr><th>Rol</th><td><span className="badge info">{ROLE_LABELS[session?.role ?? ''] ?? session?.role}</span></td></tr>
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2>Cambiar mi contraseña</h2>
          <form action={changeOwnPassword} className="stack">
            <label>
              Contraseña actual
              <input type="password" name="current" required autoComplete="current-password" />
            </label>
            <label>
              Nueva contraseña (mín. 8 caracteres)
              <input type="password" name="password" required minLength={8} autoComplete="new-password" />
            </label>
            <label>
              Repetir nueva contraseña
              <input type="password" name="confirm" required minLength={8} autoComplete="new-password" />
            </label>
            <button type="submit">Cambiar contraseña</button>
          </form>
        </div>
      </div>
    </>
  );
}
