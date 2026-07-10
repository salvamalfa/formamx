import { Hono } from 'hono';
import type { AppContext } from '../../env';
import { validateLampConfig } from '../../lib/catalog';
import { createJobsForOrder, shapeJob, type PrintJobRow } from '../../lib/jobs';
import { canTransition } from '../../lib/orders';
import { parseJson, shapeOrder, type OrderFullRow } from './_shape';

export const pedidos = new Hono<AppContext>();

// Pedidos para el tablero. Por defecto los no terminales (lo que aún requiere
// trabajo), más nuevos primero. `?status=` filtra a uno solo; `?limit=`.
pedidos.get('/orders', async (c) => {
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

// Avanza el estado del pedido siguiendo el grafo permitido.
pedidos.patch('/orders/:id', async (c) => {
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

  await c.env.DB.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(next, id)
    .run();
  return c.json(shapeOrder({ ...order, status: next }));
});

// Despacha un pedido de impresión: crea sus 3 trabajos (pantalla, cuerpo, tapa).
pedidos.post('/orders/:id/dispatch', async (c) => {
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

  const existing = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM print_jobs WHERE order_id = ?')
    .bind(id)
    .first<{ n: number }>();
  if (existing && existing.n > 0) return c.json({ error: 'ya_despachado' }, 409);

  const jobs = await createJobsForOrder(c.env.DB, id, config);
  return c.json({ jobs: jobs.map(shapeJob) });
});

// Reencola un trabajo fallido (botón Reintentar del dashboard).
pedidos.post('/jobs/:id/requeue', async (c) => {
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
