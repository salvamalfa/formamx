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
