import { chromium } from 'playwright-core';

// Prueba de humo end-to-end del circuito completo (anti-BEC, segregación de
// funciones, doble aprobación y portal del proveedor).
// Requisitos: servidor corriendo en BASE con base de datos recién sembrada
// (npm run setup && npm start), y Chromium accesible en CHROMIUM_PATH.

const BASE = 'http://localhost:3000';
const results = [];
function check(name, cond, extra = '') {
  results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) process.exitCode = 1;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });


// Hace clic y espera la redirección de la server action (URL nueva con ?ok= / ?error=)
async function act(page, selector) {
  const before = page.url();
  await page.click(selector);
  await page.waitForURL((u) => u.href !== before && /[?](ok|error)=/.test(u.href));
}

async function loginAs(email) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', 'demo1234');
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard');
  return { ctx, page };
}

// 1. Compras crea proveedor AR
const compras = await loginAs('compras@demo.com');
await compras.page.goto(`${BASE}/proveedores/nuevo`);
await compras.page.selectOption('select[name=country]', 'AR');
await compras.page.fill('input[name=razonSocial]', 'Proveedor Test E2E S.A.');
await compras.page.fill('input[name=email]', 'pagos@proveedortest.com');
await compras.page.click('text=Crear y generar enlace');
await compras.page.waitForURL(/\/proveedores\/(?!nuevo)[a-z0-9]+/);
const supplierUrl = compras.page.url().split('?')[0];
check('Compras crea proveedor', supplierUrl.includes('/proveedores/'));
const portalLink = await compras.page.locator('.mono').first().textContent();
const token = portalLink.trim().split('/portal/')[1];
check('Se genera enlace único de portal', !!token && token.length >= 40);

// 2. Proveedor completa datos y banco desde el portal
const pctx = await browser.newContext();
const pp = await pctx.newPage();
await pp.goto(`${BASE}/portal/${token}`);
check('Portal muestra campo CBU para Argentina', await pp.locator('input[name=cbu]').count() === 1);
await pp.fill('input[name=taxId]', '30-71234567-8');
await pp.fill('input[name=domicilio]', 'Av. Siempreviva 123, CABA');
await pp.fill('input[name=website]', 'https://proveedortest.com');
await pp.fill('input[name=email]', 'pagos@proveedortest.com');
await pp.fill('input[name=contactName]', 'Juan Pérez');
await pp.fill('input[name=phoneProvided]', '+54 11 4444-5555');
await act(pp, 'form >> nth=0 >> button[type=submit]');
check('Proveedor guarda datos', (await pp.content()).includes('Datos guardados'));

// Titular que no coincide con razón social → bloqueado
await pp.fill('input[name=titular]', 'Otra Empresa SRL');
await pp.fill('input[name=cbu]', '2850590940090418135201');
{
  const before = pp.url();
  await pp.locator('form').nth(1).locator('button[type=submit]').click();
  await pp.waitForURL((u) => u.href !== before && /[?](ok|error)=/.test(u.href));
}
check('Bloquea titular distinto de razón social', (await pp.content()).includes('no coincide con la raz'));

// Titular correcto
await pp.fill('input[name=titular]', 'Proveedor Test E2E S.A.');
await pp.fill('input[name=cbu]', '2850590940090418135201');
{
  const before = pp.url();
  await pp.locator('form').nth(1).locator('button[type=submit]').click();
  await pp.waitForURL((u) => u.href !== before && /[?](ok|error)=/.test(u.href));
}
check('Proveedor carga datos bancarios', (await pp.content()).includes('Datos bancarios guardados'));

// 3a. Validación bloqueada mientras falten documentos obligatorios
const val = await loginAs('validacion@demo.com');
await val.page.goto(supplierUrl);
await val.page.fill('input[name=phoneIndependent]', '+54 11 9999-8888');
await val.page.fill('input[name=phoneSource]', 'https://proveedortest.com/contacto');
await act(val.page, 'text=Registrar validación telefónica');
check('Bloquea validación sin documentos obligatorios', (await val.page.content()).includes('Faltan documentos obligatorios'));

// 3b. El proveedor sube los documentos obligatorios (AR: AFIP + constancia CBU)
await pp.goto(`${BASE}/portal/${token}`);
for (const docType of ['FISCAL', 'BANCARIO']) {
  await pp.goto(`${BASE}/portal/${token}`);
  await pp.setInputFiles(`#doc-${docType} input[type=file]`, {
    name: `${docType.toLowerCase()}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 doc'),
  });
  await act(pp, `#doc-${docType} button`);
}
check('Checklist de documentos completa', (await pp.locator('.badge.ok', { hasText: 'Subido' }).count()) === 2);

// 3b-bis. Auditoría solicita correcciones y el proveedor corrige y reenvía
const aud0 = await loginAs('auditoria@demo.com');
await aud0.page.goto(supplierUrl);
await aud0.page.fill('input[name=note]', 'Aclarar el domicilio fiscal completo');
await act(aud0.page, 'button:has-text("Solicitar correcciones")');
check('Auditoría solicita correcciones', (await aud0.page.content()).includes('Correcciones solicitadas'));
await pp.goto(`${BASE}/portal/${token}`);
check('Portal muestra las observaciones al proveedor', (await pp.content()).includes('Aclarar el domicilio fiscal completo'));
await pp.fill('input[name=domicilio]', 'Av. Siempreviva 123, Piso 2, CABA');
await act(pp, 'form >> nth=0 >> button[type=submit]');
check('Proveedor corrige y reenvía', (await pp.content()).includes('Datos guardados'));

// 3c. Validación telefónica: mismo teléfono del proveedor → bloqueado
await val.page.goto(supplierUrl);
await val.page.fill('input[name=phoneIndependent]', '+54 11 4444 5555');
await val.page.fill('input[name=phoneSource]', 'https://proveedortest.com/contacto');
await act(val.page, 'form[action] >> text=Registrar validación telefónica');
check('Bloquea teléfono no independiente', (await val.page.content()).includes('BLOQUEADO'));

// Teléfono independiente distinto → pasa
await val.page.goto(supplierUrl);
await val.page.fill('input[name=phoneIndependent]', '+54 11 9999-8888');
await val.page.fill('input[name=phoneSource]', 'https://proveedortest.com/contacto');
await act(val.page, 'text=Registrar validación telefónica');
check('Validación telefónica registrada', (await val.page.content()).includes('Validación telefónica registrada'));

// 4. Tesorería registra transferencia de prueba
const tes = await loginAs('tesoreria@demo.com');
await tes.page.goto(supplierUrl);
await act(tes.page, 'text=Registrar transferencia de prueba');
check('Transferencia de prueba registrada', (await tes.page.content()).includes('Transferencia de prueba registrada'));

// 5. Segregación: el MISMO usuario de tesorería intenta confirmar → bloqueado
await tes.page.goto(supplierUrl);
await act(tes.page, 'text=Registrar confirmación verbal');
check('Segregación de funciones bloquea acción consecutiva', (await tes.page.content()).includes('Segregación de funciones'));

// Otro usuario de tesorería confirma → pasa
const tes2 = await loginAs('tesoreria2@demo.com');
await tes2.page.goto(supplierUrl);
await act(tes2.page, 'text=Registrar confirmación verbal');
check('Otro usuario confirma la transferencia', (await tes2.page.content()).includes('Confirmación registrada'));

// 6. Auditoría: hay red flag pendiente (teléfono no independiente) → no puede aprobar
const aud = await loginAs('auditoria@demo.com');
await aud.page.goto(supplierUrl);
const hasFlag = (await aud.page.content()).includes('🚩');
check('Red flag visible para auditoría', hasFlag);
await act(aud.page, 'text=Otorgar aprobación final');
check('Aprobación bloqueada con red flags pendientes', (await aud.page.content()).includes('sin resolver'));

// Resuelve la flag y aprueba
await aud.page.goto(supplierUrl);
await aud.page.fill('input[name=note]', 'Verificado telefónicamente con el proveedor');
await act(aud.page, 'text=Marcar resuelta');
await act(aud.page, 'text=Otorgar aprobación final');
check('Aprobación final otorgada', (await aud.page.content()).includes('Proveedor aprobado'));

// 7. Proveedor aprobado carga una factura
await pp.goto(`${BASE}/portal/${token}`);
check('Portal habilita carga de facturas tras aprobación', await pp.locator('input[name=number]').count() === 1);
await pp.selectOption('select[name=kind]', 'FACTURA');
await pp.fill('input[name=number]', '0001-00001234');
await pp.fill('input[name=issueDate]', '2026-07-15');
await pp.fill('input[name=amount]', '2500000');
await pp.setInputFiles('input[name=file][accept]', {
  name: 'factura.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test'),
});
await act(pp, 'text=Enviar comprobante');
check('Proveedor carga factura', (await pp.content()).includes('Comprobante recibido'));

// 8. Doble aprobación (monto 2.5M > umbral 1M requiere 2 aprobaciones)
await aud.page.goto(`${BASE}/facturas`);
await act(aud.page, 'text=Pasar a revisión');
await act(aud.page, 'text=Aprobar para pago');
check('Primera aprobación no alcanza (doble aprobación)', (await aud.page.content()).includes('1/2'));
// mismo usuario no puede aprobar dos veces
await act(aud.page, 'text=Aprobar para pago');
check('Bloquea doble aprobación del mismo usuario', (await aud.page.content()).includes('ya aprobó'));
// segunda aprobación por compras
await compras.page.goto(`${BASE}/facturas`);
await act(compras.page, 'text=Aprobar para pago');
check('Segunda aprobación completa el umbral', (await compras.page.content()).includes('Aprobada para pago'));

// 9. Tesorería programa y paga con recibo
await tes.page.goto(`${BASE}/facturas`);
await act(tes.page, 'text=Programar pago');
await tes.page.setInputFiles('input[name=file]', {
  name: 'recibo.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 recibo'),
});
await tes.page.check('input[name=markPaid]');
await act(tes.page, 'button:has-text("Subir")');
check('Factura pagada con recibo', (await tes.page.content()).includes('Comprobante cargado'));

// 10. Proveedor descarga el recibo desde su portal
await pp.goto(`${BASE}/portal/${token}`);
const html = await pp.content();
check('Proveedor ve factura Pagada', html.includes('Pagada'));
check('Proveedor puede descargar recibo', html.includes('recibo.pdf'));
const reciboHref = await pp.locator('a', { hasText: 'recibo.pdf' }).first().getAttribute('href');
const dl = await pctx.request.get(`${BASE}${reciboHref}`);
check('Descarga de recibo desencriptado OK', dl.ok() && (await dl.body()).toString().includes('recibo'));

// 11. Auditoría ve el audit log
await aud.page.goto(`${BASE}/auditoria`);
const audHtml = await aud.page.content();
check('Audit log registra el circuito completo',
  audHtml.includes('APROBACION_FINAL') && audHtml.includes('VALIDACION_BLOQUEADA') && audHtml.includes('CARGA_FACTURA'));

await browser.close();
console.log(results.join('\n'));
