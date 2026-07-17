import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const db = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('demo1234', 10);

  const users = [
    { email: 'compras@demo.com', name: 'Carla Compras', role: 'COMPRAS' },
    { email: 'validacion@demo.com', name: 'Víctor Validación', role: 'VALIDACION' },
    { email: 'tesoreria@demo.com', name: 'Teresa Tesorería', role: 'TESORERIA' },
    { email: 'tesoreria2@demo.com', name: 'Tomás Tesorería', role: 'TESORERIA' },
    { email: 'auditoria@demo.com', name: 'Ana Auditoría', role: 'AUDITORIA' },
    { email: 'admin@demo.com', name: 'Administrador', role: 'ADMIN' },
  ];

  for (const u of users) {
    await db.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, passwordHash: password },
    });
  }

  // Regla de doble aprobación de ejemplo: montos >= 1.000.000 requieren 2 aprobaciones
  const rulesCount = await db.approvalRule.count();
  if (rulesCount === 0) {
    await db.approvalRule.create({ data: { threshold: 1_000_000, requiredApprovals: 2 } });
  }

  // Proveedores de ejemplo, uno por país
  const compras = await db.user.findUniqueOrThrow({ where: { email: 'compras@demo.com' } });
  const demoSuppliers = [
    { country: 'AR', razonSocial: 'Insumos del Plata S.A.', email: 'ventas@insumosdelplata.com.ar' },
    { country: 'UY', razonSocial: 'Servicios Oriental SRL', email: 'admin@serviciosoriental.com.uy' },
    { country: 'US', razonSocial: 'Acme Supplies LLC', email: 'billing@acmesupplies.com' },
  ];
  for (const s of demoSuppliers) {
    const exists = await db.supplier.findFirst({ where: { razonSocial: s.razonSocial } });
    if (!exists) {
      const sup = await db.supplier.create({
        data: { ...s, accessToken: randomBytes(24).toString('hex'), createdById: compras.id },
      });
      console.log(`Proveedor demo "${s.razonSocial}" → portal: /portal/${sup.accessToken}`);
    }
  }

  console.log('Seed completado. Usuarios (contraseña: demo1234):');
  users.forEach((u) => console.log(`  ${u.email} — ${u.role}`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
