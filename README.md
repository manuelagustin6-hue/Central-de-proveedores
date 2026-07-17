# Central de Proveedores

Portal web de **gestión de proveedores**, **control anti-fraude (BEC)** y **autogestión**, según el documento de requerimientos técnico-funcionales (PRD).

## Qué incluye

### Módulo 1 — Portal de autogestión para proveedores
- Acceso externo mediante **enlace único y seguro** (sin usuario/contraseña), generado al dar de alta al proveedor.
- Interfaz **parametrizada por país** (Argentina, Uruguay, Estados Unidos): muestra solo los campos fiscales y bancarios de la región (CUIT / RUT / EIN; CBU y Alias / Banco, cuenta y tipo / Bank Name, Address, Routing y Account Number).
- Carga de razón social, Tax ID (con validación de formato), domicilio, sitio web y contacto.
- Subida de documentos obligatorios (formulario de alta, constancias fiscales, W-9) **encriptados en reposo (AES-256-GCM)**.
- Validación automática de que el **titular de la cuenta coincida con la razón social**.
- Carga de facturas / notas de crédito / recibos (PDF/XML) con número, fechas y montos, consulta de estados de pago y **descarga de recibos y certificados de retención**.

### Módulo 2 — Circuito de validación y seguridad (Anti-BEC)
Flujo de estados del proveedor:
`Pendiente de datos → Datos cargados → Validado telefónicamente → Prueba enviada → Prueba confirmada → Aprobado`

- **Teléfono independiente obligatorio**: el rol Validación Datos debe registrar el teléfono obtenido de una fuente externa; el sistema **bloquea** la validación si coincide con el declarado por el proveedor.
- **Transferencia de prueba**: Tesorería registra el monto simbólico y su confirmación verbal.
- **Aprobación final por Auditoría**, bloqueada mientras existan alertas de seguridad sin resolver.
- **Segregación de funciones**: el sistema impide que la misma persona ejecute dos acciones críticas consecutivas sobre el mismo proveedor.
- **Red flags automáticas**: typosquatting de dominios de email (distancia de Levenshtein contra el sitio oficial y otros proveedores), cambio de datos bancarios (reinicia el circuito de validación) e intento de validación con teléfono no independiente.

### Módulo 3 — Facturas y comprobantes
Flujo: `Recibida → En revisión → Aprobada para pago → Programada → Pagada`
- Solo proveedores con cuenta **aprobada** pueden facturar; la aprobación de facturas exige que el proveedor haya completado el protocolo anti-BEC.
- **Doble aprobación configurable**: umbrales por monto y país que exigen la aprobación de N personas distintas (el sistema bloquea la segunda aprobación del mismo usuario).
- Tesorería sube recibos de pago y certificados de retención; el proveedor los descarga desde su panel.

### Seguridad y auditoría
- **Audit log imborrable**: cada acción registra quién, qué, fecha/hora e IP. La aplicación solo inserta registros.
- RBAC con roles **Compras, Validación Datos, Tesorería, Auditoría y Admin**.
- Sesiones firmadas (HMAC) en cookie httpOnly; contraseñas con bcrypt; archivos encriptados en reposo.
- Punto de integración de notificaciones listo para SendGrid / AWS SES (`src/lib/notify.ts`).

## Stack

- **Next.js 14** (App Router, Server Actions) + React + TypeScript
- **Prisma** con SQLite en desarrollo — para producción cambiar el `provider` a `postgresql` en `prisma/schema.prisma`
- CSS propio adaptable a móviles y escritorio

## Puesta en marcha

```bash
cp .env.example .env       # ajustar secretos en producción
npm install
npm run setup              # genera cliente Prisma, crea la BD y siembra datos demo
npm run dev                # o: npm run build && npm start
```

Usuarios demo (contraseña `demo1234`):

| Email | Rol |
|---|---|
| compras@demo.com | Compras |
| validacion@demo.com | Validación Datos |
| tesoreria@demo.com / tesoreria2@demo.com | Tesorería |
| auditoria@demo.com | Auditoría |
| admin@demo.com | Admin |

Los enlaces de portal de los proveedores demo se imprimen al ejecutar el seed. El enlace de cada proveedor también se ve en su ficha interna.

## Prueba end-to-end

Con el servidor corriendo sobre una base recién sembrada:

```bash
node e2e/smoke.mjs
```

Recorre el circuito completo con navegador real: alta por Compras, autogestión del proveedor, bloqueo de titular no coincidente, bloqueo de teléfono no independiente, segregación de funciones, red flags, aprobación final, doble aprobación de facturas y descarga de comprobantes.

## Estructura

```
prisma/schema.prisma      Modelo de datos (proveedores, cuentas, facturas, audit log, reglas)
prisma/seed.ts            Datos demo
src/lib/                  Autenticación, RBAC, auditoría/segregación, anti-BEC, encriptación, países
src/lib/actions/          Server actions (auth, proveedores, facturas, portal, configuración)
src/app/(internal)/       Portal interno (dashboard, proveedores, facturas, auditoría, configuración)
src/app/portal/[token]/   Portal de autogestión del proveedor
src/app/api/files/[id]/   Descarga de documentos (desencriptado al vuelo, con control de acceso)
e2e/smoke.mjs             Prueba end-to-end del circuito completo
```
