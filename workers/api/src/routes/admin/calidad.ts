import { Hono } from 'hono';
import type { AppContext } from '../../env';
import { CHECKLISTS, shapeQc, validateChecklist, type QcRow } from '../../lib/calidad';

// Control de calidad: registros inmutables por revisión. Sin PATCH a
// propósito — repetir la revisión de una pieza es crear otro registro; el
// historial no se edita. Este módulo NO toca el grafo de pedidos: marcar un
// pedido 'lista' sigue siendo decisión humana en /taller (decisión de diseño
// registrada en docs/ROADMAP_ARQUITECTURA.md §7, Control de calidad).
export const calidad = new Hono<AppContext>();

// Partes válidas de una lámpara; NULL (sin part) = pieza completa.
const PARTS = ['pantalla', 'cuerpo', 'tapa'];

// Fila con el resumen del pedido (JOIN a orders) para pintar producto y
// cliente junto al registro sin una segunda consulta.
interface QcJoinRow extends QcRow {
  o_product_id: string | null;
  o_customer_name: string | null;
}

const shapeWithPedido = (row: QcJoinRow) => ({
  ...shapeQc(row),
  pedido: {
    id: row.order_id,
    product_id: row.o_product_id,
    customer_name: row.o_customer_name,
  },
});

const SELECT_JOIN = `SELECT q.*, o.product_id AS o_product_id, o.customer_name AS o_customer_name
  FROM qc_registros q LEFT JOIN orders o ON o.id = q.order_id`;

// Definiciones de los checklists (viven en código, lib/calidad.ts): el panel
// las pide y pinta tal cual — UI y worker nunca divergen.
calidad.get('/checklists', (c) => c.json({ checklists: CHECKLISTS }));

// Registros para el tablero, más recientes primero. `?order_id=` filtra a un
// pedido, `?limit=` (50 por defecto).
calidad.get('/', async (c) => {
  const orderId = c.req.query('order_id');
  const limit = Math.min(Number(c.req.query('limit')) || 50, 200);

  const where = orderId ? ' WHERE q.order_id = ?' : '';
  const binds: (string | number)[] = orderId ? [orderId, limit] : [limit];

  const { results } = await c.env.DB.prepare(
    `${SELECT_JOIN}${where} ORDER BY q.created_at DESC LIMIT ?`,
  )
    .bind(...binds)
    .all<QcJoinRow>();

  return c.json({ registros: results.map(shapeWithPedido) });
});

// Registra una revisión. El checklist aplicable sale de products.production
// del pedido (?? 'manual'); `passed` lo calcula el worker con las respuestas
// — se ignora cualquier `passed` que venga en el body.
calidad.post('/', async (c) => {
  type Body = {
    order_id?: string;
    checklist?: unknown;
    part?: string | null;
    print_job_id?: string;
    notes?: string;
  };
  const body = await c.req.json<Body>().catch(() => ({}) as Body);
  if (!body.order_id) return c.json({ error: 'order_id_requerido' }, 400);

  const order = await c.env.DB.prepare(
    `SELECT o.id, o.product_id, o.customer_name, p.production
     FROM orders o LEFT JOIN products p ON p.id = o.product_id WHERE o.id = ?`,
  )
    .bind(body.order_id)
    .first<{
      id: string;
      product_id: string;
      customer_name: string | null;
      production: string | null;
    }>();
  if (!order) return c.json({ error: 'pedido_no_existe' }, 400);

  if (body.part != null && !PARTS.includes(body.part)) {
    return c.json({ error: 'part_invalida', part: body.part }, 400);
  }

  const production = order.production === 'impresion_3d' ? 'impresion_3d' : 'manual';
  const verdict = validateChecklist(production, body.checklist);
  if (!verdict) return c.json({ error: 'checklist_incompleta' }, 400);

  const row = await c.env.DB.prepare(
    `INSERT INTO qc_registros (id, order_id, print_job_id, part, checklist_json, passed, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(
      'qc_' + crypto.randomUUID(),
      body.order_id,
      body.print_job_id ?? null,
      body.part ?? null,
      JSON.stringify(body.checklist),
      verdict.passed ? 1 : 0,
      body.notes ?? null,
    )
    .first<QcRow>();

  return c.json(
    shapeWithPedido({
      ...row!,
      o_product_id: order.product_id,
      o_customer_name: order.customer_name,
    }),
  );
});
