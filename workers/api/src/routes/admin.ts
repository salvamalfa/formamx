import { Hono } from 'hono';
import type { AppContext } from '../env';
import { bearer } from '../lib/auth';
import { isSpoolColor } from '../lib/catalog';
import { canTransition } from '../lib/orders';

export const admin = new Hono<AppContext>();

// Todo /api/admin/* exige el bearer del dashboard.
admin.use('*', bearer('ADMIN_TOKEN'));

interface OrderFullRow {
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
  shipping_json: string | null;
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function shapeOrder(row: OrderFullRow) {
  return {
    id: row.id,
    created_at: row.created_at,
    product_id: row.product_id,
    config: parseJson(row.config_json),
    amount_mxn: row.amount_mxn,
    status: row.status,
    payment_method: row.payment_method,
    customer: {
      name: row.customer_name,
      email: row.customer_email,
      phone: row.customer_phone,
    },
    shipping: parseJson(row.shipping_json),
  };
}

// Pedidos para el tablero. Por defecto los no terminales (lo que aún requiere
// trabajo), más nuevos primero. `?status=` filtra a uno solo; `?limit=`.
admin.get('/orders', async (c) => {
  const status = c.req.query('status');
  const limit = Math.min(Number(c.req.query('limit')) || 100, 200);

  const query = status
    ? c.env.DB.prepare(
        'SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC LIMIT ?',
      ).bind(status, limit)
    : c.env.DB.prepare(
        `SELECT * FROM orders
         WHERE status NOT IN ('enviada', 'cancelada')
         ORDER BY created_at DESC LIMIT ?`,
      ).bind(limit);

  const { results } = await query.all<OrderFullRow>();
  return c.json({ orders: results.map(shapeOrder) });
});

// Avanza el estado del pedido siguiendo el grafo permitido.
admin.patch('/orders/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ status?: string }>().catch(() => ({}) as { status?: string });
  const next = body.status;
  if (!next) return c.json({ error: 'status_requerido' }, 400);

  const order = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?')
    .bind(id)
    .first<OrderFullRow>();
  if (!order) return c.json({ error: 'no_existe' }, 404);
  if (order.status === next) return c.json(shapeOrder(order));
  if (!canTransition(order.status, next)) {
    return c.json({ error: 'transicion_invalida', from: order.status, to: next }, 409);
  }

  await c.env.DB.prepare(
    "UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?",
  )
    .bind(next, id)
    .run();
  return c.json(shapeOrder({ ...order, status: next }));
});

interface SpoolRow {
  slot: number;
  color_id: string | null;
}

// Estado de las 4 ranuras del AMS (qué color hay cargado en cada una).
admin.get('/spools', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT slot, color_id FROM spool_slots ORDER BY slot',
  ).all<SpoolRow>();
  return c.json({ slots: results });
});

admin.put('/spools', async (c) => {
  const body = await c.req
    .json<{ slots?: SpoolRow[] }>()
    .catch(() => ({}) as { slots?: SpoolRow[] });
  const slots = body.slots;
  if (!Array.isArray(slots)) return c.json({ error: 'slots_requerido' }, 400);

  for (const s of slots) {
    if (typeof s.slot !== 'number' || s.slot < 0 || s.slot > 3) {
      return c.json({ error: 'slot_invalido' }, 400);
    }
    if (s.color_id !== null && !isSpoolColor(s.color_id)) {
      return c.json({ error: 'color_invalido', slot: s.slot }, 400);
    }
  }

  await c.env.DB.batch(
    slots.map((s) =>
      c.env.DB.prepare(
        "UPDATE spool_slots SET color_id = ?, updated_at = datetime('now') WHERE slot = ?",
      ).bind(s.color_id, s.slot),
    ),
  );

  const { results } = await c.env.DB.prepare(
    'SELECT slot, color_id FROM spool_slots ORDER BY slot',
  ).all<SpoolRow>();
  return c.json({ slots: results });
});
