import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { adminResetPassword, createUser, setUserRole, toggleUserActive } from '@/lib/actions/users';
import { Flash } from '@/components/Alerts';

export const dynamic = 'force-dynamic';

const ROLE_LABELS: Record<string, string> = {
  COMPRAS: 'Compras',
  VALIDACION: 'Validación Datos',
  TESORERIA: 'Tesorería',
  AUDITORIA: 'Auditoría',
  ADMIN: 'Administrador',
};

export default async function UsersPage({ searchParams }: { searchParams: { error?: string; ok?: string } }) {
  const session = getSession();
  if (session?.role !== 'ADMIN') redirect('/dashboard');

  const users = await db.user.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] });

  return (
    <>
      <h1>Usuarios y roles</h1>
      <Flash searchParams={searchParams} />
      <p className="muted">
        Segregación de funciones: para que el circuito anti-BEC funcione se necesita al menos una
        persona por rol, y dos personas distintas en Tesorería (una envía la transferencia de prueba y
        otra la confirma).
      </p>

      <div className="card">
        <h2>Crear usuario</h2>
        <form action={createUser} className="inline">
          <label>
            Nombre y apellido
            <input name="name" required />
          </label>
          <label>
            Email
            <input type="email" name="email" required />
          </label>
          <label>
            Rol
            <select name="role" required>
              {Object.entries(ROLE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Contraseña inicial (mín. 8)
            <input type="text" name="password" required minLength={8} autoComplete="off" />
          </label>
          <button type="submit">Crear usuario</button>
        </form>
        <p className="muted">
          Comparta la contraseña inicial por un canal seguro y pida a la persona que la cambie desde
          &quot;Mi perfil&quot; al ingresar.
        </p>
      </div>

      <div className="card">
        <h2>Usuarios ({users.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u.id === session!.uid;
              return (
                <tr key={u.id} style={u.active ? undefined : { opacity: 0.55 }}>
                  <td>
                    {u.name} {isSelf && <span className="badge info">vos</span>}
                  </td>
                  <td>{u.email}</td>
                  <td>
                    {isSelf ? (
                      <span className="badge">{ROLE_LABELS[u.role] ?? u.role}</span>
                    ) : (
                      <form action={setUserRole} className="inline" style={{ gap: 4 }}>
                        <input type="hidden" name="userId" value={u.id} />
                        <select name="role" defaultValue={u.role}>
                          {Object.entries(ROLE_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                        <button className="small secondary" type="submit">Cambiar</button>
                      </form>
                    )}
                  </td>
                  <td>
                    {u.active ? <span className="badge ok">Activo</span> : <span className="badge danger">Inactivo</span>}
                  </td>
                  <td>
                    {!isSelf && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <form action={toggleUserActive}>
                          <input type="hidden" name="userId" value={u.id} />
                          <button
                            className={`small ${u.active ? 'danger' : 'secondary'}`}
                            type="submit"
                            data-confirm={
                              u.active
                                ? `¿Desactivar a ${u.name}? No podrá ingresar al sistema.`
                                : `¿Reactivar a ${u.name}?`
                            }
                          >
                            {u.active ? 'Desactivar' : 'Reactivar'}
                          </button>
                        </form>
                        <form action={adminResetPassword} className="inline" style={{ gap: 4 }}>
                          <input type="hidden" name="userId" value={u.id} />
                          <input
                            type="text"
                            name="password"
                            placeholder="Nueva contraseña"
                            minLength={8}
                            required
                            autoComplete="off"
                            style={{ width: 150 }}
                          />
                          <button className="small secondary" type="submit">Resetear</button>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
