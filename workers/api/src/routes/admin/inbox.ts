import { Hono } from 'hono';
import type { AppContext } from '../../env';
import {
  canTransition,
  CHANNELS,
  DIRECTIONS,
  MESSAGE_STATUSES,
  shapeMessage,
  type Channel,
  type Direction,
  type MessageRow,
  type MessageStatus,
} from '../../lib/inbox';

// Inbox: registro de mensajes con clientes. En v1 la captura es manual
// desde /taller; `external_id` (que la API no expone) queda listo para que
// los conectores futuros (email/WhatsApp) inserten con idempotencia.
export const inbox = new Hono<AppContext>();

// Fila con el nombre del cliente (LEFT JOIN a customers) para pintar quién
// escribió sin una segunda consulta.
interface MessageJoinRow extends MessageRow {
  c_name: string | null;
}

const shapeWithCliente = (row: MessageJoinRow) => ({
  ...shapeMessage(row),
  customer_name: row.c_name,
});

const SELECT_JOIN = `SELECT m.*, c.name AS c_name
  FROM messages m LEFT JOIN customers c ON c.id = m.customer_id`;

// Mensajes para el tablero, más recientes primero. Por defecto los no
// archivados (lo que aún se atiende); `?status=` filtra a uno,
// `?customer_id=` al hilo de un cliente, `?limit=`.
inbox.get('/', async (c) => {
  const status = c.req.query('status');
  const customerId = c.req.query('customer_id');
  const limit = Math.min(Number(c.req.query('limit')) || 100, 200);

  const where: string[] = [];
  const binds: (string | number)[] = [];
  if (status) {
    where.push('m.status = ?');
    binds.push(status);
  } else {
    where.push("m.status != 'archivado'");
  }
  if (customerId) {
    where.push('m.customer_id = ?');
    binds.push(customerId);
  }
  binds.push(limit);

  const { results } = await c.env.DB.prepare(
    `${SELECT_JOIN} WHERE ${where.join(' AND ')} ORDER BY m.created_at DESC LIMIT ?`,
  )
    .bind(...binds)
    .all<MessageJoinRow>();

  return c.json({ mensajes: results.map(shapeWithCliente) });
});

// Registra un mensaje. El status inicial depende de la dirección: uno
// enviado ('out') nace 'respondido' — no está por leer; uno recibido
// ('in', el default) nace 'nuevo'.
inbox.post('/', async (c) => {
  type Body = {
    channel?: string;
    direction?: string;
    subject?: string;
    body?: string;
    customer_id?: string;
    order_id?: string;
  };
  const body = await c.req.json<Body>().catch(() => ({}) as Body);

  if (!body.channel || !CHANNELS.includes(body.channel as Channel)) {
    return c.json({ error: 'canal_invalido', channel: body.channel ?? null }, 400);
  }
  const direction = body.direction ?? 'in';
  if (!DIRECTIONS.includes(direction as Direction)) {
    return c.json({ error: 'direccion_invalida', direction }, 400);
  }
  if (typeof body.body !== 'string' || !body.body.trim()) {
    return c.json({ error: 'body_requerido' }, 400);
  }

  let customerName: string | null = null;
  if (body.customer_id) {
    const cliente = await c.env.DB.prepare('SELECT id, name FROM customers WHERE id = ?')
      .bind(body.customer_id)
      .first<{ id: string; name: string | null }>();
    if (!cliente) return c.json({ error: 'cliente_no_existe' }, 400);
    customerName = cliente.name;
  }
  if (body.order_id) {
    const pedido = await c.env.DB.prepare('SELECT id FROM orders WHERE id = ?')
      .bind(body.order_id)
      .first<{ id: string }>();
    if (!pedido) return c.json({ error: 'pedido_no_existe' }, 400);
  }

  const status = direction === 'out' ? 'respondido' : 'nuevo';

  const row = await c.env.DB.prepare(
    `INSERT INTO messages (id, channel, direction, customer_id, order_id, subject, body, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(
      'msg_' + crypto.randomUUID(),
      body.channel,
      direction,
      body.customer_id ?? null,
      body.order_id ?? null,
      body.subject ?? null,
      body.body,
      status,
    )
    .first<MessageRow>();

  return c.json(shapeWithCliente({ ...row!, c_name: customerName }));
});

// Avanza el estado del mensaje siguiendo el grafo permitido.
inbox.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ status?: string }>().catch(() => ({}) as { status?: string });
  const next = body.status;
  if (!next) return c.json({ error: 'status_requerido' }, 400);
  if (!MESSAGE_STATUSES.includes(next as MessageStatus)) {
    return c.json({ error: 'estado_desconocido', status: next }, 400);
  }

  const row = await c.env.DB.prepare(`${SELECT_JOIN} WHERE m.id = ?`)
    .bind(id)
    .first<MessageJoinRow>();
  if (!row) return c.json({ error: 'no_existe' }, 404);
  if (row.status === next) return c.json(shapeWithCliente(row));
  if (!canTransition(row.status, next)) {
    return c.json({ error: 'transicion_invalida', from: row.status, to: next }, 409);
  }

  // UPDATE guardado por el estado leído (patrón pedidos.ts): si otra
  // pestaña movió el mensaje entre el SELECT y aquí, no se pisa nada.
  const updated = await c.env.DB.prepare(
    'UPDATE messages SET status = ? WHERE id = ? AND status = ? RETURNING *',
  )
    .bind(next, id, row.status)
    .first<MessageRow>();
  if (!updated) {
    return c.json({ error: 'transicion_concurrente', from: row.status, to: next }, 409);
  }
  return c.json(shapeWithCliente({ ...updated, c_name: row.c_name }));
});
