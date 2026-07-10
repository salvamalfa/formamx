import { Hono } from 'hono';
import type { AppContext } from '../env';
import { bearer } from '../lib/auth';
import { validateLampConfig } from '../lib/catalog';
import { shapeJob, type PrintJobRow } from '../lib/jobs';
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
  customer_id: string | null;
  shipping_json: string | null;
  production?: string | null; // join a products
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

// Pedidos para el tablero. Por defecto los no terminales (lo que aún requiere
// trabajo), más nuevos primero. `?status=` filtra a uno solo; `?limit=`.
admin.get('/orders', async (c) => {
  const status = c.req.query('status');
  const limit = Math.min(Number(c.req.query('limit')) || 100, 200);

  const query = status
    ? c.env.DB.prepare(
        `SELECT o.*, p.production FROM orders o
         LEFT JOIN products p ON p.id = o.product_id
         WHERE o.status = ? ORDER BY o.created_at DESC LIMIT ?`,
      ).bind(status, limit)
    : c.env.DB.prepare(
        `SELECT o.*, p.production FROM orders o
         LEFT JOIN products p ON p.id = o.product_id
         WHERE o.status NOT IN ('enviada', 'cancelada')
         ORDER BY o.created_at DESC LIMIT ?`,
      ).bind(limit);

  const { results } = await query.all<OrderFullRow>();

  // Trabajos de impresión de los pedidos listados, en una sola consulta.
  const jobsByOrder = new Map<string, ReturnType<typeof shapeJob>[]>();
  if (results.length) {
    const ids = results.map((o) => o.id);
    const placeholders = ids.map(() => '?').join(',');
    const { results: jobs } = await c.env.DB.prepare(
      `SELECT * FROM print_jobs WHERE order_id IN (${placeholders}) ORDER BY created_at`,
    )
      .bind(...ids)
      .all<PrintJobRow>();
    for (const j of jobs) {
      const list = jobsByOrder.get(j.order_id) ?? [];
      list.push(shapeJob(j));
      jobsByOrder.set(j.order_id, list);
    }
  }

  return c.json({
    orders: results.map((row) => ({ ...shapeOrder(row), jobs: jobsByOrder.get(row.id) ?? [] })),
  });
});

// Despacha un pedido de lámpara a la impresora: crea sus 2 trabajos
// (pantalla en su color, cuerpo+tapa con blanco + color de tapa).
admin.post('/orders/:id/dispatch', async (c) => {
  const id = c.req.param('id');
  const order = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?')
    .bind(id)
    .first<OrderFullRow>();
  if (!order) return c.json({ error: 'no_existe' }, 404);
  if (order.status !== 'en_cola') {
    return c.json({ error: 'estado_invalido', status: order.status }, 409);
  }
  const config = validateLampConfig(parseJson(order.config_json));
  if (!config) return c.json({ error: 'sin_config' }, 409);

  const existing = await c.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM print_jobs WHERE order_id = ?',
  )
    .bind(id)
    .first<{ n: number }>();
  if (existing && existing.n > 0) return c.json({ error: 'ya_despachado' }, 409);

  // Cada pieza es su propio archivo rebanado de un filamento; el color real
  // lo pone el AMS al imprimir.
  const jobs = [
    { part: 'pantalla', file_key: `pantalla/${config.model}`, colors: [config.pantalla] },
    { part: 'cuerpo', file_key: 'cuerpo/cuerpo', colors: ['blanco'] },
    { part: 'tapa', file_key: 'tapa/tapa', colors: [config.tapa] },
  ];
  await c.env.DB.batch(
    jobs.map((j) =>
      c.env.DB.prepare(
        'INSERT INTO print_jobs (id, order_id, part, file_key, colors_json) VALUES (?, ?, ?, ?, ?)',
      ).bind(`job_${crypto.randomUUID()}`, id, j.part, j.file_key, JSON.stringify(j.colors)),
    ),
  );

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM print_jobs WHERE order_id = ? ORDER BY created_at',
  )
    .bind(id)
    .all<PrintJobRow>();
  return c.json({ jobs: results.map(shapeJob) });
});

// Reencola un trabajo fallido (botón Reintentar del dashboard).
admin.post('/jobs/:id/requeue', async (c) => {
  const id = c.req.param('id');
  const updated = await c.env.DB.prepare(
    `UPDATE print_jobs
     SET status = 'queued', progress_pct = NULL, message = NULL, claimed_at = NULL,
         updated_at = datetime('now')
     WHERE id = ? AND status = 'failed'
     RETURNING *`,
  )
    .bind(id)
    .first<PrintJobRow>();
  if (!updated) return c.json({ error: 'no_reencolable' }, 409);
  return c.json(shapeJob(updated));
});

// Avanza el estado del pedido siguiendo el grafo permitido.
admin.patch('/orders/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ status?: string }>().catch(() => ({}) as { status?: string });
  const next = body.status;
  if (!next) return c.json({ error: 'status_requerido' }, 400);

  const order = await c.env.DB.prepare(
    'SELECT o.*, p.production FROM orders o LEFT JOIN products p ON p.id = o.product_id WHERE o.id = ?',
  )
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

// Estado físico de la impresora: candado de cama + última lectura del AMS.
admin.get('/printer', async (c) => {
  const flags = await c.env.DB.prepare(
    'SELECT bed_clear, ams_synced_at FROM printer_flags WHERE id = 1',
  ).first<{ bed_clear: number; ams_synced_at: string | null }>();
  return c.json({
    bed_clear: Boolean(flags?.bed_clear ?? 1),
    ams_synced_at: flags?.ams_synced_at ?? null,
  });
});

// El taller confirma que retiró la pieza: el agente vuelve a recibir trabajos.
admin.post('/printer/bed-clear', async (c) => {
  await c.env.DB.prepare(
    "UPDATE printer_flags SET bed_clear = 1, updated_at = datetime('now') WHERE id = 1",
  ).run();
  return c.json({ bed_clear: true });
});

interface SpoolRow {
  slot: number;
  color_id: string | null;
  material: string | null;
  color_hex: string | null;
}

// Estado de las 4 ranuras del AMS, tal como lo reporta la impresora vía el
// agente (POST /api/agent/ams). Solo lectura: la app no edita el AMS — el
// AMS dicta el estado de la app.
admin.get('/spools', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT slot, color_id, material, color_hex FROM spool_slots ORDER BY slot',
  ).all<SpoolRow>();
  return c.json({ slots: results });
});
