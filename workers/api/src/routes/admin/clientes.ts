import { Hono } from 'hono';
import type { AppContext } from '../../env';
import { shapeCustomer, type CustomerRow } from '../../lib/clientes';
import { shapeOrder, type OrderFullRow } from './_shape';

// CRM: lectura de clientes + edición de notas. Sin POST ni DELETE y sin
// edición de nombre/email: los clientes nacen del webhook de Stripe y sus
// datos son un snapshot de lo que declaró el comprador.
export const clientes = new Hono<AppContext>();

// Agregados de pedidos por cliente, en una sola consulta. `city` se deriva
// del envío del último pedido (shipping_json es el shipping_details de Stripe:
// { name, address: { city, ... } }), puede ser NULL si falta.
const LIST_SQL = `SELECT c.*,
    COUNT(o.id) AS order_count,
    MAX(o.created_at) AS last_order_at,
    COALESCE(SUM(CASE WHEN o.status IN ('pagada','en_cola','imprimiendo','lista') THEN 1 ELSE 0 END), 0) AS active_order_count,
    (SELECT json_extract(o2.shipping_json, '$.address.city')
       FROM orders o2 WHERE o2.customer_id = c.id
       ORDER BY o2.created_at DESC LIMIT 1) AS city
  FROM customers c LEFT JOIN orders o ON o.customer_id = c.id`;

// Lista para el tablero: quién ha comprado y cuándo fue la última vez.
// El último pedido más reciente primero (los sin pedidos, al final).
clientes.get('/', async (c) => {
  const limit = Math.min(Number(c.req.query('limit')) || 100, 200);
  const { results } = await c.env.DB.prepare(
    `${LIST_SQL} GROUP BY c.id ORDER BY last_order_at DESC LIMIT ?`,
  )
    .bind(limit)
    .all<CustomerRow>();
  return c.json({ clientes: results.map(shapeCustomer) });
});

// Detalle: el cliente con sus agregados + su historial de pedidos.
clientes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(`${LIST_SQL} WHERE c.id = ? GROUP BY c.id`)
    .bind(id)
    .first<CustomerRow>();
  if (!row) return c.json({ error: 'no_existe' }, 404);

  const { results: pedidos } = await c.env.DB.prepare(
    `SELECT o.*, p.production FROM orders o
     LEFT JOIN products p ON p.id = o.product_id
     WHERE o.customer_id = ? ORDER BY o.created_at DESC LIMIT 50`,
  )
    .bind(id)
    .all<OrderFullRow>();

  return c.json({ cliente: shapeCustomer(row), pedidos: pedidos.map(shapeOrder) });
});

// Guarda las notas del cliente (lo único editable). Cadena vacía = borrarlas.
clientes.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req
    .json<{ notes?: unknown }>()
    .catch(() => ({}) as { notes?: unknown });
  if (typeof body.notes !== 'string') return c.json({ error: 'notes_requerido' }, 400);

  const updated = await c.env.DB.prepare('UPDATE customers SET notes = ? WHERE id = ?')
    .bind(body.notes === '' ? null : body.notes, id)
    .run();
  if (!updated.meta.changes) return c.json({ error: 'no_existe' }, 404);

  // Se relee con el JOIN para responder el cliente completo (con agregados).
  const row = await c.env.DB.prepare(`${LIST_SQL} WHERE c.id = ? GROUP BY c.id`)
    .bind(id)
    .first<CustomerRow>();
  if (!row) return c.json({ error: 'no_existe' }, 404);
  return c.json(shapeCustomer(row));
});
