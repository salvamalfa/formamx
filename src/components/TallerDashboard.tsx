import { useEffect, useState } from 'preact/hooks';
import {
  BLANCO,
  COLORS,
  MODELS,
  baseKey,
  pantallaKey,
  type LampImageManifest,
} from '../config/lamps';
import {
  confirmBedClear,
  dispatchOrder,
  getOrders,
  getPrinter,
  getSpools,
  patchOrder,
  putSpools,
  requeueJob,
  type Order,
  type PrintJob,
  type Spool,
} from '../lib/tallerApi';

const TOKEN_KEY = 'taller_token';

// Estados que el taller avanza a mano y la etiqueta del botón que lleva al
// siguiente. Los estados terminales (enviada/cancelada) no tienen botón.
// El paso en_cola→imprimiendo solo lo usan a mano los pedidos que no pasan
// por la impresora (p. ej. la banca): para ellos "imprimiendo" se presenta
// como "En progreso". Las lámparas avanzan solas cuando el agente imprime.
const NEXT_STEP: Record<string, { status: string; label: string }> = {
  pagada: { status: 'en_cola', label: 'A la cola' },
  en_cola: { status: 'imprimiendo', label: 'Empezar' },
  imprimiendo: { status: 'lista', label: 'Marcar lista' },
  lista: { status: 'enviada', label: 'Marcar enviada' },
};

const STATUS_LABEL: Record<string, string> = {
  pendiente: 'Pendiente de pago',
  pagada: 'Pagada',
  en_cola: 'En cola',
  imprimiendo: 'Imprimiendo',
  lista: 'Lista',
  enviada: 'Enviada',
  cancelada: 'Cancelada',
};

// Estado visible según el tipo de pieza: lo que en una lámpara es
// "Imprimiendo", en una pieza de madera es simplemente "En progreso".
function statusLabel(order: Order): string {
  if (!order.config && order.status === 'imprimiendo') return 'En progreso';
  return STATUS_LABEL[order.status] ?? order.status;
}

const JOB_STATUS_LABEL: Record<PrintJob['status'], string> = {
  queued: 'en cola',
  claimed: 'preparando',
  printing: 'imprimiendo',
  done: 'lista',
  failed: 'falló',
  canceled: 'cancelado',
};

const PART_LABEL: Record<PrintJob['part'], string> = {
  pantalla: 'Pantalla',
  cuerpo: 'Cuerpo',
  tapa: 'Tapa',
};

// Colores que puede cargar una bobina: blanco (cuerpo) + los 6 del catálogo.
const SPOOL_COLORS = [BLANCO, ...COLORS];
const colorLabel = (id: string | null) =>
  id ? (SPOOL_COLORS.find((c) => c.id === id)?.label ?? id) : 'vacío';
const colorSwatch = (id: string) => SPOOL_COLORS.find((c) => c.id === id)?.swatch ?? '#ccc';

function money(mxn: number): string {
  return `$${(mxn / 100).toLocaleString('es-MX')}`;
}

export default function TallerDashboard({ manifest }: { manifest: LampImageManifest }) {
  const [token, setToken] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [spools, setSpools] = useState<Spool[]>([]);
  const [bedClear, setBedClear] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) setToken(saved);
  }, []);

  useEffect(() => {
    if (!token) return;
    void load(token);
    // Refresco periódico para ver avanzar las impresiones sin recargar.
    const timer = setInterval(() => void load(token), 30_000);
    return () => clearInterval(timer);
  }, [token]);

  async function load(t: string) {
    setLoading(true);
    setError(null);
    try {
      const [o, s, p] = await Promise.all([getOrders(t), getSpools(t), getPrinter(t)]);
      setOrders(o);
      setSpools(s);
      setBedClear(p.bed_clear);
    } catch (err) {
      if (err instanceof Error && err.message === 'no_autorizado') {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setError('Token inválido.');
      } else {
        setError('No se pudo cargar. Reintenta.');
      }
    } finally {
      setLoading(false);
    }
  }

  function saveToken(e: Event) {
    e.preventDefault();
    const t = tokenInput.trim();
    if (!t) return;
    localStorage.setItem(TOKEN_KEY, t);
    setToken(t);
    setTokenInput('');
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setOrders([]);
    setSpools([]);
  }

  // Avanza el estado con actualización optimista; si falla, recarga del server.
  async function advance(order: Order) {
    const step = NEXT_STEP[order.status];
    if (!step || !token) return;
    const prev = orders;
    setOrders((os) => os.map((o) => (o.id === order.id ? { ...o, status: step.status } : o)));
    try {
      await patchOrder(token, order.id, step.status);
      // enviada/cancelada salen de la lista de trabajo al recargar.
      if (step.status === 'enviada') setOrders((os) => os.filter((o) => o.id !== order.id));
    } catch {
      setOrders(prev);
      setError('No se pudo cambiar el estado.');
    }
  }

  // Confirma que la cama quedó despejada: el agente vuelve a recibir trabajos.
  async function bedCleared() {
    if (!token) return;
    setBedClear(true);
    try {
      await confirmBedClear(token);
    } catch {
      setBedClear(false);
      setError('No se pudo confirmar. Reintenta.');
    }
  }

  // Manda un pedido a la cola de impresión (crea sus trabajos).
  async function dispatch(order: Order) {
    if (!token) return;
    try {
      const jobs = await dispatchOrder(token, order.id);
      setOrders((os) => os.map((o) => (o.id === order.id ? { ...o, jobs } : o)));
    } catch {
      setError('No se pudo despachar a la impresora.');
    }
  }

  // Reencola un trabajo fallido.
  async function retry(job: PrintJob) {
    if (!token) return;
    try {
      const updated = await requeueJob(token, job.id);
      setOrders((os) =>
        os.map((o) =>
          o.id === job.order_id
            ? { ...o, jobs: o.jobs.map((j) => (j.id === job.id ? updated : j)) }
            : o,
        ),
      );
    } catch {
      setError('No se pudo reencolar el trabajo.');
    }
  }

  async function saveSpool(slot: number, colorId: string | null) {
    if (!token) return;
    const next = spools.map((s) => (s.slot === slot ? { ...s, color_id: colorId } : s));
    setSpools(next);
    try {
      const saved = await putSpools(token, next);
      setSpools(saved);
    } catch {
      setError('No se pudieron guardar las bobinas.');
      void load(token);
    }
  }

  if (!token) {
    return (
      <div class="mx-auto max-w-sm px-6 py-24">
        <h1 class="text-xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
          Taller
        </h1>
        <p class="mt-2 text-sm text-[var(--text-muted)]">Pega tu token de taller para entrar.</p>
        <form onSubmit={saveToken} class="mt-5 flex flex-col gap-3">
          <input
            type="password"
            class="input-brand"
            placeholder="token"
            value={tokenInput}
            onInput={(e) => setTokenInput((e.target as HTMLInputElement).value)}
          />
          <button type="submit" class="btn btn-primary">
            Entrar
          </button>
          {error && <p class="text-xs text-[var(--support)]">{error}</p>}
        </form>
      </div>
    );
  }

  return (
    <div class="mx-auto max-w-[1100px] px-6 py-10 sm:px-12">
      <header class="flex items-center justify-between gap-4">
        <h1 class="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
          Taller
        </h1>
        <div class="flex items-center gap-3">
          <button type="button" class="btn btn-sm btn-ghost" onClick={() => token && load(token)}>
            Actualizar
          </button>
          <button type="button" class="btn btn-sm btn-ghost" onClick={logout}>
            Salir
          </button>
        </div>
      </header>

      {error && (
        <p class="mt-3 text-sm text-[var(--support)]" role="alert">
          {error}
        </p>
      )}

      {!bedClear && (
        <div
          class="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-m)] bg-[var(--tinta)] p-4 text-[var(--crema)]"
          role="alert"
        >
          <p class="m-0 text-sm">
            <span class="font-bold">Hay una pieza en la cama.</span> La impresora no
            recibirá el siguiente trabajo hasta que la retires.
          </p>
          <button type="button" class="btn btn-sm btn-primary shrink-0" onClick={bedCleared}>
            Cama despejada
          </button>
        </div>
      )}

      <SpoolsPanel spools={spools} onChange={saveSpool} />

      <section class="mt-10">
        <h2 class="meta-caps text-[var(--text-muted)]">
          Pedidos {loading ? '· cargando…' : `· ${orders.length}`}
        </h2>
        {orders.length === 0 && !loading && (
          <p class="mt-4 text-sm text-[var(--text-muted)]">No hay pedidos en curso.</p>
        )}
        <div class="mt-4 grid gap-5 md:grid-cols-2">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              manifest={manifest}
              spools={spools}
              onAdvance={() => advance(order)}
              onDispatch={() => dispatch(order)}
              onRetry={retry}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function SpoolsPanel({
  spools,
  onChange,
}: {
  spools: Spool[];
  onChange: (slot: number, colorId: string | null) => void;
}) {
  return (
    <section class="mt-8 rounded-[var(--radius-m)] border border-[var(--border-soft)] bg-[var(--surface-card)] p-5">
      <h2 class="meta-caps text-[var(--text-muted)]">AMS — qué hay cargado</h2>
      <div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((slot) => {
          const current = spools.find((s) => s.slot === slot)?.color_id ?? null;
          return (
            <label key={slot} class="flex flex-col gap-1.5 text-sm">
              <span class="meta-caps text-[var(--text-faint)]">Ranura {slot + 1}</span>
              <div class="flex items-center gap-2">
                <span
                  class="size-5 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.18)]"
                  style={{ background: current ? colorSwatch(current) : 'transparent' }}
                />
                <select
                  class="input-brand min-w-0 flex-1 py-1.5"
                  value={current ?? ''}
                  onChange={(e) => {
                    const v = (e.target as HTMLSelectElement).value;
                    onChange(slot, v === '' ? null : v);
                  }}
                >
                  <option value="">vacío</option>
                  {SPOOL_COLORS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </label>
          );
        })}
      </div>
    </section>
  );
}

function OrderCard({
  order,
  manifest,
  spools,
  onAdvance,
  onDispatch,
  onRetry,
}: {
  order: Order;
  manifest: LampImageManifest;
  spools: Spool[];
  onAdvance: () => void;
  onDispatch: () => void;
  onRetry: (job: PrintJob) => void;
}) {
  const loaded = new Set(spools.map((s) => s.color_id).filter(Boolean) as string[]);

  // El pedido de lámpara en cola y sin despachar puede mandarse a imprimir;
  // solo si los 3 filamentos que necesita están cargados en el AMS.
  const canDispatch = order.config && order.status === 'en_cola' && order.jobs.length === 0;
  // Las lámparas en cola avanzan solas cuando el agente imprime; el botón
  // manual solo aplica a piezas que no pasan por la impresora (la banca).
  const step = order.config && order.status === 'en_cola' ? undefined : NEXT_STEP[order.status];
  const missingColors = order.config
    ? ['blanco', order.config.pantalla, order.config.tapa].filter((c) => !loaded.has(c))
    : [];

  return (
    <article class="flex flex-col gap-4 rounded-[var(--radius-m)] border border-[var(--border-soft)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-card)] sm:flex-row">
      {order.config && <LampPreview config={order.config} manifest={manifest} />}

      <div class="flex min-w-0 flex-1 flex-col gap-2">
        <div class="flex items-baseline justify-between gap-2">
          <span class="meta-caps text-[var(--support)]">{statusLabel(order)}</span>
          <span class="text-sm font-bold">{money(order.amount_mxn)}</span>
        </div>

        <p class="text-sm font-semibold">{describeOrder(order)}</p>

        {order.config && (
          <FilamentNeeds config={order.config} loaded={loaded} />
        )}

        {order.jobs.length > 0 && <JobsStrip jobs={order.jobs} onRetry={onRetry} />}

        <ShippingBlock order={order} />

        <div class="mt-1 flex flex-wrap items-center gap-2">
          {canDispatch && (
            <button
              type="button"
              class="btn btn-sm btn-primary disabled:cursor-default disabled:opacity-60"
              disabled={missingColors.length > 0}
              title={missingColors.length ? `Carga en el AMS: ${missingColors.join(', ')}` : undefined}
              onClick={onDispatch}
            >
              Imprimir
            </button>
          )}
          {step && (
            <button type="button" class="btn btn-sm btn-primary" onClick={onAdvance}>
              {step.label}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

// Estado de las piezas en la impresora, con barra de progreso.
function JobsStrip({ jobs, onRetry }: { jobs: PrintJob[]; onRetry: (job: PrintJob) => void }) {
  return (
    <div class="flex flex-col gap-1.5 rounded-[var(--radius-s)] bg-[var(--crema)] p-2.5">
      {jobs.map((job) => (
        <div key={job.id} class="flex items-center gap-2.5">
          <span class="meta-caps w-24 shrink-0 text-[10px] text-[var(--text-muted)]">
            {PART_LABEL[job.part]}
          </span>
          <div class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--crema-oscuro)]">
            <div
              class={`h-full rounded-[var(--radius-pill)] ${
                job.status === 'failed' ? 'bg-[var(--naranja)]' : 'bg-[var(--support)]'
              }`}
              style={{
                width: `${job.status === 'done' ? 100 : (job.progress_pct ?? 0)}%`,
                transition: 'width 300ms var(--ease-out)',
              }}
            />
          </div>
          <span class="meta-caps w-20 shrink-0 text-right text-[10px] text-[var(--text-faint)]">
            {JOB_STATUS_LABEL[job.status]}
            {job.status === 'printing' && job.progress_pct != null ? ` ${job.progress_pct}%` : ''}
          </span>
          {job.status === 'failed' && (
            <button type="button" class="btn btn-sm btn-ghost shrink-0" onClick={() => onRetry(job)}>
              Reintentar
            </button>
          )}
        </div>
      ))}
      {jobs.some((j) => j.status === 'failed' && j.message) && (
        <p class="m-0 text-[10px] text-[var(--naranja-oscuro)]" style={{ fontFamily: 'var(--font-mono)' }}>
          {jobs.find((j) => j.status === 'failed' && j.message)?.message}
        </p>
      )}
    </div>
  );
}

function LampPreview({
  config,
  manifest,
}: {
  config: { model: string; pantalla: string; tapa: string };
  manifest: LampImageManifest;
}) {
  const model = MODELS.find((m) => m.id === config.model) ?? MODELS[0];
  const pantalla = COLORS.find((c) => c.id === config.pantalla) ?? COLORS[0];
  const tapa = COLORS.find((c) => c.id === config.tapa) ?? COLORS[0];
  const base = manifest[baseKey(tapa)];
  const shade = manifest[pantallaKey(model, pantalla)];

  return (
    <div class="relative h-32 w-28 shrink-0 self-center rounded-[var(--radius-s)] bg-[var(--crema-oscuro)]">
      {base && <img src={base.src} srcset={base.srcset} sizes="112px" alt="" class="absolute inset-1 h-[calc(100%-0.5rem)] w-[calc(100%-0.5rem)] object-contain" />}
      {shade && <img src={shade.src} srcset={shade.srcset} sizes="112px" alt="" class="absolute inset-1 h-[calc(100%-0.5rem)] w-[calc(100%-0.5rem)] object-contain" />}
    </div>
  );
}

// Filamentos que necesita la lámpara y si están cargados en el AMS.
function FilamentNeeds({
  config,
  loaded,
}: {
  config: { pantalla: string; tapa: string };
  loaded: Set<string>;
}) {
  const needed = [
    { id: 'blanco', role: 'cuerpo' },
    { id: config.pantalla, role: 'pantalla' },
    { id: config.tapa, role: 'tapa' },
  ];
  return (
    <div class="flex flex-wrap gap-1.5">
      {needed.map(({ id, role }) => {
        const ok = loaded.has(id);
        return (
          <span
            key={role}
            class={`meta-caps inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2 py-0.5 text-[10px] ${
              ok
                ? 'bg-[var(--support-soft)] text-[var(--support)]'
                : 'bg-[color-mix(in_srgb,var(--naranja)_18%,transparent)] text-[var(--naranja-oscuro)]'
            }`}
          >
            <span
              class="size-2.5 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.2)]"
              style={{ background: colorSwatch(id) }}
            />
            {role}: {colorLabel(id)}
            {!ok && ' · carga'}
          </span>
        );
      })}
    </div>
  );
}

function ShippingBlock({ order }: { order: Order }) {
  const a = order.shipping?.address;
  return (
    <div class="mt-1 text-[11px] leading-[1.8] text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
      {order.customer.name && <div>{order.customer.name}</div>}
      {a?.line1 && <div>{a.line1}{a.line2 ? `, ${a.line2}` : ''}</div>}
      {(a?.city || a?.postal_code) && (
        <div>
          {[a?.postal_code, a?.city, a?.state].filter(Boolean).join(' · ')}
        </div>
      )}
      {order.customer.phone && <div>{order.customer.phone}</div>}
      {order.customer.email && <div>{order.customer.email}</div>}
    </div>
  );
}

function describeOrder(order: Order): string {
  if (!order.config) return order.product_id === 'banca-001' ? 'La banca de los abuelos' : order.product_id;
  const model = MODELS.find((m) => m.id === order.config!.model)?.label ?? order.config.model;
  return `Lámpara ${model}`;
}
