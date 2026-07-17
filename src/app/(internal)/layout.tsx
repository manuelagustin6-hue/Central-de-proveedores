import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { logout } from '@/lib/actions/auth';

const ROLE_LABELS: Record<string, string> = {
  COMPRAS: 'Compras',
  VALIDACION: 'Validación Datos',
  TESORERIA: 'Tesorería',
  AUDITORIA: 'Auditoría',
  ADMIN: 'Administrador',
};

export default function InternalLayout({ children }: { children: React.ReactNode }) {
  const session = getSession();
  if (!session) redirect('/login');

  return (
    <>
      <header className="topbar">
        <span className="brand">Central de Proveedores</span>
        <nav>
          <Link href="/dashboard">Inicio</Link>
          <Link href="/proveedores">Proveedores</Link>
          <Link href="/facturas">Facturas</Link>
          {(session.role === 'AUDITORIA' || session.role === 'ADMIN') && (
            <Link href="/auditoria">Auditoría</Link>
          )}
          {session.role === 'ADMIN' && <Link href="/configuracion">Configuración</Link>}
        </nav>
        <div className="user">
          <span>
            {session.name} <span className="role-chip">{ROLE_LABELS[session.role] ?? session.role}</span>
          </span>
          <form action={logout}>
            <button className="secondary small" type="submit">
              Salir
            </button>
          </form>
        </div>
      </header>
      <main className="container">{children}</main>
    </>
  );
}
