// Clientes del CRM. La tabla `customers` (migración 0008) la puebla el
// webhook de Stripe en cada pedido; aquí solo se lee y se editan las notas.
// Sin grafo de estados: un cliente no tiene ciclo de vida, solo historial.

export interface CustomerRow {
  id: string;
  created_at: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  // Agregados del LEFT JOIN a orders (no son columnas de la tabla).
  order_count?: number | null;
  last_order_at?: string | null;
  active_order_count?: number | null;
  // Ciudad derivada del envío del último pedido (no hay columna city).
  city?: string | null;
}

export function shapeCustomer(row: CustomerRow) {
  return {
    id: row.id,
    created_at: row.created_at,
    name: row.name,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    order_count: row.order_count ?? 0,
    last_order_at: row.last_order_at ?? null,
    active_order_count: row.active_order_count ?? 0,
    city: row.city ?? null,
  };
}
