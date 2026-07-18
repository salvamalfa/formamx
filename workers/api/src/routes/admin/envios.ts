import { Hono } from 'hono';
import type { AppContext } from '../../env';
import { canTransition, SHIPMENT_STATUSES, shapeShipment, type ShipmentRow } from '../../lib/envios';
import { parseJson } from './_shape';

// Guías de envío. Sin PATCH de tracking/carrier en v1: una guía equivocada
// no se edita, se crea otra (1 pedido → N guías) — el historial no miente.
export const envios = new Hono<AppContext>();

// Fila con el resumen del pedido (JOIN a orders) para pintar cliente y
// destino junto a la guía sin una segunda consulta.
interface ShipmentJoinRow extends ShipmentRow {
  o_customer_name: string | null;
  o_shipping_json: string | null;
}

const shapeWithPedido = (row: ShipmentJoinRow) => ({
  ...shapeShipment(row),
  pedido: {
    id: row.order_id,
    customer_name: row.o_customer_name,
    shipping: parseJson(row.o_shipping_json),
  },
});

const SELECT_JOIN = `SELECT s.*, o.customer_name AS o_customer_name, o.shipping_json AS o_shipping_json
  FROM shipments s LEFT JOIN orders o ON o.id = s.order_id`;

// Guías para el tablero. Por defecto las no entregadas (lo que aún se
// vigila); `?status=` filtra a uno, `?order_id=` a un pedido, `?limit=`.
envios.get('/', async (c) => {
  const status = c.req.query('status');
  const orderId = c.req.query('order_id');
  const limit = Math.min(Number(c.req.query('limit')) || 100, 200);

  const where: string[] = [];
  const binds: (string | number)[] = [];
  if (status) {
    where.push('s.status = ?');
    binds.push(status);
  } else {
    where.push("s.status != 'entregada'");
  }
  if (orderId) {
    where.push('s.order_id = ?');
    binds.push(orderId);
  }
  binds.push(limit);

  const { results } = await c.env.DB.prepare(
    `${SELECT_JOIN} WHERE ${where.join(' AND ')} ORDER BY s.created_at DESC LIMIT ?`,
  )
    .bind(...binds)
    .all<ShipmentJoinRow>();

  return c.json({ envios: results.map(shapeWithPedido) });
});

// Registra una guía nueva para un pedido. Nace 'creada'; todos los datos de
// la paquetería son opcionales (a veces la guía se captura antes de tenerlos).
envios.post('/', async (c) => {
  type Body = {
    order_id?: string;
    carrier?: string;
    service?: string;
    tracking_number?: string;
    label_url?: string;
    cost_mxn?: number;
  };
  const body = await c.req.json<Body>().catch(() => ({}) as Body);
  if (!body.order_id) return c.json({ error: 'order_id_requerido' }, 400);

  const order = await c.env.DB.prepare(
    'SELECT id, customer_name, shipping_json FROM orders WHERE id = ?',
  )
    .bind(body.order_id)
    .first<{ id: string; customer_name: string | null; shipping_json: string | null }>();
  if (!order) return c.json({ error: 'pedido_no_existe' }, 400);

  const row = await c.env.DB.prepare(
    `INSERT INTO shipments (id, order_id, carrier, service, tracking_number, label_url, cost_mxn)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(
      'shp_' + crypto.randomUUID(),
      body.order_id,
      body.carrier ?? null,
      body.service ?? null,
      body.tracking_number ?? null,
      body.label_url ?? null,
      body.cost_mxn ?? null,
    )
    .first<ShipmentRow>();

  return c.json(
    shapeWithPedido({
      ...row!,
      o_customer_name: order.customer_name,
      o_shipping_json: order.shipping_json,
    }),
  );
});

// Avanza el estado de la guía siguiendo el grafo permitido.
envios.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ status?: string }>().catch(() => ({}) as { status?: string });
  const next = body.status;
  if (!next) return c.json({ error: 'status_requerido' }, 400);
  if (!SHIPMENT_STATUSES.includes(next as (typeof SHIPMENT_STATUSES)[number])) {
    return c.json({ error: 'estado_desconocido', status: next }, 400);
  }

  const row = await c.env.DB.prepare(`${SELECT_JOIN} WHERE s.id = ?`)
    .bind(id)
    .first<ShipmentJoinRow>();
  if (!row) return c.json({ error: 'no_existe' }, 404);
  if (row.status === next) return c.json(shapeWithPedido(row));
  if (!canTransition(row.status, next)) {
    return c.json({ error: 'transicion_invalida', from: row.status, to: next }, 409);
  }

  // UPDATE guardado por el estado leído (patrón pedidos.ts): si otra pestaña
  // movió la guía entre el SELECT y aquí, no se pisa nada. El mismo UPDATE
  // sella las fechas — COALESCE para que una incidencia que retoma el
  // tránsito no re-escriba el shipped_at original.
  const updated = await c.env.DB.prepare(
    `UPDATE shipments SET status = ?,
       shipped_at = CASE WHEN ? = 'en_transito'
         THEN COALESCE(shipped_at, datetime('now')) ELSE shipped_at END,
       delivered_at = CASE WHEN ? = 'entregada'
         THEN COALESCE(delivered_at, datetime('now')) ELSE delivered_at END
     WHERE id = ? AND status = ? RETURNING *`,
  )
    .bind(next, next, next, id, row.status)
    .first<ShipmentRow>();
  if (!updated) {
    return c.json({ error: 'transicion_concurrente', from: row.status, to: next }, 409);
  }
  return c.json(
    shapeWithPedido({
      ...updated,
      o_customer_name: row.o_customer_name,
      o_shipping_json: row.o_shipping_json,
    }),
  );
});
