import { useEffect, useState } from 'preact/hooks';
import { getBobinas, type Bobina, type Order, type PrintJob, type Spool } from '../../../lib/taller';
import { useTallerCore } from '../coreData';
import { useSession } from '../hooks/useSession';
import { PART_LABEL } from '../pedidos/labels';
import { colorLabel, colorSwatch } from '../ui/colores';
import { formatSync, shortId } from '../ui/format';

// Sub-pestaña "Impresora": la cama, el trabajo actual, la cola y las bobinas
// del AMS. El AMS sigue siendo SOLO lectura (lo dicta la impresora, el
// agente lo sincroniza); lo único accionable es confirmar la cama despejada.
export function ImpresoraPanel() {
  const core = useTallerCore();
  const { token } = useSession();
  const [bobinas, setBobinas] = useState<Bobina[]>([]);

  // Fetch propio del panel: la heurística de % por bobina no entra al core
  // (ver docs/ROADMAP_ARQUITECTURA.md — solo pedidos/impresora viven ahí).
  useEffect(() => {
    if (!token) return;
    let vivo = true;
    getBobinas(token)
      .then((bs) => {
        if (vivo) setBobinas(bs);
      })
      .catch(() => {
        /* sin datos de bobinas: las barras del AMS caen a "sin datos" */
      });
    return () => {
      vivo = false;
    };
  }, [token]);

  const jobsConPedido = core.orders.flatMap((order) =>
    order.jobs.map((job) => ({ job, order })),
  );
  const actual = jobsConPedido.find((x) => x.job.status === 'printing');
  const enCola = jobsConPedido.filter(
    (x) => x.job.status === 'queued' || x.job.status === 'claimed',
  );

  return (
    <div class="mt-4 flex flex-col gap-4">
      {!core.bedClear && (
        <div class="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-m)] bg-[var(--highlight-soft)] px-5 py-4">
          <p class="m-0 text-sm text-[var(--tinta)]">
            <strong>La cama no está despejada.</strong> Retira la última pieza para que el
            agente siga mandando trabajos.
          </p>
          <button
            type="button"
            class="btn btn-sm shrink-0"
            style={{ background: 'var(--mostaza)', color: 'var(--tinta)' }}
            onClick={() => void core.bedCleared()}
          >
            Ya la despejé
          </button>
        </div>
      )}

      <div class="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div class="flex flex-col gap-4">
          <TrabajoActual actual={actual} amsSyncedAt={core.amsSyncedAt} />
          <EnCola jobs={enCola} />
        </div>
        <BobinasAms spools={core.spools} bobinas={bobinas} amsSyncedAt={core.amsSyncedAt} />
      </div>
    </div>
  );
}

// Card oscura "Imprimiendo ahora": el único job en `printing` a lo largo de
// todos los pedidos (la impresora imprime una pieza a la vez).
function TrabajoActual({
  actual,
  amsSyncedAt,
}: {
  actual: { job: PrintJob; order: Order } | undefined;
  amsSyncedAt: string | null;
}) {
  return (
    <div class="rounded-[var(--radius-m)] bg-[var(--surface-inverse)] p-5 text-[var(--crema)] shadow-[var(--shadow-card)]">
      <div class="meta-caps mb-3 text-[10px]" style={{ color: 'rgba(246,238,221,0.5)' }}>
        Imprimiendo ahora
      </div>
      {actual ? (
        <>
          <div class="flex items-baseline justify-between gap-3">
            <div
              class="min-w-0 truncate text-[26px] font-bold"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {PART_LABEL[actual.job.part]} · {shortId(actual.order.id)}
            </div>
            <div
              class="shrink-0 text-[26px] font-bold text-[var(--mostaza)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {actual.job.progress_pct ?? 0}%
            </div>
          </div>
          <div
            class="my-4 h-2.5 overflow-hidden rounded-[var(--radius-pill)]"
            style={{ background: 'rgba(246,238,221,0.15)' }}
          >
            <div
              class="h-full rounded-[var(--radius-pill)] bg-[var(--naranja)]"
              style={{
                width: `${actual.job.progress_pct ?? 0}%`,
                transition: 'width var(--duration-slow) var(--ease-out)',
              }}
            />
          </div>
          <div class="meta-caps text-[11px]" style={{ color: 'rgba(246,238,221,0.6)' }}>
            filamento {actual.job.colors.map((c) => colorLabel(c)).join(', ') || '—'}
          </div>
        </>
      ) : (
        <>
          <p class="m-0 text-[15px]">Nada en la cama.</p>
          {/* Nota corta, con otro texto que el aviso de la card de bobinas
              (más abajo) para no duplicar el mismo mensaje dos veces en la
              misma pantalla. */}
          <p class="meta-caps mt-2 text-[11px]" style={{ color: 'rgba(246,238,221,0.55)' }}>
            {amsSyncedAt ? `AMS sincronizado ${formatSync(amsSyncedAt)}` : 'AMS sin sincronizar'}
          </p>
        </>
      )}
    </div>
  );
}

const COLA_COLS = '90px 1fr 90px';

// Card "En cola": jobs pendientes de imprimir (queued/claimed) de cualquier
// pedido, en el orden en que llegaron.
function EnCola({ jobs }: { jobs: { job: PrintJob; order: Order }[] }) {
  return (
    <div class="rounded-[var(--radius-m)] border border-[var(--border-soft)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-card)]">
      <h2 class="m-0 mb-3 text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
        En cola
      </h2>
      {jobs.length === 0 ? (
        <p class="m-0 text-sm text-[var(--text-muted)]">Nada en cola.</p>
      ) : (
        <div class="flex flex-col">
          {jobs.map(({ job, order }) => (
            <div
              key={job.id}
              class="grid items-center gap-3 border-t border-[var(--border-soft)] px-2 py-3"
              style={{ gridTemplateColumns: COLA_COLS }}
            >
              <span class="text-[12px] text-[var(--text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
                {shortId(order.id)}
              </span>
              <span class="text-sm">{PART_LABEL[job.part]}</span>
              <span
                class="truncate text-right text-[11px] text-[var(--text-muted)]"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {job.colors.map((c) => colorLabel(c)).join(', ') || '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Card "Bobinas AMS": una fila por ranura física (0-3), con la barra de
// % restante calculada por heurística (ver getPorcentaje) — nunca inventa un
// número sin una bobina `en_uso` que haga match.
function getPorcentaje(
  spool: Spool | undefined,
  bobinas: Bobina[],
): number | null {
  if (!spool?.color_id) return null;
  const match = bobinas.find(
    (b) => b.status === 'en_uso' && b.color_id === spool.color_id && b.material === spool.material,
  );
  if (!match || match.weight_g <= 0) return null;
  return Math.round((match.weight_left_g / match.weight_g) * 100);
}

function BobinasAms({
  spools,
  bobinas,
  amsSyncedAt,
}: {
  spools: Spool[];
  bobinas: Bobina[];
  amsSyncedAt: string | null;
}) {
  return (
    <div class="rounded-[var(--radius-m)] border border-[var(--border-soft)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-card)]">
      <div class="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="m-0 text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
          Bobinas AMS
        </h2>
        {amsSyncedAt ? (
          <span
            class="text-[10px] text-[var(--text-faint)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            leído de la impresora: {formatSync(amsSyncedAt)}
          </span>
        ) : (
          <span
            class="text-[10px] text-[var(--naranja-oscuro)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            sin lectura de la impresora — arranca el agente
          </span>
        )}
      </div>
      <div class="flex flex-col gap-4">
        {[0, 1, 2, 3].map((slot) => {
          const spool = spools.find((s) => s.slot === slot);
          const hex = spool?.color_hex ?? null;
          const catalogId = spool?.color_id ?? null;
          const empty = !hex && !catalogId;
          const nombre = empty ? 'vacía' : catalogId ? colorLabel(catalogId) : (hex ?? '');
          const swatch = hex ?? (catalogId ? colorSwatch(catalogId) : 'transparent');
          const pct = empty ? null : getPorcentaje(spool, bobinas);
          const bajo = pct != null && pct < 20;
          return (
            <div key={slot}>
              <div class="mb-2 flex items-center gap-2">
                <span
                  class="size-3.5 shrink-0 rounded-full border border-[var(--border-strong)]"
                  style={{ background: swatch }}
                />
                <span class="min-w-0 truncate text-sm">{nombre}</span>
                {hex && catalogId && (
                  <span
                    class="text-[10px] text-[var(--text-faint)]"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {hex}
                  </span>
                )}
                <span
                  class="ml-auto shrink-0 text-[11px]"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: bajo ? 'var(--naranja-oscuro)' : 'var(--text-faint)',
                  }}
                >
                  {empty ? '—' : pct == null ? 'sin datos' : `${pct}%`}
                </span>
              </div>
              <div class="h-1.5 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--crema-oscuro)]">
                {pct != null && (
                  <div
                    class="h-full rounded-[var(--radius-pill)]"
                    style={{ width: `${pct}%`, background: bajo ? 'var(--naranja)' : 'var(--bosque)' }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Candado de cama GLOBAL: bloquea a la impresora completa, por eso vive en el
// shell (arriba de todos los módulos), no dentro de una sección — salvo en la
// propia sub-pestaña Impresora, donde el shell lo oculta porque el panel de
// arriba ya trae su propio banner (más rico, con el copy del mockup). Ver
// TallerShell.tsx.
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
