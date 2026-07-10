import { useTallerCore } from '../coreData';
import { colorLabel, colorSwatch } from '../ui/colores';
import { formatSync } from '../ui/format';

// Panel del AMS: SOLO lectura. El AMS de la impresora dicta el estado; el
// agente lo sincroniza y aquí únicamente se muestra.
export function ImpresoraPanel() {
  const { spools, amsSyncedAt } = useTallerCore();

  return (
    <section class="mt-4 rounded-[var(--radius-m)] border border-[var(--border-soft)] bg-[var(--surface-card)] p-5">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h3 class="meta-caps m-0 text-[var(--text-muted)]">AMS — qué hay cargado</h3>
        {amsSyncedAt ? (
          <span class="text-[10px] text-[var(--text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
            leído de la impresora: {formatSync(amsSyncedAt)}
          </span>
        ) : (
          <span class="text-[10px] text-[var(--naranja-oscuro)]" style={{ fontFamily: 'var(--font-mono)' }}>
            sin lectura de la impresora — arranca el agente
          </span>
        )}
      </div>
      <div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((slot) => {
          const spool = spools.find((s) => s.slot === slot);
          const hex = spool?.color_hex ?? null;
          const catalogId = spool?.color_id ?? null;
          const empty = !hex && !catalogId;
          return (
            <div key={slot} class="flex flex-col gap-1.5 text-sm">
              <span class="meta-caps text-[var(--text-faint)]">Ranura {slot + 1}</span>
              <div class="flex items-center gap-2">
                <span
                  class="size-5 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.18)]"
                  style={{ background: hex ?? (catalogId ? colorSwatch(catalogId) : 'transparent') }}
                />
                <span class="min-w-0 truncate font-semibold">
                  {empty ? 'vacía' : catalogId ? colorLabel(catalogId) : (hex ?? '')}
                </span>
                {hex && catalogId && (
                  <span class="text-[10px] text-[var(--text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
                    {hex}
                  </span>
                )}
              </div>
              <span class="meta-caps text-[10px] text-[var(--text-muted)]">
                {spool?.material ?? (empty ? '—' : 'sin material')}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// Candado de cama: bloquea a la impresora completa, por eso vive en el shell
// (arriba de todos los módulos), no dentro de una sección.
export function BedAlert() {
  const { bedClear, bedCleared } = useTallerCore();
  if (bedClear) return null;
  return (
    <div
      class="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-m)] bg-[var(--tinta)] p-4 text-[var(--crema)]"
      role="alert"
    >
      <p class="m-0 text-sm">
        <span class="font-bold">Hay una pieza en la cama.</span> La impresora no recibirá el
        siguiente trabajo hasta que la retires.
      </p>
      <button type="button" class="btn btn-sm btn-primary shrink-0" onClick={() => void bedCleared()}>
        Cama despejada
      </button>
    </div>
  );
}
