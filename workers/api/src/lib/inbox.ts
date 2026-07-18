// Inbox de mensajes con clientes (tabla messages, migración 0014). Sin
// tabla de hilos: customer_id + orden cronológico ES el hilo. El grafo de
// estados sigue el patrón de lib/orders.ts y se valida aquí, no con CHECK
// en D1 (lección 0004).

export const CHANNELS = ['email', 'whatsapp', 'web', 'manual'] as const;
export type Channel = (typeof CHANNELS)[number];

export const DIRECTIONS = ['in', 'out'] as const;
export type Direction = (typeof DIRECTIONS)[number];

export type MessageStatus = 'nuevo' | 'leido' | 'respondido' | 'archivado';

export interface MessageRow {
  id: string;
  channel: string;
  direction: string;
  external_id: string | null;
  customer_id: string | null;
  order_id: string | null;
  subject: string | null;
  body: string;
  status: string;
  created_at: string;
}

// Transiciones permitidas del mensaje. Un nuevo puede responderse directo
// (sin pasar por leído); archivado es terminal.
const TRANSITIONS: Record<MessageStatus, MessageStatus[]> = {
  nuevo: ['leido', 'respondido', 'archivado'],
  leido: ['respondido', 'archivado'],
  respondido: ['archivado'],
  archivado: [],
};

export function canTransition(from: string, to: string): boolean {
  return (TRANSITIONS[from as MessageStatus] ?? []).includes(to as MessageStatus);
}

export const MESSAGE_STATUSES = Object.keys(TRANSITIONS) as MessageStatus[];

// external_id se OMITE a propósito: es la llave de idempotencia de los
// conectores futuros (patrón webhook_events), no algo que la UI deba cargar.
export function shapeMessage(row: MessageRow) {
  return {
    id: row.id,
    channel: row.channel,
    direction: row.direction,
    customer_id: row.customer_id,
    order_id: row.order_id,
    subject: row.subject,
    body: row.body,
    status: row.status,
    created_at: row.created_at,
  };
}
