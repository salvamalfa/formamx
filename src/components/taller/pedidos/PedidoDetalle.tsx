import { useEffect, useState } from 'preact/hooks';
import { MODELS, type LampImageManifest } from '../../../config/lamps';
import { getEnvios, getOrder, patchOrder, type Envio, type Order } from '../../../lib/taller';
import { useTallerCore } from '../coreData';
import { useSession } from '../hooks/useSession';
import { colorLabel } from '../ui/colores';
import { formatDate, money, shortId } from '../ui/format';
import { FilamentNeeds } from './FilamentNeeds';
import { JobsStrip } from './JobsStrip';
import { LampPreview } from './LampPreview';
import { StatusBadge } from './PedidosTable';
import { NEXT_STEP, productLabel } from './labels';
import { navigate } from '../router';

const CARD =
  'rounded-[var(--radius-m)] border border-[var(--border-soft)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-card)]';

function VolverProyectos() {
  return (
    <button
      type="button"
      class="self-start text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-body)]"
      onClick={() => navigate({ vista: 'proyectos', sub: 'pedidos' })}
    >
      ← Proyectos
    </button>
  );
}

export function PedidoDetalle({ id, manifest }: { id: string; manifest: LampImageManifest }) {
  const core = useTallerCore();
  const { token } = useSession();

  const fromCore = core.orders.find((o) => o.id === id);
  const hasCore = !!fromCore;
  const [fetched, setFetched] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [guias, setGuias] = useState<Envio[]>([]);

  // Si el pedido no está en el core (enviado/cancelado/histórico), se pide.
  useEffect(() => {
    if (hasCore || !token) return;
    if (fetched && fetched.id === id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getOrder(token, id)
      .then((o) => {
        if (!cancelled) setFetched(o);
      })
      .catch(() => {
        if (!cancelled) setError('No se pudo cargar este pedido.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, hasCore, token, fetched]);

  // Guías del pedido (paquetería/tracking/estado).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getEnvios(token, { order_id: id })
      .then((es) => {
        if (!cancelled) setGuias(es);
      })
      .catch(() => {
        /* el bloque de envío simplemente no muestra guías */
      });
    return () => {
      cancelled = true;
    };
  }, [id, token]);

  const order = fromCore ?? fetched;

  if (!order) {
    return (
      <section class="flex flex-col gap-4">
        <VolverProyectos />
        <p class="text-sm text-[var(--text-muted)]">
          {loading ? 'Cargando…' : (error ?? 'No se pudo cargar este pedido.')}
        </p>
      </section>
    );
  }

  const es3d = order.production === 'impresion_3d';
  const step = NEXT_STEP[order.status];
  // Las lámparas en cola avanzan solas al imprimir el agente: no ofrecen avance
  // manual, solo el botón de despachar.
  const showAdvance = step && !(es3d && order.status === 'en_cola');
  const canDispatch =
    hasCore && es3d && !!order.config && order.status === 'en_cola' && order.jobs.length === 0;
  const loaded = new Set(core.spools.map((s) => s.color_id).filter(Boolean) as string[]);
  const missingColors = order.config
    ? ['blanco', order.config.pantalla, order.config.tapa].filter((c) => !loaded.has(c))
    : [];

  async function advance() {
    if (!order || !step) return;
    setLocalError(null);
    if (fromCore) {
      // Al enviar, el core saca el pedido de la lista: se guarda una copia
      // local para que el detalle lo siga mostrando.
      if (step.status === 'enviada') setFetched({ ...order, status: 'enviada' });
      await core.advance(fromCore);
    } else {
      const prev = fetched;
      setFetched({ ...order, status: step.status });
      try {
        await patchOrder(token!, order.id, step.status);
      } catch {
        setFetched(prev);
        setLocalError('No se pudo cambiar el estado.');
      }
    }
  }

  return (
    <section class="flex flex-col gap-5">
      <VolverProyectos />

      <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div class="meta-caps text-[var(--text-faint)]">
            {shortId(order.id)} · {formatDate(order.created_at)}
          </div>
          <h1
            class="mt-2 text-[32px] font-bold"
            style={{ fontFamily: 'var(--font-display)', letterSpacing: 'var(--tracking-display)' }}
          >
            {productLabel(order)}
          </h1>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <StatusBadge order={order} size="lg" />
          {canDispatch && (
            <button
              type="button"
              class="btn btn-sm btn-primary disabled:cursor-default disabled:opacity-60"
              disabled={missingColors.length > 0}
              title={
                missingColors.length
                  ? `Carga en el AMS: ${missingColors.join(', ')}`
                  : undefined
              }
              onClick={() => fromCore && core.dispatch(fromCore)}
            >
              Imprimir
            </button>
          )}
          {showAdvance && step && (
            <button type="button" class="btn btn-sm btn-primary" onClick={advance}>
              {step.label}
            </button>
          )}
        </div>
      </header>

      {(core.error || localError) && (
        <p class="text-sm text-[var(--support)]" role="alert">
          {localError ?? core.error}
        </p>
      )}

      <div class="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div class="flex min-w-0 flex-col gap-4">
          <div class={CARD}>
            <h2 class="m-0 mb-3 text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
              La pieza
            </h2>
            {order.config ? (
              <div class="flex flex-col gap-4 sm:flex-row">
                <LampPreview config={order.config} manifest={manifest} />
                <div class="flex min-w-0 flex-1 flex-col gap-3">
                  <div
                    class="rounded-[var(--radius-s)] bg-[var(--crema-claro)] p-3 text-[12px] text-[var(--text-muted)]"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {configDescription(order.config)}
                  </div>
                  <FilamentNeeds config={order.config} loaded={loaded} />
                </div>
              </div>
            ) : order.jobs.length === 0 ? (
              <p class="m-0 text-sm text-[var(--text-muted)]">
                Pieza manual — no pasa por la impresora. El avance se registra a mano.
              </p>
            ) : null}

            {order.jobs.length > 0 && (
              <div class="mt-4">
                <JobsStrip jobs={order.jobs} onRetry={core.retry} />
              </div>
            )}
          </div>

          <div class={CARD}>
            <h2 class="m-0 mb-3 text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
              Envío
            </h2>
            <ShippingBlock order={order} />
            {guias.length > 0 && (
              <div class="mt-3 flex flex-col gap-2 border-t border-[var(--border-soft)] pt-3">
                {guias.map((g) => (
                  <GuiaRow key={g.id} guia={g} />
                ))}
              </div>
            )}
          </div>
        </div>

        <div class="flex min-w-0 flex-col gap-4">
          <div class={CARD}>
            <div class="meta-caps text-[var(--text-faint)]">Total</div>
            <div
              class="mt-1 text-[28px] font-bold"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {money(order.amount_mxn)}
            </div>
            {order.payment_method && (
              <div
                class="mt-1 text-[11px] text-[var(--text-faint)]"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                pago con {order.payment_method}
              </div>
            )}
          </div>

          <div class={CARD}>
            <div class="meta-caps mb-2 text-[var(--text-faint)]">Cliente</div>
            {order.customer.name &&
              (order.customer_id ? (
                <button
                  type="button"
                  class="text-left text-[15px] font-semibold text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)]"
                  onClick={() =>
                    navigate({ vista: 'clientes', persona: order.customer_id! })
                  }
                >
                  {order.customer.name} →
                </button>
              ) : (
                <div class="text-[15px] font-semibold">{order.customer.name}</div>
              ))}
            {order.customer.email && (
              <div class="mt-2 text-[13px] text-[var(--text-muted)]" style={{ overflowWrap: 'anywhere' }}>
                {order.customer.email}
              </div>
            )}
            {order.customer.phone && (
              <div
                class="mt-0.5 text-[12px] text-[var(--text-faint)]"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {order.customer.phone}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function GuiaRow({ guia }: { guia: Envio }) {
  return (
    <div class="flex items-center justify-between gap-2 text-[12px]" style={{ fontFamily: 'var(--font-mono)' }}>
      <span class="text-[var(--text-muted)]">{guia.carrier ?? 'paquetería —'}</span>
      <span class="min-w-0 flex-1 truncate text-[var(--text-faint)]">
        {guia.tracking_number ?? 'sin guía'}
      </span>
      <span class="text-[var(--text-muted)]">{guia.status}</span>
    </div>
  );
}

function ShippingBlock({ order }: { order: Order }) {
  const a = order.shipping?.address;
  const name = order.shipping?.name ?? order.customer.name;
  return (
    <div class="text-[13px] leading-[1.7] text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
      {name && <div>{name}</div>}
      {a?.line1 && (
        <div>
          {a.line1}
          {a.line2 ? `, ${a.line2}` : ''}
        </div>
      )}
      {(a?.city || a?.postal_code) && (
        <div>{[a?.postal_code, a?.city, a?.state].filter(Boolean).join(' · ')}</div>
      )}
      {!a?.line1 && !name && <div class="text-[var(--text-faint)]">Sin dirección de envío.</div>}
    </div>
  );
}

function configDescription(config: { model: string; pantalla: string; tapa: string }): string {
  const model = MODELS.find((m) => m.id === config.model)?.label ?? config.model;
  return `${model} · pantalla ${colorLabel(config.pantalla)} · cuerpo blanco · tapa ${colorLabel(config.tapa)}`;
}
