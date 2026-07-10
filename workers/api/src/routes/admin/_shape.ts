// Formas compartidas entre los módulos de /api/admin.

export interface OrderFullRow {
  id: string;
  created_at: string;
  product_id: string;
  config_json: string | null;
  amount_mxn: number;
  status: string;
  payment_method: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_id: string | null;
  shipping_json: string | null;
  production?: string | null; // join a products
}

export function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function shapeOrder(row: OrderFullRow) {
  return {
    id: row.id,
    created_at: row.created_at,
    product_id: row.product_id,
    production: row.production ?? 'manual',
    config: parseJson(row.config_json),
    amount_mxn: row.amount_mxn,
    status: row.status,
    payment_method: row.payment_method,
    customer: {
      name: row.customer_name,
      email: row.customer_email,
      phone: row.customer_phone,
    },
    customer_id: row.customer_id ?? null,
    shipping: parseJson(row.shipping_json),
  };
}
