import type { ResumenVentasPunto } from '../../../lib/taller';

// Nombres de mes cortos en español, sin punto (feb, mar, abr…). Se exporta
// para que ResumenPanel arme el rango del título ("feb — jul 2026") con el
// mismo formato que usan las barras.
export const MESES_CORTOS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

export function mesCorto(mes: string): string {
  const idx = Number(mes.slice(5, 7)) - 1;
  return MESES_CORTOS[idx] ?? mes;
}

// Monto en centavos → "$Nk" con un decimal (ej. 49900 centavos → "$0.5k").
function formatK(centavos: number): string {
  const miles = centavos / 100 / 1000;
  return `$${miles.toFixed(1)}k`;
}

// Gráfica de barras de ventas por mes, CSS puro (sin librerías). El mes
// actual es siempre el último de la serie: resalta en azul —el color de lo
// informativo—, el resto en el gris del borde. Accesible vía `role="img"` +
// `aria-label` que enumera
// "mes: valor" (el mes actual se marca aparte en el label).
export function BarChart({ serie }: { serie: ResumenVentasPunto[] }) {
  if (serie.length === 0) {
    return <p class="m-0 text-sm text-[var(--text-muted)]">Sin datos todavía.</p>;
  }

  const max = Math.max(...serie.map((p) => p.total_mxn), 1);
  const ultimo = serie.length - 1;
  const label = serie
    .map((p, i) => `${mesCorto(p.mes)}: ${formatK(p.total_mxn)}${i === ultimo ? ' (mes actual)' : ''}`)
    .join(', ');

  return (
    <div class="flex h-[180px] items-end gap-4" role="img" aria-label={label}>
      {serie.map((p, i) => {
        const actual = i === ultimo;
        const alto = Math.max(10, Math.round((p.total_mxn / max) * 140));
        return (
          <div key={p.mes} class="flex h-full flex-1 flex-col items-center justify-end gap-2">
            <span
              class="text-[11px]"
              style={{
                color: actual ? 'var(--accent-hover)' : 'var(--text-faint)',
              }}
            >
              {formatK(p.total_mxn)}
            </span>
            <div
              class={actual ? 'mes-actual w-full max-w-[56px]' : 'w-full max-w-[56px]'}
              style={{
                height: `${alto}px`,
                background: actual ? 'var(--accent)' : 'var(--borde)',
                borderRadius: '8px 8px 4px 4px',
                transition: 'height var(--duration-slow) var(--ease-out)',
              }}
            />
            <span class="meta-caps text-[11px] text-[var(--text-faint)]">{mesCorto(p.mes)}</span>
          </div>
        );
      })}
    </div>
  );
}
