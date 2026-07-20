import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { logout } from '@/lib/actions/auth';
import { NavLinks } from '@/components/NavLinks';

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
          <NavLinks
            links={[
              { href: '/dashboard', label: '🏠 Inicio' },
              { href: '/proveedores', label: '🏢 Proveedores' },
              { href: '/facturas', label: '🧾 Facturas' },
              ...(session.role === 'AUDITORIA' || session.role === 'ADMIN'
                ? [{ href: '/auditoria', label: '🔍 Auditoría' }]
                : []),
              ...(session.role === 'ADMIN' ? [{ href: '/configuracion', label: '⚙️ Configuración' }] : []),
            ]}
          />
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
