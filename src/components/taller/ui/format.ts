export function money(mxn: number): string {
  return `$${(mxn / 100).toLocaleString('es-MX')}`;
}

export function formatSync(sqlUtc: string): string {
  // D1 guarda 'YYYY-MM-DD HH:MM:SS' en UTC.
  const date = new Date(sqlUtc.replace(' ', 'T') + 'Z');
  return date.toLocaleString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  });
}

// Solo la fecha (sin hora): para la columna "Creado" de la tabla de pedidos.
export function formatDate(sqlUtc: string): string {
  const date = new Date(sqlUtc.replace(' ', 'T') + 'Z');
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

// Nº corto y legible del id (`ord_abc123def` → `abc123de`). Solo presentación.
export function shortId(id: string): string {
  const tail = id.includes('_') ? id.slice(id.indexOf('_') + 1) : id;
  return tail.length > 8 ? tail.slice(0, 8) : tail;
}
