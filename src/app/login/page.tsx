import { login } from '@/lib/actions/auth';
import { Flash } from '@/components/Alerts';

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1 style={{ marginTop: 0 }}>Central de Proveedores</h1>
        <p className="muted">Gestión de proveedores y control anti-fraude (BEC)</p>
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
