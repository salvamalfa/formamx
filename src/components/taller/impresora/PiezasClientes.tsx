import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  borrarPrint,
  cancelarPrint,
  getCustomPrints,
  getPreviewUrl,
  imprimirPrint,
  patchPrintPrecio,
  rebanarPrint,
  uploadCustomPrint,
  type CustomPrint,
  type CustomPrintCounts,
  type CustomPrintStatus,
  type Spool,
} from '../../../lib/taller';
import { useSession } from '../hooks/useSession';
import { colorLabel, colorSwatch } from '../ui/colores';
import { IconBorrar, IconRebanar, IconUpload } from '../ui/icons';

// Card "Piezas de clientes": subir un STL, pedir su rebanado con el material y
// color que hay cargados en el AMS, y revisar el estimado antes de imprimir.
// El rebanado lo hace el agente en la PC del taller (docs/STL_CLIENTES.md).
// Tarjetas en vez de filas (rediseño agosto 2026): Pendientes muestra lo que
// todavía necesita una decisión; Histórico, lo ya impreso — el worker borra
// el STL y la vista previa de R2 en cuanto la pieza termina, así que ahí solo
// quedan los datos.

const ESTADO_LABEL: Record<CustomPrintStatus, string> = {
  subido: 'Subido',
  en_cola: 'En cola de rebanado',
  rebanando: 'Rebanando',
  listo: 'Listo para imprimir',
  imprimiendo: 'Imprimiendo',
  terminado: 'Terminado',
  fallido: 'No se pudo rebanar',
  cancelado: 'Cancelada',
  borrado: 'Borrado a medias',
};

// Mientras alguna pieza está en la cola del agente, se refresca más seguido.
const POLL_ACTIVO_MS = 15_000;
const POLL_TRANQUILO_MS = 60_000;

const REBANABLES: CustomPrintStatus[] = ['subido', 'listo', 'fallido'];
const EN_PROCESO: CustomPrintStatus[] = ['en_cola', 'rebanando', 'imprimiendo'];

// Centavos → "$123 MXN" (sin decimales: los precios del taller siempre son
// pesos enteros, igual que el resto de /taller).
export function formatMxn(centavos: number): string {
  return `$${Math.round(centavos / 100)} MXN`;
}

// Lo que dice la etiqueta de la tarjeta. Para una pieza mandada a imprimir no
// basta con su estado propio ('imprimiendo' desde el clic): el trabajo puede
// seguir esperando turno en la cola física detrás de una lámpara, y decir
// "Imprimiendo" sin porcentaje mientras la impresora ni ha arrancado es
// justo lo que confundía. El porcentaje solo existe cuando de verdad imprime.
export function estadoLabel(pieza: Pick<CustomPrint, 'status' | 'job_status' | 'progress_pct'>): string {
  if (pieza.status !== 'imprimiendo') return ESTADO_LABEL[pieza.status];
  // "de impresión" no es adorno: la pieza ya tuvo una cola antes, la de
  // rebanado, y las dos etiquetas conviven en la misma tarjeta.
  if (pieza.job_status === 'queued') return 'En cola de impresión';
  if (pieza.job_status === 'claimed') return 'Preparando';
  return pieza.progress_pct != null ? `Imprimiendo ${pieza.progress_pct}%` : 'Imprimiendo';
}

export function formatDuracion(segundos: number): string {
  const h = Math.floor(segundos / 3600);
  const m = Math.round((segundos % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export function formatTamano(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

type Tab = 'pendientes' | 'historico';

export function PiezasClientes({ spools }: { spools: Spool[] }) {
  const { token, invalidate } = useSession();
  const [piezas, setPiezas] = useState<CustomPrint[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState<number | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('pendientes');
  const [counts, setCounts] = useState<CustomPrintCounts | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const activo = piezas.some((p) => EN_PROCESO.includes(p.status));

  // useSession() devuelve funciones nuevas en cada render, así que `invalidate`
  // NO puede ir en las dependencias del efecto: lo re-dispararía en cada
  // render y el polling se volvería un bucle que martillea la API.
  const invalidateRef = useRef(invalidate);
  invalidateRef.current = invalidate;

  // El scope lo resuelve el worker: el listado va topado, así que filtrar las
  // dos pestañas en el navegador escondería piezas pendientes viejas detrás de
  // las terminadas (y entonces no habría cómo cancelarlas ni borrarlas).
  useEffect(() => {
    if (!token) return;
    let vivo = true;
    setCargando(true);
    const cargar = () =>
      getCustomPrints(token, tab)
        .then((r) => {
          if (!vivo) return;
          setPiezas(r.prints);
          setCounts(r.counts);
          setError(null);
        })
        .catch((err: Error) => {
          if (!vivo) return;
          if (err.message === 'no_autorizado') invalidateRef.current('Token inválido.');
          else setError('No pude leer las piezas de clientes.');
        })
        .finally(() => vivo && setCargando(false));
    void cargar();
    const id = setInterval(cargar, activo ? POLL_ACTIVO_MS : POLL_TRANQUILO_MS);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [token, activo, tab]);

  async function subir(file: File) {
    if (!token) return;
    setError(null);
    setSubiendo(0);
    try {
      const nueva = await uploadCustomPrint(token, file, setSubiendo);
      // Una pieza recién subida siempre es pendiente: si Salva estaba viendo
      // el histórico, la pestaña se mueve con ella.
      setTab('pendientes');
      setPiezas((ps) => [nueva, ...ps]);
      setAbierta(nueva.id);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'no_autorizado') invalidate('Token inválido.');
      else if (msg === 'error_400') setError('El archivo no sirve: debe ser un .stl de menos de 100 MB.');
      else setError('No pude subir el archivo.');
    } finally {
      setSubiendo(null);
      if (input.current) input.current.value = '';
    }
  }

  // Actualización optimista con vuelta atrás, como en Inventario: la acción se
  // ve al instante y si el worker la rechaza se restaura lo que había.
  async function accion(id: string, fn: () => Promise<unknown>, optimista: Partial<CustomPrint>) {
    const previas = piezas;
    setError(null);
    setPiezas((ps) => ps.map((p) => (p.id === id ? { ...p, ...optimista } : p)));
    try {
      await fn();
      if (token) {
        const r = await getCustomPrints(token, tab);
        setPiezas(r.prints);
        setCounts(r.counts);
      }
    } catch (err) {
      setPiezas(previas);
      const msg = (err as Error).message;
      if (msg === 'no_autorizado') invalidate('Token inválido.');
      else if (msg === 'error_503') setError('No pude borrar el archivo. Inténtalo otra vez.');
      else setError('No pude hacer ese cambio.');
    }
  }

  return (
    <div class="rounded-[var(--radius-m)] border border-[var(--border-soft)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-card)]">
      <div class="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h2 class="m-0 text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
          Piezas de clientes
        </h2>
        <input
          ref={input}
          type="file"
          accept=".stl"
          class="hidden"
          onChange={(e) => {
            const file = (e.currentTarget as HTMLInputElement).files?.[0];
            if (file) void subir(file);
          }}
        />
        <button
          type="button"
          class="btn btn-sm btn-terciario inline-flex items-center gap-1.5"
          disabled={subiendo !== null}
          onClick={() => input.current?.click()}
        >
          <IconUpload class="size-4" />
          {subiendo !== null ? `Subiendo ${subiendo}%` : 'Importar STL'}
        </button>
      </div>

      <div class="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          class={`chip-claro ${tab === 'pendientes' ? 'activo' : ''}`}
          onClick={() => setTab('pendientes')}
        >
          Pendientes{counts?.pendientes ? ` (${counts.pendientes})` : ''}
        </button>
        <button
          type="button"
          class={`chip-claro ${tab === 'historico' ? 'activo' : ''}`}
          onClick={() => setTab('historico')}
        >
          Histórico{counts?.historico ? ` (${counts.historico})` : ''}
        </button>
      </div>

      {subiendo !== null && (
        <div class="mb-4 h-1.5 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--borde)]">
          <div
            class="h-full rounded-[var(--radius-pill)] bg-[var(--azul)]"
            style={{ width: `${subiendo}%`, transition: 'width var(--duration-fast) var(--ease-out)' }}
          />
        </div>
      )}

      {error && <p class="m-0 mb-3 text-sm text-[var(--naranja-oscuro)]">{error}</p>}

      {cargando ? (
        <p class="m-0 text-sm text-[var(--text-muted)]">Cargando…</p>
      ) : piezas.length === 0 ? (
        <p class="m-0 text-sm text-[var(--text-muted)]">
          {tab === 'pendientes'
            ? 'Nada por aquí. Importa el STL que te mandó un cliente y el agente lo rebana.'
            : 'Todavía no hay piezas de clientes terminadas.'}
        </p>
      ) : (
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {piezas.map((pieza) => (
            <PiezaCard
              key={pieza.id}
              pieza={pieza}
              spools={spools}
              token={token}
              abierta={abierta === pieza.id}
              onAbrir={() => setAbierta(abierta === pieza.id ? null : pieza.id)}
              onRebanar={(op) =>
                accion(pieza.id, () => rebanarPrint(token!, pieza.id, op), { status: 'en_cola' })
              }
              onImprimir={() =>
                accion(pieza.id, () => imprimirPrint(token!, pieza.id), { status: 'imprimiendo' })
              }
              onCancelar={() =>
                accion(pieza.id, () => cancelarPrint(token!, pieza.id), { status: 'cancelado' })
              }
              onBorrar={() => accion(pieza.id, () => borrarPrint(token!, pieza.id), {})}
              onPrecio={(valor) =>
                accion(pieza.id, () => patchPrintPrecio(token!, pieza.id, valor), {
                  price_override_mxn: valor,
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function IconButton({
  title,
  onClick,
  active,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  children: ComponentChildren;
}) {
  const tono = active
    ? 'border-[var(--azul)] bg-[var(--azul-claro)] text-[var(--azul-oscuro)]'
    : danger
      ? 'border-[var(--border-soft)] text-[var(--naranja-oscuro)] hover:bg-[var(--naranja-claro)]'
      : 'border-[var(--border-soft)] text-[var(--text-muted)] hover:bg-[var(--hueso)]';
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      class={`inline-flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors ${tono}`}
    >
      {children}
    </button>
  );
}

function PiezaCard({
  pieza,
  spools,
  token,
  abierta,
  onAbrir,
  onRebanar,
  onImprimir,
  onCancelar,
  onBorrar,
  onPrecio,
}: {
  pieza: CustomPrint;
  spools: Spool[];
  token: string | null;
  abierta: boolean;
  onRebanar: (op: {
    material: string;
    color_id: string;
    color_hex?: string | null;
    supports: 'auto' | 'no';
    orient: 'auto' | 'original';
  }) => void;
  onAbrir: () => void;
  onImprimir: () => void;
  onCancelar: () => void;
  onBorrar: () => void;
  onPrecio: (valor: number | null) => void;
}) {
  const rebanable = REBANABLES.includes(pieza.status);
  const enProceso = EN_PROCESO.includes(pieza.status);
  const listo = pieza.status === 'listo';
  const tieneEstimado = pieza.est_seconds != null && pieza.est_grams != null;
  const [desglose, setDesglose] = useState(false);

  return (
    <div class="flex flex-col overflow-hidden rounded-[var(--radius-m)] border border-[var(--border-soft)] bg-[var(--surface-sunken)]">
      <div class="flex items-start justify-between gap-2 px-3 pt-3">
        <span class="min-w-0 flex-1 truncate text-sm font-semibold" title={pieza.file_name}>
          {pieza.file_name}
        </span>
        <span class="flex shrink-0 items-center gap-1.5 text-[11px] text-[var(--text-faint)]">
          {listo && (
            <span
              class="size-2 rounded-full bg-[var(--bosque)]"
              title="Listo para imprimir"
              aria-label="Listo para imprimir"
            />
          )}
          {formatTamano(pieza.size_bytes)}
        </span>
      </div>

      {!listo && (
        <div class="mt-2 px-3">
          <span class="tag tag-neutral">{estadoLabel(pieza)}</span>
        </div>
      )}

      <div class="mt-3 px-3">
        {pieza.preview && token ? (
          <Preview id={pieza.id} token={token} />
        ) : (
          <div class="flex h-32 items-center justify-center rounded-[var(--radius-s)] border border-dashed border-[var(--border-strong)] text-[12px] text-[var(--text-faint)]">
            Sin vista previa
          </div>
        )}
      </div>

      {tieneEstimado && (
        <div class="relative z-10 -mt-3 mx-3 rounded-[var(--radius-s)] bg-[var(--surface-card)] p-3 text-[13px] shadow-[var(--shadow-card)]">
          <div class="flex flex-wrap gap-x-3 gap-y-1 text-[var(--text-muted)]">
            <span>{formatDuracion(pieza.est_seconds!)}</span>
            <span>{pieza.est_grams} g</span>
            {pieza.material && <span>{pieza.material}</span>}
            {pieza.color_id && <span>{colorLabel(pieza.color_id)}</span>}
            <span>{pieza.supports === 'auto' ? 'con soportes' : 'sin soportes'}</span>
          </div>
          <div class="mt-2 flex items-center justify-between border-t border-[var(--border-soft)] pt-2">
            <span class="text-[var(--text-faint)]">
              Costo{' '}
              <strong class="font-semibold text-[var(--text-body)]">
                {pieza.cost_mxn != null ? formatMxn(pieza.cost_mxn) : '—'}
              </strong>
            </span>
            {pieza.cost_breakdown ? (
              <button
                type="button"
                class="inline-flex items-center gap-1 text-[var(--text-faint)] hover:text-[var(--text-body)]"
                onClick={() => setDesglose((d) => !d)}
              >
                Precio{' '}
                <strong class="font-semibold text-[var(--text-body)]">
                  {formatMxn(pieza.price_override_mxn ?? pieza.price_mxn!)}
                </strong>
                <span aria-hidden="true">{desglose ? '⌄' : '›'}</span>
              </button>
            ) : (
              <span class="text-[var(--text-faint)]">Precio —</span>
            )}
          </div>
          {desglose && pieza.cost_breakdown && (
            <Desglose pieza={pieza} onPrecio={onPrecio} />
          )}
        </div>
      )}

      {pieza.message && (
        <p class="m-0 mt-2 px-3 text-[13px] text-[var(--naranja-oscuro)]">{pieza.message}</p>
      )}

      {/* Imprimir va entre rehacer y borrar, en la misma fila: es la acción
          que Salva busca al revisar el estimado, pero no necesita su propia
          franja — con eso la tarjeta ahorra espacio. */}
      <div class="mt-3 flex items-center gap-2 px-3 pb-3">
        {rebanable && (
          <IconButton title={abierta ? 'Cerrar' : 'Rebanar'} active={abierta} onClick={onAbrir}>
            <IconRebanar class="size-4" />
          </IconButton>
        )}
        {enProceso && pieza.status !== 'imprimiendo' && (
          <button type="button" class="btn btn-sm btn-ghost-claro" onClick={onCancelar}>
            Cancelar
          </button>
        )}
        {listo ? (
          <button type="button" class="btn btn-sm btn-primary flex-1 justify-center" onClick={onImprimir}>
            Imprimir
          </button>
        ) : (
          <div class="flex-1" />
        )}
        {!enProceso && (
          <IconButton title="Borrar" danger onClick={onBorrar}>
            <IconBorrar class="size-4" />
          </IconButton>
        )}
      </div>

      {abierta && rebanable && (
        <div class="border-t border-[var(--border-soft)] px-3 pt-3 pb-3">
          <FormRebanar spools={spools} onRebanar={onRebanar} />
        </div>
      )}
    </div>
  );
}

// Desglose de costo (material/luz/mano de obra/amortización) + edición del
// precio de esta pieza. El costo no se edita aquí: es lo que de verdad costó
// producirla, según pricing.ts; lo único que Salva decide es el precio.
function Desglose({
  pieza,
  onPrecio,
}: {
  pieza: CustomPrint;
  onPrecio: (valor: number | null) => void;
}) {
  const b = pieza.cost_breakdown!;
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(() =>
    String(Math.round((pieza.price_override_mxn ?? pieza.price_mxn ?? 0) / 100)),
  );

  const guardar = () => {
    const pesos = Number(valor);
    if (!Number.isFinite(pesos) || pesos < 0) return;
    onPrecio(Math.round(pesos * 100));
    setEditando(false);
  };

  return (
    <div class="mt-2 rounded-[var(--radius-s)] border border-[var(--border-soft)] bg-[var(--surface-sunken)] p-2.5 text-[12px]">
      <dl class="m-0 grid grid-cols-2 gap-y-1 text-[var(--text-muted)]">
        <dt>Material</dt>
        <dd class="m-0 text-right text-[var(--text-body)]">{formatMxn(b.material_mxn)}</dd>
        <dt>Luz</dt>
        <dd class="m-0 text-right text-[var(--text-body)]">{formatMxn(b.luz_mxn)}</dd>
        <dt>Mano de obra</dt>
        <dd class="m-0 text-right text-[var(--text-body)]">{formatMxn(b.mano_obra_mxn)}</dd>
        <dt>Amortización</dt>
        <dd class="m-0 text-right text-[var(--text-body)]">{formatMxn(b.amortizacion_mxn)}</dd>
      </dl>
      {b.material_source === 'fallback' && (
        <p class="m-0 mt-1.5 text-[var(--naranja-oscuro)]">
          Sin bobina vinculada a esa ranura: el material se estimó con un valor de respaldo, no el
          costo real.
        </p>
      )}
      {b.amortizada && (
        <p class="m-0 mt-1.5 text-[var(--text-faint)]">
          La impresora ya superó su vida útil estimada: la amortización solo cobra mantenimiento.
        </p>
      )}
      <div class="mt-2 flex items-center justify-between border-t border-[var(--border-soft)] pt-2">
        <span class="text-[var(--text-faint)]">Precio sugerido {formatMxn(pieza.price_mxn!)}</span>
        {editando ? (
          <div class="flex items-center gap-1.5">
            <span class="text-[var(--text-faint)]">$</span>
            <input
              type="number"
              min="0"
              class="w-20 rounded border border-[var(--border-soft)] bg-[var(--surface-card)] px-1.5 py-0.5 text-right"
              value={valor}
              onInput={(e) => setValor((e.currentTarget as HTMLInputElement).value)}
            />
            <button type="button" class="btn btn-sm btn-primary" onClick={guardar}>
              Guardar
            </button>
          </div>
        ) : (
          <div class="flex items-center gap-2">
            {pieza.price_override_mxn != null && (
              <button
                type="button"
                class="text-[var(--text-faint)] underline hover:text-[var(--text-body)]"
                onClick={() => onPrecio(null)}
              >
                Quitar ajuste
              </button>
            )}
            <button type="button" class="btn btn-sm btn-ghost-claro" onClick={() => setEditando(true)}>
              Editar precio
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// La imagen del plato va autenticada: se baja como blob y se revoca al salir.
function Preview({ id, token }: { id: string; token: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    let actual: string | null = null;
    getPreviewUrl(token, id)
      .then((u) => {
        if (!vivo) return URL.revokeObjectURL(u);
        actual = u;
        setUrl(u);
      })
      .catch(() => {
        /* sin imagen: la pieza se revisa con los estimados */
      });
    return () => {
      vivo = false;
      if (actual) URL.revokeObjectURL(actual);
    };
  }, [id, token]);
  if (!url) return null;
  return (
    <img
      src={url}
      alt="Vista del plato rebanado"
      class="h-32 w-full rounded-[var(--radius-s)] border border-[var(--border-soft)] object-cover"
    />
  );
}

// Solo se ofrecen las ranuras que la impresora reporta con material Y color de
// catálogo: el agente mapea por color_id, así que una bobina sin match no se
// puede pedir todavía.
function FormRebanar({
  spools,
  onRebanar,
}: {
  spools: Spool[];
  onRebanar: (op: {
    material: string;
    color_id: string;
    color_hex?: string | null;
    supports: 'auto' | 'no';
    orient: 'auto' | 'original';
  }) => void;
}) {
  const usables = spools.filter((s) => s.material && s.color_id);
  const [elegida, setElegida] = useState<number | null>(usables[0]?.slot ?? null);
  const [supports, setSupports] = useState<'auto' | 'no'>('auto');
  const [orient, setOrient] = useState<'auto' | 'original'>('auto');
  const spool = usables.find((s) => s.slot === elegida);

  if (usables.length === 0) {
    return (
      <p class="m-0 text-[13px] text-[var(--text-muted)]">
        Ninguna bobina del AMS tiene material y color de catálogo. Revisa los filamentos en la
        impresora.
      </p>
    );
  }

  return (
    <div class="flex flex-col gap-3">
      <div>
        <div class="meta-caps mb-2 text-[10px] text-[var(--text-faint)]">Filamento</div>
        <div class="flex flex-wrap gap-2">
          {usables.map((s) => (
            <button
              key={s.slot}
              type="button"
              class={`chip chip-claro ${elegida === s.slot ? 'activo' : ''}`}
              onClick={() => setElegida(s.slot)}
            >
              <span
                class="mr-1.5 inline-block size-2.5 rounded-full border border-[var(--border-strong)] align-middle"
                style={{ background: s.color_hex ?? colorSwatch(s.color_id!) }}
              />
              {colorLabel(s.color_id)} · {s.material}
            </button>
          ))}
        </div>
      </div>

      <Opcion
        titulo="Soportes"
        valor={supports}
        opciones={[
          ['auto', 'Automáticos'],
          ['no', 'Sin soportes'],
        ]}
        onElegir={(v) => setSupports(v as 'auto' | 'no')}
      />
      <Opcion
        titulo="Orientación"
        valor={orient}
        opciones={[
          ['auto', 'La mejor automática'],
          ['original', 'Como viene el archivo'],
        ]}
        onElegir={(v) => setOrient(v as 'auto' | 'original')}
      />

      <button
        type="button"
        class="btn btn-sm btn-primary self-start"
        disabled={!spool}
        onClick={() =>
          spool &&
          onRebanar({
            material: spool.material!,
            color_id: spool.color_id!,
            color_hex: spool.color_hex,
            supports,
            orient,
          })
        }
      >
        Rebanar
      </button>
    </div>
  );
}

function Opcion({
  titulo,
  valor,
  opciones,
  onElegir,
}: {
  titulo: string;
  valor: string;
  opciones: [string, string][];
  onElegir: (v: string) => void;
}) {
  return (
    <div>
      <div class="meta-caps mb-2 text-[10px] text-[var(--text-faint)]">{titulo}</div>
      <div class="flex flex-wrap gap-2">
        {opciones.map(([v, label]) => (
          <button
            key={v}
            type="button"
            class={`chip chip-claro ${valor === v ? 'activo' : ''}`}
            onClick={() => onElegir(v)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
