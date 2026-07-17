/**
 * Envío de emails vía Resend (https://resend.com).
 * Configuración: RESEND_API_KEY (obligatoria para enviar) y MAIL_FROM
 * (remitente; sin dominio propio verificado usar "onboarding@resend.dev").
 * Si no hay API key, solo se registra en consola (modo desarrollo).
 * Nunca corta el flujo principal: un fallo de email no debe impedir la operación.
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Plantilla HTML institucional. Los enlaces del texto se vuelven clickeables. */
function htmlTemplate(subject: string, body: string): string {
  const content = escapeHtml(body)
    .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" style="color:#1d4ed8;word-break:break-all;">$1</a>')
    .replace(/\n/g, '<br/>');
  return `<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;background:#f4f6f9;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr>
          <td style="background:#0f1e3d;border-radius:10px 10px 0 0;padding:20px 28px;">
            <span style="color:#ffffff;font-size:18px;font-weight:700;">Central de Proveedores</span>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;padding:28px;border:1px solid #dde3ec;border-top:none;">
            <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#1d2733;">${escapeHtml(subject)}</p>
            <p style="margin:0;font-size:14px;line-height:1.7;color:#1d2733;">${content}</p>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;border-radius:0 0 10px 10px;padding:16px 28px;border:1px solid #dde3ec;border-top:1px solid #eef1f6;">
            <p style="margin:0;font-size:12px;color:#5b6b7f;">
              🔒 Nunca le pediremos cambiar datos bancarios por email ni por teléfono.
              Ante cualquier duda, contacte a su comprador por los canales habituales.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

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
        html: htmlTemplate(subject, body),
      }),
    });
    if (!res.ok) {
      console.error(`Error de Resend (${res.status}):`, await res.text());
    }
  } catch (e) {
    console.error('Error enviando email:', e);
  }
}
