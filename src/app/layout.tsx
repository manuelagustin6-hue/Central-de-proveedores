import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Central de Proveedores',
  description: 'Portal de gestión de proveedores, control anti-fraude (BEC) y autogestión',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
