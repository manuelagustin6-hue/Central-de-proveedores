export function Flash({ searchParams }: { searchParams?: { error?: string; ok?: string } }) {
  if (searchParams?.error) return <div className="alert error">⚠️ {searchParams.error}</div>;
  if (searchParams?.ok) return <div className="alert ok">✓ {searchParams.ok}</div>;
  return null;
}

const STATUS_CLASS: Record<string, string> = {
  PENDIENTE_DATOS: '',
  DATOS_CARGADOS: 'info',
  VALIDADO_TELEFONICAMENTE: 'info',
  PRUEBA_ENVIADA: 'warn',
  PRUEBA_CONFIRMADA: 'warn',
  APROBADO: 'ok',
  RECHAZADO: 'danger',
  RECIBIDA: '',
  EN_REVISION: 'info',
  APROBADA_PARA_PAGO: 'warn',
  PROGRAMADA: 'warn',
  PAGADA: 'ok',
  PENDIENTE: '',
  VALIDADA_TELEFONICAMENTE: 'info',
  APROBADA: 'ok',
  RECHAZADA: 'danger',
};

export function StatusBadge({ status, labels }: { status: string; labels: Record<string, string> }) {
  return <span className={`badge ${STATUS_CLASS[status] ?? ''}`}>{labels[status] ?? status}</span>;
}
