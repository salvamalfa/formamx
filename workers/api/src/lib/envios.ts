// Guías de envío (tabla shipments, migración 0011). Un pedido puede tener
// N guías: los reenvíos son filas nuevas, no ediciones. El grafo de estados
// sigue el patrón de lib/orders.ts y se valida aquí, no con CHECK en D1.

export type ShipmentStatus = 'creada' | 'en_transito' | 'entregada' | 'incidencia';

export interface ShipmentRow {
  id: string;
  order_id: string;
  carrier: string | null;
  service: string | null;
  tracking_number: string | null;
  label_url: string | null;
  cost_mxn: number | null;
  raw_json: string | null;
  status: string;
  created_at: string;
  shipped_at: string | null;
  delivered_at: string | null;
}

// Transiciones permitidas de la guía. Una incidencia se resuelve retomando
// el tránsito o confirmando la entrega; entregada es terminal.
const TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  creada: ['en_transito', 'incidencia'],
  en_transito: ['entregada', 'incidencia'],
  incidencia: ['en_transito', 'entregada'],
  entregada: [],
};

export function canTransition(from: string, to: string): boolean {
  return (TRANSITIONS[from as ShipmentStatus] ?? []).includes(to as ShipmentStatus);
}

export const SHIPMENT_STATUSES = Object.keys(TRANSITIONS) as ShipmentStatus[];

// raw_json se OMITE a propósito: es la respuesta cruda del carrier (para
// depurar una integración futura), no algo que la UI deba cargar.
export function shapeShipment(row: ShipmentRow) {
  return {
    id: row.id,
    order_id: row.order_id,
    carrier: row.carrier,
    service: row.service,
    tracking_number: row.tracking_number,
    label_url: row.label_url,
    cost_mxn: row.cost_mxn,
    status: row.status,
    created_at: row.created_at,
    shipped_at: row.shipped_at,
    delivered_at: row.delivered_at,
  };
}
