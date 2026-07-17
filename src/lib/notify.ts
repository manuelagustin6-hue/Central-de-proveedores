/**
 * Punto de integración de notificaciones por email.
 * En producción conectar con SendGrid o AWS SES; en desarrollo solo se registra en consola.
 */
export async function sendNotification(to: string, subject: string, body: string) {
  // TODO producción: reemplazar por SendGrid (@sendgrid/mail) o AWS SES (@aws-sdk/client-ses)
  console.log(`[NOTIFICACIÓN] Para: ${to} | Asunto: ${subject}\n${body}`);
}
