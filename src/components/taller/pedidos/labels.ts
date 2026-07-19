import { MODELS } from '../../../config/lamps';
import type { Order, PrintJob } from '../../../lib/taller';

// El paso en_cola→imprimiendo solo lo usan a mano los pedidos que no pasan
// por la impresora (p. ej. la banca): para ellos "imprimiendo" se presenta
// como "En progreso". Los pedidos 3D avanzan solos cuando el agente imprime.
export const NEXT_STEP: Record<string, { status: string; label: string }> = {
  pagada: { status: 'en_cola', label: 'A la cola' },
  en_cola: { status: 'imprimiendo', label: 'Empezar' },
  imprimiendo: { status: 'lista', label: 'Marcar lista' },
  lista: { status: 'enviada', label: 'Marcar enviada' },
};

export const STATUS_LABEL: Record<string, string> = {
  pendiente: 'Pendiente de pago',
  pagada: 'Pagada',
  en_cola: 'En cola',
  imprimiendo: 'Imprimiendo',
  lista: 'Lista',
  enviada: 'Enviada',
  cancelada: 'Cancelada',
};

// Estado visible según el tipo de pieza: lo que en una lámpara es
// "Imprimiendo", en una pieza manual (madera) es simplemente "En progreso".
export function statusLabel(order: Pick<Order, 'production' | 'status'>): string {
  if (order.production === 'manual' && order.status === 'imprimiendo') return 'En progreso';
  return STATUS_LABEL[order.status] ?? order.status;
}

// Nombre visible del producto de un pedido. La tabla y el detalle lo comparten.
// Solo lee `config` y `product_id`, así que acepta también los pedidos del
// historial del CRM (sin `jobs`).
export function productLabel(order: Pick<Order, 'config' | 'product_id'>): string {
  if (order.config) {
    const model = MODELS.find((m) => m.id === order.config!.model)?.label ?? order.config.model;
    return `Lámpara ${model}`;
  }
  return order.product_id === 'banca-001' ? 'La banca de los abuelos' : order.product_id;
}

// Colores del badge de estado (pill mono). Tonos de marca análogos al mockup:
// mostaza para lo que aún no arranca, naranja para lo que está en la impresora,
// bosque para lo terminado, crema apagada para lo cerrado. Centralizado aquí
// para que la tabla de pedidos y el detalle usen exactamente los mismos pares.
export interface Badge {
  bg: string;
  color: string;
}

const BADGE_CERRADO: Badge = { bg: 'var(--crema-oscuro)', color: 'var(--text-faint)' };

export const STATUS_BADGE: Record<string, Badge> = {
  pendiente: { bg: 'var(--mostaza-claro)', color: 'var(--mostaza-oscuro)' },
  pagada: { bg: 'var(--mostaza-claro)', color: 'var(--mostaza-oscuro)' },
  en_cola: { bg: 'var(--naranja-claro)', color: 'var(--naranja-oscuro)' },
  imprimiendo: { bg: 'var(--naranja-claro)', color: 'var(--naranja-oscuro)' },
  lista: { bg: 'var(--bosque-claro)', color: 'var(--bosque)' },
  enviada: { bg: 'var(--crema-oscuro)', color: 'var(--tinta-suave)' },
  cancelada: BADGE_CERRADO,
};

export function statusBadge(status: string): Badge {
  return STATUS_BADGE[status] ?? BADGE_CERRADO;
}

export const JOB_STATUS_LABEL: Record<PrintJob['status'], string> = {
  queued: 'en cola',
  claimed: 'preparando',
  printing: 'imprimiendo',
  done: 'lista',
  failed: 'falló',
  canceled: 'cancelado',
};

export const PART_LABEL: Record<PrintJob['part'], string> = {
  pantalla: 'Pantalla',
  cuerpo: 'Cuerpo',
  tapa: 'Tapa',
};
