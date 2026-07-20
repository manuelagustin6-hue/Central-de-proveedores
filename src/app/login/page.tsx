import { login } from '@/lib/actions/auth';
import { Flash } from '@/components/Alerts';
import { Logo } from '@/components/Logo';

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <Logo size={64} color="#333333" />
          <h1 style={{ margin: '10px 0 0' }}>HA Proveedores</h1>
        </div>
        <p className="muted" style={{ textAlign: 'center' }}>Gestión de proveedores y control anti-fraude (BEC)</p>
        <Flash searchParams={searchParams} />
        <form action={login} className="stack" style={{ maxWidth: 'none' }}>
          <label>
            Email
            <input type="email" name="email" required autoComplete="username" />
          </label>
          <label>
            Contraseña
            <input type="password" name="password" required autoComplete="current-password" />
          </label>
          <button type="submit">Ingresar</button>
        </form>
        <p className="muted" style={{ marginTop: 16 }}>
          Los proveedores acceden mediante el enlace único que reciben por email.
        </p>
      </div>
    </div>
  );
}
