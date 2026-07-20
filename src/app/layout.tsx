import type { Metadata } from 'next';
import './globals.css';
import { FormUX } from '@/components/FormUX';

export const metadata: Metadata = {
  title: {
    default: 'Central de Proveedores',
    template: '%s · Central de Proveedores',
  },
  description: 'Portal de gestión de proveedores, control anti-fraude (BEC) y autogestión',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <FormUX />
        {children}
      </body>
    </html>
  );
}
