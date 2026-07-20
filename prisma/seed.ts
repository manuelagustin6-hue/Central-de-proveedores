import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const db = new PrismaClient();

// Idempotente: se puede ejecutar en cada deploy (Vercel) sin duplicar datos.
// - Crea los usuarios iniciales solo si la tabla está vacía.
// - La contraseña inicial sale de SEED_PASSWORD (por defecto "demo1234" — cambiarla en producción).
// - Los proveedores de ejemplo solo se crean con SEED_DEMO=1.
async function main() {
  const existingUsers = await db.user.count();

  if (existingUsers === 0) {
    const password = await bcrypt.hash(process.env.SEED_PASSWORD || 'demo1234', 10);
    const users = [
      { email: 'compras@demo.com', name: 'Carla Compras', role: 'COMPRAS' },
      { email: 'validacion@demo.com', name: 'Víctor Validación', role: 'VALIDACION' },
      { email: 'tesoreria@demo.com', name: 'Teresa Tesorería', role: 'TESORERIA' },
      { email: 'tesoreria2@demo.com', name: 'Tomás Tesorería', role: 'TESORERIA' },
      { email: 'auditoria@demo.com', name: 'Ana Auditoría', role: 'AUDITORIA' },
      { email: 'admin@demo.com', name: 'Administrador', role: 'ADMIN' },
    ];
    for (const u of users) {
      await db.user.create({ data: { ...u, passwordHash: password } });
    }
    console.log('Usuarios iniciales creados:');
    users.forEach((u) => console.log(`  ${u.email} — ${u.role}`));
  } else {
    console.log(`Ya existen ${existingUsers} usuarios; no se crean nuevos.`);
  }

  // Permisos por defecto de cada rol (solo si la tabla está vacía)
  const permsCount = await db.rolePermission.count();
  if (permsCount === 0) {
    const defaults: Record<string, string[]> = {
      COMPRAS: ['PROVEEDOR_ALTA', 'FACTURA_REVISION', 'FACTURA_APROBACION'],
      VALIDACION: ['VALIDACION_TELEFONICA'],
      TESORERIA: ['TRANSFERENCIA_PRUEBA', 'PAGOS'],
      AUDITORIA: ['APROBACION_FINAL', 'FACTURA_REVISION', 'FACTURA_APROBACION', 'VER_AUDITORIA'],
    };
    for (const [role, perms] of Object.entries(defaults)) {
      for (const permission of perms) {
        await db.rolePermission.create({ data: { role, permission } });
      }
    }
    console.log('Permisos por defecto asignados a los roles.');
  }

  // Regla de doble aprobación de ejemplo: montos >= 1.000.000 requieren 2 aprobaciones
  const rulesCount = await db.approvalRule.count();
  if (rulesCount === 0) {
    await db.approvalRule.create({ data: { threshold: 1_000_000, requiredApprovals: 2 } });
  }

  if (process.env.SEED_DEMO === '1') {
    const compras = await db.user.findFirst({ where: { role: 'COMPRAS' } });
    const demoSuppliers = [
      { country: 'AR', razonSocial: 'Insumos del Plata S.A.', email: 'ventas@insumosdelplata.com.ar' },
      { country: 'UY', razonSocial: 'Servicios Oriental SRL', email: 'admin@serviciosoriental.com.uy' },
      { country: 'US', razonSocial: 'Acme Supplies LLC', email: 'billing@acmesupplies.com' },
    ];
    for (const s of demoSuppliers) {
      const exists = await db.supplier.findFirst({ where: { razonSocial: s.razonSocial } });
      if (!exists) {
        const sup = await db.supplier.create({
          data: { ...s, accessToken: randomBytes(24).toString('hex'), createdById: compras?.id },
        });
        console.log(`Proveedor demo "${s.razonSocial}" → portal: /portal/${sup.accessToken}`);
      }
    }
  }

  console.log('Seed completado.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
