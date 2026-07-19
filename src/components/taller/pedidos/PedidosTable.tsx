import type { Order } from '../../../lib/taller';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { navigate } from '../router';
import { formatDate, money, shortId } from '../ui/format';
import { productLabel, statusBadge, statusLabel } from './labels';

// Tabla de pedidos del taller. Una sola tabla (el tipo va en el subtítulo).
// En escritorio: fila-grid con las columnas del mockup. En móvil: cards
// apiladas (nombre + badge arriba, meta abajo). Acepta `limit` para que la
// vista Resumen la reuse con el top de pedidos.
const COLS = '90px 1.6fr 1.2fr 100px 90px 110px';

function typeLabel(order: Order): string {
  return order.production === 'manual' ? 'hecha a mano' : 'impresión 3d';
}

function StatusBadge({ order, size = 'sm' }: { order: Order; size?: 'sm' | 'lg' }) {
  const badge = statusBadge(order.status);
  return (
    <span
      class="inline-block whitespace-nowrap rounded-[var(--radius-pill)] text-[11px]"
      style={{
        fontFamily: 'var(--font-mono)',
        background: badge.bg,
        color: badge.color,
        padding: size === 'lg' ? '5px 14px' : '3px 10px',
      }}
    >
      {statusLabel(order)}
    </span>
  );
}

function DesktopRow({ order }: { order: Order }) {
  return (
    <button
      type="button"
      onClick={() => navigate({ vista: 'pedido', id: order.id })}
      class="grid w-full items-center gap-3 rounded-[var(--radius-s)] border-t border-[var(--border-soft)] px-2 py-3 text-left transition-colors hover:bg-[var(--crema-claro)]"
      style={{ gridTemplateColumns: COLS }}
    >
      <span class="truncate text-[12px] text-[var(--text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
        {shortId(order.id)}
      </span>
      <span class="min-w-0">
        <span class="block truncate text-sm font-semibold">{productLabel(order)}</span>
        <span class="mt-0.5 block text-[11px] text-[var(--text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
          {typeLabel(order)}
        </span>
      </span>
      <span class="truncate text-sm text-[var(--text-muted)]">{order.customer.name ?? '—'}</span>
      <span class="text-[12px] text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
        {formatDate(order.created_at)}
      </span>
      <span class="text-[12px]" style={{ fontFamily: 'var(--font-mono)' }}>
        {money(order.amount_mxn)}
      </span>
      <span class="justify-self-end">
        <StatusBadge order={order} />
      </span>
    </button>
  );
}

function MobileCard({ order }: { order: Order }) {
  return (
    <button
      type="button"
      onClick={() => navigate({ vista: 'pedido', id: order.id })}
      class="flex w-full flex-col gap-2 rounded-[var(--radius-s)] border-t border-[var(--border-soft)] px-2 py-3 text-left transition-colors hover:bg-[var(--crema-claro)]"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <span class="block text-sm font-semibold">{productLabel(order)}</span>
          <span class="mt-0.5 block text-[11px] text-[var(--text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {typeLabel(order)}
          </span>
        </div>
        <StatusBadge order={order} />
      </div>
      <div
        class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--text-muted)]"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        <span class="text-[var(--text-faint)]">{shortId(order.id)}</span>
        <span aria-hidden="true">·</span>
        <span>{order.customer.name ?? '—'}</span>
        <span aria-hidden="true">·</span>
        <span>{formatDate(order.created_at)}</span>
        <span aria-hidden="true">·</span>
        <span class="text-[var(--text-body)]">{money(order.amount_mxn)}</span>
      </div>
    </button>
  );
}

export function PedidosTable({ orders, limit }: { orders: Order[]; limit?: number }) {
  const isDesktop = useMediaQuery('(min-width: 768px)');

  const rows = [...orders]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit ?? orders.length);

  if (rows.length === 0) {
    return (
      <div class="rounded-[var(--radius-m)] border border-[var(--border-soft)] bg-[var(--surface-card)] p-6 shadow-[var(--shadow-card)]">
        <p class="m-0 text-sm text-[var(--text-muted)]">No hay pedidos que mostrar.</p>
      </div>
    );
  }

  return (
    <div class="rounded-[var(--radius-m)] border border-[var(--border-soft)] bg-[var(--surface-card)] p-2 shadow-[var(--shadow-card)] sm:p-4">
      {isDesktop && (
        <div
          class="meta-caps grid gap-3 px-2 py-2 text-[11px] text-[var(--text-faint)]"
          style={{ gridTemplateColumns: COLS }}
        >
          <span>Nº</span>
          <span>Pieza</span>
          <span>Cliente</span>
          <span>Creado</span>
          <span>Monto</span>
          <span class="justify-self-end">Estado</span>
        </div>
      )}
      <div class="flex flex-col">
        {rows.map((order) =>
          isDesktop ? (
            <DesktopRow key={order.id} order={order} />
          ) : (
            <MobileCard key={order.id} order={order} />
          ),
        )}
      </div>
    </div>
  );
}

export { StatusBadge };
