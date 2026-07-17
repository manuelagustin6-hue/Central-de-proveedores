/**
 * Envío de emails vía Resend (https://resend.com).
 * Configuración: RESEND_API_KEY (obligatoria para enviar) y MAIL_FROM
 * (remitente; sin dominio propio verificado usar "onboarding@resend.dev").
 * Si no hay API key, solo se registra en consola (modo desarrollo).
 * Nunca corta el flujo principal: un fallo de email no debe impedir la operación.
 */
export async function sendNotification(to: string, subject: string, body: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[NOTIFICACIÓN sin enviar — falta RESEND_API_KEY] Para: ${to} | ${subject}\n${body}`);
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || 'Central de Proveedores <onboarding@resend.dev>',
        to: [to],
        subject,
        text: body,
      }),
    });
    if (!res.ok) {
      console.error(`Error de Resend (${res.status}):`, await res.text());
    }
  } catch (e) {
    console.error('Error enviando email:', e);
  }
}
