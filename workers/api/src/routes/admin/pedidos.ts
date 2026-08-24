import { Hono } from 'hono';
import type { AppContext } from '../../env';
import { validateLampConfig } from '../../lib/catalog';
import { createJobsForOrder, shapeJob, type PrintJobRow } from '../../lib/jobs';
import { canTransition } from '../../lib/orders';
import { parseJson, shapeOrder, type OrderFullRow } from './_shape';

export const pedidos = new Hono<AppContext>();

// SELECT base de un pedido con la producción de su producto (JOIN a products).
// A cada consulta se le concatena su WHERE/ORDER/LIMIT.
const ORDER_SELECT = `SELECT o.*, p.production FROM orders o
  LEFT JOIN products p ON p.id = o.product_id`;

// Pedidos para el tablero. Por defecto los no terminales (lo que aún requiere
// trabajo), más nuevos primero. `?status=` filtra a uno solo; `?limit=`.
pedidos.get('/orders', async (c) => {
  const status = c.req.query('status');
  const limit = Math.min(Number(c.req.query('limit')) || 100, 200);

  const query = status
    ? c.env.DB.prepare(
        `${ORDER_SELECT} WHERE o.status = ? ORDER BY o.created_at DESC LIMIT ?`,
      ).bind(status, limit)
    : c.env.DB.prepare(
        `${ORDER_SELECT} WHERE o.status NOT IN ('enviada', 'cancelada')
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
      // El WHERE ya excluye los trabajos sin pedido (piezas de cliente); el
      // guard es para el tipo, que desde la 0017 admite order_id nulo.
      if (!j.order_id) continue;
      const list = jobsByOrder.get(j.order_id) ?? [];
      list.push(shapeJob(j));
      jobsByOrder.set(j.order_id, list);
    }
  }

  return c.json({
    orders: results.map((row) => ({ ...shapeOrder(row), jobs: jobsByOrder.get(row.id) ?? [] })),
  });
});

// Detalle de un pedido + sus trabajos de impresión (para el detalle del
// tablero, incluidos pedidos ya enviados/cancelados que la lista no trae).
// GET distingue de POST /orders/:id/dispatch por método y ruta.
pedidos.get('/orders/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(`${ORDER_SELECT} WHERE o.id = ?`)
    .bind(id)
    .first<OrderFullRow>();
  if (!row) return c.json({ error: 'no_existe' }, 404);

  const { results: jobs } = await c.env.DB.prepare(
    'SELECT * FROM print_jobs WHERE order_id = ? ORDER BY created_at',
  )
    .bind(id)
    .all<PrintJobRow>();

  return c.json({ ...shapeOrder(row), jobs: jobs.map(shapeJob) });
});

// Avanza el estado del pedido siguiendo el grafo permitido.
pedidos.patch('/orders/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ status?: string }>().catch(() => ({}) as { status?: string });
  const next = body.status;
  if (!next) return c.json({ error: 'status_requerido' }, 400);

  const order = await c.env.DB.prepare(`${ORDER_SELECT} WHERE o.id = ?`)
    .bind(id)
    .first<OrderFullRow>();
  if (!order) return c.json({ error: 'no_existe' }, 404);
  if (order.status === next) return c.json(shapeOrder(order));
  if (!canTransition(order.status, next)) {
    return c.json({ error: 'transicion_invalida', from: order.status, to: next }, 409);
  }

  // UPDATE guardado por el estado leído: si otro proceso (webhook, agente, otra
  // pestaña) cambió el estado entre el SELECT y aquí, no se pisa nada.
  const moved = await c.env.DB.prepare(
    "UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ? AND status = ?",
  )
    .bind(next, id, order.status)
    .run();
  if (!moved.meta.changes) {
    return c.json({ error: 'transicion_concurrente', from: order.status, to: next }, 409);
  }
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

  // El índice único (order_id, part) cierra la carrera: si dos despachos entran
  // a la vez y ambos pasan el COUNT, el segundo choca con el UNIQUE y aquí se
  // traduce a 409 en vez de crear un segundo juego de trabajos.
  let jobs;
  try {
    jobs = await createJobsForOrder(c.env.DB, id, config);
  } catch (err) {
    if (err instanceof Error && /UNIQUE/i.test(err.message)) {
      return c.json({ error: 'ya_despachado' }, 409);
    }
    throw err;
  }
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
