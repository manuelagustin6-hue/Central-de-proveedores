import Link from 'next/link';

/**
 * Paginación por servidor. Construye los enlaces conservando los filtros
 * actuales (searchParams) y cambiando solo la página.
 */
export function Pagination({
  basePath,
  params,
  page,
  pageSize,
  total,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  const link = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== 'page') q.set(k, v);
    q.set('page', String(p));
    return `${basePath}?${q.toString()}`;
  };

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
      <span className="muted">
        Mostrando {from}–{to} de {total.toLocaleString('es-AR')}
      </span>
      <div style={{ display: 'flex', gap: 6 }}>
        {page > 1 && (
          <Link className="btn small secondary" href={link(page - 1)}>
            ← Anterior
          </Link>
        )}
        <span className="badge" style={{ alignSelf: 'center' }}>
          Página {page} de {pages}
        </span>
        {page < pages && (
          <Link className="btn small secondary" href={link(page + 1)}>
            Siguiente →
          </Link>
        )}
      </div>
    </div>
  );
}
