import type { LampImageManifest } from '../../../config/lamps';
import { MODELS } from '../../../config/lamps';
import type { Order, PrintJob, Spool } from '../../../lib/taller';
import { money } from '../ui/format';
import { FilamentNeeds } from './FilamentNeeds';
import { JobsStrip } from './JobsStrip';
import { LampPreview } from './LampPreview';
import { NEXT_STEP, statusLabel } from './labels';

export function OrderCard({
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
  const es3d = order.production === 'impresion_3d';

  // El pedido de impresión en cola y sin despachar puede mandarse a imprimir;
  // solo si los 3 filamentos que necesita están cargados en el AMS.
  const canDispatch = es3d && order.config && order.status === 'en_cola' && order.jobs.length === 0;
  // Los pedidos 3D en cola avanzan solos cuando el agente imprime; el botón
  // manual solo aplica al taller manual (madera, etc.).
  const step = es3d && order.status === 'en_cola' ? undefined : NEXT_STEP[order.status];
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

        {order.config && <FilamentNeeds config={order.config} loaded={loaded} />}

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

function ShippingBlock({ order }: { order: Order }) {
  const a = order.shipping?.address;
  return (
    <div
      class="mt-1 text-[11px] leading-[1.8] text-[var(--text-muted)]"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      {order.customer.name && <div>{order.customer.name}</div>}
      {a?.line1 && (
        <div>
          {a.line1}
          {a.line2 ? `, ${a.line2}` : ''}
        </div>
      )}
      {(a?.city || a?.postal_code) && (
        <div>{[a?.postal_code, a?.city, a?.state].filter(Boolean).join(' · ')}</div>
      )}
      {order.customer.phone && <div>{order.customer.phone}</div>}
      {order.customer.email && <div>{order.customer.email}</div>}
    </div>
  );
}

function describeOrder(order: Order): string {
  if (!order.config) {
    return order.product_id === 'banca-001' ? 'La banca de los abuelos' : order.product_id;
  }
  const model = MODELS.find((m) => m.id === order.config!.model)?.label ?? order.config.model;
  return `Lámpara ${model}`;
}
