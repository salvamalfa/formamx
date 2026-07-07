export type OrderStatus =
  | 'pendiente'
  | 'pagada'
  | 'en_cola'
  | 'imprimiendo'
  | 'lista'
  | 'enviada'
  | 'cancelada';

// Transiciones permitidas del pedido. El pago (pendiente→pagada) lo maneja
// solo el webhook; desde el dashboard se avanza por la línea del taller.
// Cualquier estado no terminal puede cancelarse a mano.
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pendiente: ['cancelada'],
  pagada: ['en_cola', 'cancelada'],
  en_cola: ['imprimiendo', 'cancelada'],
  imprimiendo: ['lista', 'cancelada'],
  lista: ['enviada', 'cancelada'],
  enviada: [],
  cancelada: [],
};

export function canTransition(from: string, to: string): boolean {
  return (TRANSITIONS[from as OrderStatus] ?? []).includes(to as OrderStatus);
}

export const ORDER_STATUSES = Object.keys(TRANSITIONS) as OrderStatus[];
