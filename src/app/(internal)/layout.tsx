import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { logout } from '@/lib/actions/auth';
import { NavLinks } from '@/components/NavLinks';
import { Logo } from '@/components/Logo';
import { getRolePerms } from '@/lib/permissions';

const ROLE_LABELS: Record<string, string> = {
  COMPRAS: 'Compras',
  VALIDACION: 'Validación Datos',
  TESORERIA: 'Tesorería',
  AUDITORIA: 'Auditoría',
  ADMIN: 'Administrador',
};

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const session = getSession();
  if (!session) redirect('/login');
  const perms = await getRolePerms(session.role);

  return (
    <>
      <header className="topbar">
        <span className="brand" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Logo size={30} color="#ffffff" />
          HA Proveedores
        </span>
        <nav>
          <NavLinks
            links={[
              { href: '/dashboard', label: '🏠 Inicio' },
              { href: '/proveedores', label: '🏢 Proveedores' },
              { href: '/facturas', label: '🧾 Facturas' },
              ...(perms.has('VER_AUDITORIA') ? [{ href: '/auditoria', label: '🔍 Auditoría' }] : []),
              ...(session.role === 'ADMIN'
                ? [
                    { href: '/usuarios', label: '👥 Usuarios' },
                    { href: '/configuracion', label: '⚙️ Configuración' },
                  ]
                : []),
            ]}
          />
        </nav>
        <div className="user">
          <a href="/perfil" style={{ color: 'inherit' }} title="Mi perfil">
            {session.name} <span className="role-chip">{ROLE_LABELS[session.role] ?? session.role}</span>
          </a>
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
