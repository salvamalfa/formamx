import { useEffect, useState } from "preact/hooks";
import {
  getBobinas,
  getQueue,
  type Bobina,
  type QueueJob,
  type Spool,
} from "../../../lib/taller";
import { useTallerCore } from "../coreData";
import { useSession } from "../hooks/useSession";
import { JOB_STATUS_LABEL, PART_LABEL } from "../pedidos/labels";
import {
  colorLabel,
  colorSwatch,
  familiaDeBobina,
  familiaDeRanura,
  mismaFamilia,
  nearestColorName,
} from "../ui/colores";
import { formatSync, shortId } from "../ui/format";
import { PiezasClientes } from "./PiezasClientes";

// Nombre visible de un trabajo en la cola, venga de donde venga: una pieza de
// cliente se llama como su STL; una de lámpara, por su parte y su pedido.
function tituloJob(job: QueueJob): string {
  if (job.custom_print_id) return job.custom_file_name ?? "Pieza de cliente";
  return `${PART_LABEL[job.part]}${job.order_id ? ` · ${shortId(job.order_id)}` : ""}`;
}

// La cola física de la impresora se refresca sola; más seguido mientras haya
// algo corriendo, como la card de piezas de clientes.
const COLA_ACTIVA_MS = 15_000;
const COLA_TRANQUILA_MS = 60_000;

// Sub-pestaña "Impresora": la cama, el trabajo actual, la cola y las bobinas
// del AMS. El AMS sigue siendo SOLO lectura (lo dicta la impresora, el
// agente lo sincroniza); lo único accionable es confirmar la cama despejada.
export function ImpresoraPanel() {
  const core = useTallerCore();
  const { token } = useSession();
  const [bobinas, setBobinas] = useState<Bobina[]>([]);
  const [cola, setCola] = useState<QueueJob[]>([]);

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

  // La cola sale del endpoint propio, no de los pedidos: una pieza de cliente
  // no cuelga de ningún pedido y así también aparece aquí.
  const actual = cola.find((job) => job.status === "printing");
  const enCola = cola.filter(
    (job) => job.status === "queued" || job.status === "claimed",
  );
  const hayTrabajo = cola.length > 0;

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    const cargar = () =>
      getQueue(token)
        .then((js) => {
          if (vivo) setCola(js);
        })
        .catch(() => {
          /* sin cola: las cards de arriba se quedan en su estado vacío */
        });
    void cargar();
    const id = setInterval(
      cargar,
      hayTrabajo ? COLA_ACTIVA_MS : COLA_TRANQUILA_MS,
    );
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [token, hayTrabajo]);

  return (
    <div class="mt-4 flex flex-col gap-4">
      {!core.bedClear && (
        <div class="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-m)] bg-[var(--azul-claro)] px-5 py-4">
          <p class="m-0 text-sm text-[var(--tinta)]">
            <strong>La cama no está despejada.</strong> Retira la última pieza
            para que el agente siga mandando trabajos.
          </p>
          <button
            type="button"
            class="btn btn-sm shrink-0"
            style={{ background: "var(--azul)", color: "var(--tinta)" }}
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
        <BobinasAms
          spools={core.spools}
          bobinas={bobinas}
          amsSyncedAt={core.amsSyncedAt}
          onVincular={core.linkBobina}
        />
      </div>

      <PiezasClientes spools={core.spools} />
    </div>
  );
}

// Card oscura "Imprimiendo ahora": el único job en `printing` a lo largo de
// todos los pedidos (la impresora imprime una pieza a la vez).
function TrabajoActual({
  actual,
  amsSyncedAt,
}: {
  actual: QueueJob | undefined;
  amsSyncedAt: string | null;
}) {
  return (
    <div class="rounded-[var(--radius-m)] bg-[var(--surface-inverse)] p-5 text-[var(--blanco)] shadow-[var(--shadow-card)]">
      <div
        class="meta-caps mb-3 text-[10px]"
        style={{ color: "rgba(255,255,255,0.5)" }}
      >
        Imprimiendo ahora
      </div>
      {actual ? (
        <>
          <div class="flex items-baseline justify-between gap-3">
            <div
              class="min-w-0 truncate text-[26px] font-bold"
              style={{ fontFamily: "var(--font-display)" }}
              title={tituloJob(actual)}
            >
              {tituloJob(actual)}
            </div>
            <div
              class="shrink-0 text-[26px] font-bold text-[var(--azul)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {actual.progress_pct ?? 0}%
            </div>
          </div>
          <div
            class="my-4 h-2.5 overflow-hidden rounded-[var(--radius-pill)]"
            style={{ background: "rgba(255,255,255,0.15)" }}
          >
            <div
              class="h-full rounded-[var(--radius-pill)] bg-[var(--naranja)]"
              style={{
                width: `${actual.progress_pct ?? 0}%`,
                transition: "width var(--duration-slow) var(--ease-out)",
              }}
            />
          </div>
          <div
            class="meta-caps text-[11px]"
            style={{ color: "rgba(255,255,255,0.6)" }}
          >
            filamento{" "}
            {actual.colors.map((c) => colorLabel(c)).join(", ") || "—"}
          </div>
        </>
      ) : (
        <>
          <p class="m-0 text-[15px]">Nada en la cama.</p>
          {/* Nota corta, con otro texto que el aviso de la card de bobinas
              (más abajo) para no duplicar el mismo mensaje dos veces en la
              misma pantalla. */}
          <p
            class="meta-caps mt-2 text-[11px]"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            {amsSyncedAt
              ? `AMS sincronizado ${formatSync(amsSyncedAt)}`
              : "AMS sin sincronizar"}
          </p>
        </>
      )}
    </div>
  );
}

const COLA_COLS = "1fr auto auto";

// Card "En cola": todo lo pendiente de imprimir (queued/claimed) en el orden
// en que entró, sea de un pedido de lámpara o una pieza que subió un cliente.
// La impresora tiene UNA cola; esta card es su reflejo.
function EnCola({ jobs }: { jobs: QueueJob[] }) {
  return (
    <div class="rounded-[var(--radius-m)] border border-[var(--border-soft)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-card)]">
      <h2
        class="m-0 mb-3 text-lg font-bold"
        style={{ fontFamily: "var(--font-display)" }}
      >
        En cola
      </h2>
      {jobs.length === 0 ? (
        <p class="m-0 text-sm text-[var(--text-muted)]">Nada en cola.</p>
      ) : (
        <div class="flex flex-col">
          {jobs.map((job) => (
            <div
              key={job.id}
              class="grid items-center gap-3 border-t border-[var(--border-soft)] px-2 py-3"
              style={{ gridTemplateColumns: COLA_COLS }}
            >
              <span class="min-w-0 truncate text-sm" title={tituloJob(job)}>
                {tituloJob(job)}
              </span>
              <span class="shrink-0 text-[11px] text-[var(--text-muted)]">
                {job.colors.map((c) => colorLabel(c)).join(", ") || "—"}
              </span>
              {/* 'preparando' (claimed) es la ventana en que el agente ya se
                  llevó el trabajo pero la impresora todavía no arranca. */}
              <span class="tag tag-neutral shrink-0">
                {JOB_STATUS_LABEL[job.status]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Card "Bobinas AMS": una fila por ranura física (0-3). El % restante sale
// directo de la bobina vinculada a la ranura (spool_slots.bobina_id, 0019);
// sin vincular, se muestra "sin datos" — nunca se adivina por color.
function getPorcentaje(spool: Spool | undefined): number | null {
  if (!spool?.bobina_id || !spool.bobina_weight_g || spool.bobina_weight_g <= 0)
    return null;
  return Math.round(
    ((spool.bobina_weight_left_g ?? 0) / spool.bobina_weight_g) * 100,
  );
}

function BobinasAms({
  spools,
  bobinas,
  amsSyncedAt,
  onVincular,
}: {
  spools: Spool[];
  bobinas: Bobina[];
  amsSyncedAt: string | null;
  onVincular: (slot: number, bobinaId: string | null) => Promise<void>;
}) {
  return (
    <div class="rounded-[var(--radius-m)] border border-[var(--border-soft)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-card)]">
      <div class="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2
          class="m-0 text-lg font-bold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Bobinas AMS
        </h2>
        {amsSyncedAt ? (
          <span class="text-[10px] text-[var(--text-faint)]">
            leído de la impresora: {formatSync(amsSyncedAt)}
          </span>
        ) : (
          <span class="text-[10px] text-[var(--naranja-oscuro)]">
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
          const nombre = empty
            ? "vacía"
            : catalogId
              ? colorLabel(catalogId)
              : nearestColorName(hex!);
          const swatch =
            hex ?? (catalogId ? colorSwatch(catalogId) : "transparent");
          const pct = empty ? null : getPorcentaje(spool);
          const bajo = pct != null && pct < 20;
          // Candidatas en DOS grupos, nunca un filtro duro. Arriba las que
          // hacen juego: misma familia de color y mismo material. Abajo el
          // resto, porque esconderlas ya se vio como un bug ("no puedo
          // vincular") cuando el material no calzaba exacto — "PLA" vs "PLA+",
          // mayúsculas — o cuando el AMS reportaba un hex raro.
          //
          // La familia tolera tonos: un blanco #F4F4F2 de la repisa empareja
          // con la ranura que la impresora reporta como #FFFFFF, y ambos son
          // 'blanco'. Comparar hex exactos no serviría de nada.
          const familiaRanura = familiaDeRanura({
            color_hex: spool?.color_hex ?? null,
            color_id: catalogId,
          });
          const vivas = bobinas.filter((b) => b.status !== "agotada");
          const hacenJuego = vivas.filter(
            (b) =>
              mismaFamilia(familiaRanura, familiaDeBobina(b)) &&
              (!spool?.material ||
                b.material.toLowerCase() === spool.material.toLowerCase()),
          );
          const juegoIds = new Set(hacenJuego.map((b) => b.id));
          const resto = vivas.filter((b) => !juegoIds.has(b.id));
          const etiqueta = (b: Bobina) =>
            `${colorLabel(b.color_id)} · ${b.material} · ${b.weight_left_g} g`;
          return (
            <div key={slot}>
              <div class="mb-2 flex items-center gap-2">
                <span
                  class="size-3.5 shrink-0 rounded-full border border-[var(--border-strong)]"
                  style={{ background: swatch }}
                />
                <span class="min-w-0 truncate text-sm">{nombre}</span>
                {hex && (
                  <span class="text-[10px] text-[var(--text-faint)]">
                    {hex}
                  </span>
                )}
                <span
                  class="ml-auto shrink-0 text-[11px]"
                  style={{
                    color: bajo ? "var(--naranja-oscuro)" : "var(--text-faint)",
                  }}
                >
                  {empty ? "—" : pct == null ? "sin datos" : `${pct}%`}
                </span>
              </div>
              <div class="h-1.5 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--borde)]">
                {pct != null && (
                  <div
                    class="h-full rounded-[var(--radius-pill)]"
                    style={{
                      width: `${pct}%`,
                      background: bajo ? "var(--naranja)" : "var(--bosque)",
                    }}
                  />
                )}
              </div>
              {!empty && (
                <label class="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--text-faint)]">
                  <span class="shrink-0">Bobina del almacén:</span>
                  <select
                    class="w-full rounded border border-[var(--border-soft)] bg-[var(--surface-card)] px-1.5 py-1 text-[11px] text-[var(--text-muted)]"
                    value={spool?.bobina_id ?? ""}
                    onChange={(e) => {
                      const v = (e.currentTarget as HTMLSelectElement).value;
                      void onVincular(slot, v || null);
                    }}
                  >
                    <option value="">Sin vincular</option>
                    {hacenJuego.length > 0 && (
                      <optgroup label="Del mismo color">
                        {hacenJuego.map((b) => (
                          <option key={b.id} value={b.id}>
                            {etiqueta(b)}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {resto.length > 0 && (
                      <optgroup
                        label={
                          hacenJuego.length > 0 ? "Otros" : "Ninguna hace juego"
                        }
                      >
                        {resto.map((b) => (
                          <option key={b.id} value={b.id}>
                            {etiqueta(b)}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </label>
              )}
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
      class="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-m)] bg-[var(--tinta)] p-4 text-[var(--blanco)]"
      role="alert"
    >
      <p class="m-0 text-sm">
        <span class="font-bold">Hay una pieza en la cama.</span> La impresora no
        recibirá el siguiente trabajo hasta que la retires.
      </p>
      <button
        type="button"
        class="btn btn-sm btn-primary shrink-0"
        onClick={() => void bedCleared()}
      >
        Cama despejada
      </button>
    </div>
  );
}
