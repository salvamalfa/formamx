import { Hono } from 'hono';
import type { AppContext } from '../../env';
import { familiaDeBobina, normalizeHex } from '../../lib/catalog';
import {
  BOBINA_STATUSES,
  canTransitionBobina,
  canTransitionPieza,
  PIEZA_STATUSES,
  QC_VALUES,
  shapeBobina,
  shapePieza,
  type BobinaRow,
  type PiezaRow,
} from '../../lib/inventario';

// Inventario de bodega: bobinas de filamento (almacén) y piezas terminadas.
// El AMS físico sigue viviendo en /spools; aquí solo se administra lo que
// hay en la repisa. El peso restante de la bobina se edita a mano y NUNCA
// se auto-agota al llegar a 0: agotarla es decisión explícita.
export const inventario = new Hono<AppContext>();

// ---- Bobinas ---------------------------------------------------------------

// Almacén para el tablero. Por defecto las no agotadas (lo que aún sirve);
// `?status=` filtra a uno.
inventario.get('/bobinas', async (c) => {
  const status = c.req.query('status');
  const where = status ? 'status = ?' : "status != 'agotada'";
  const stmt = c.env.DB.prepare(
    `SELECT * FROM bobinas WHERE ${where} ORDER BY created_at DESC`,
  );
  const { results } = await (status ? stmt.bind(status) : stmt).all<BobinaRow>();
  return c.json({ bobinas: results.map(shapeBobina) });
});

// Alta de bobina: nace 'nueva' con todo el peso disponible
// (weight_left_g = weight_g, 1000 g si no se dice otra cosa).
inventario.post('/bobinas', async (c) => {
  type Body = {
    color_id?: string;
    color_hex?: string;
    material?: string;
    brand?: string;
    weight_g?: number;
    cost_mxn?: number;
  };
  const body = await c.req.json<Body>().catch(() => ({}) as Body);

  const weight = body.weight_g ?? 1000;
  if (!Number.isInteger(weight) || weight <= 0) {
    return c.json({ error: 'peso_invalido' }, 400);
  }

  // El TONO manda sobre la familia, siempre. El formulario manda las dos cosas
  // y pueden discrepar: eliges "Blanco" y luego arrastras el selector de tono
  // hasta un azul. Guardar el color_id tal cual dejaba una bobina etiquetada
  // "Blanco" que el desplegable del AMS agrupaba con los azules, porque
  // familiaDeBobina lee el hex primero. Se deriva la familia con esa misma
  // función para que lo guardado y lo que empareja no puedan separarse.
  const hex = body.color_hex === undefined ? null : normalizeHex(body.color_hex);
  if (body.color_hex !== undefined && hex === null) {
    return c.json({ error: 'color_hex_invalido' }, 400);
  }
  const colorId = familiaDeBobina({ color_hex: hex, color_id: body.color_id ?? null });

  const row = await c.env.DB.prepare(
    `INSERT INTO bobinas (id, color_id, color_hex, material, brand, weight_g, weight_left_g, cost_mxn)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(
      'bob_' + crypto.randomUUID(),
      colorId,
      hex,
      body.material ?? 'PLA',
      body.brand ?? null,
      weight,
      weight,
      body.cost_mxn ?? null,
    )
    .first<BobinaRow>();

  return c.json(shapeBobina(row!));
});

// Actualiza el peso restante (edición manual tras pesarla), el color y/o
// avanza el estado siguiendo el grafo. Llegar a 0 g no agota nada por sí solo.
inventario.patch('/bobinas/:id', async (c) => {
  const id = c.req.param('id');
  type Body = { weight_left_g?: unknown; status?: string; color_id?: string; color_hex?: string };
  const body = await c.req.json<Body>().catch(() => ({}) as Body);

  const conColor = body.color_id !== undefined || body.color_hex !== undefined;
  let hex: string | null = null;
  if (body.color_hex !== undefined) {
    hex = normalizeHex(body.color_hex);
    if (hex === null) return c.json({ error: 'color_hex_invalido' }, 400);
  }

  const peso = body.weight_left_g;
  const conPeso = peso !== undefined;
  if (conPeso && (typeof peso !== 'number' || !Number.isInteger(peso) || peso < 0)) {
    return c.json({ error: 'peso_invalido' }, 400);
  }
  const next = body.status;
  if (next !== undefined && !BOBINA_STATUSES.includes(next as (typeof BOBINA_STATUSES)[number])) {
    return c.json({ error: 'estado_desconocido', status: next }, 400);
  }

  const row = await c.env.DB.prepare('SELECT * FROM bobinas WHERE id = ?')
    .bind(id)
    .first<BobinaRow>();
  if (!row) return c.json({ error: 'no_existe' }, 404);

  const cambiaStatus = next !== undefined && next !== row.status;
  if (cambiaStatus && !canTransitionBobina(row.status, next)) {
    return c.json({ error: 'transicion_invalida', from: row.status, to: next }, 409);
  }

  if (cambiaStatus) {
    // UPDATE guardado por el estado leído (patrón pedidos.ts): si otra
    // pestaña movió la bobina entre el SELECT y aquí, no se pisa nada.
    const updated = await c.env.DB.prepare(
      `UPDATE bobinas SET status = ?, weight_left_g = COALESCE(?, weight_left_g),
         updated_at = datetime('now')
       WHERE id = ? AND status = ? RETURNING *`,
    )
      .bind(next, conPeso ? (peso as number) : null, id, row.status)
      .first<BobinaRow>();
    if (!updated) {
      return c.json({ error: 'transicion_concurrente', from: row.status, to: next }, 409);
    }
    return c.json(shapeBobina(updated));
  }

  if (conPeso || conColor) {
    // El color viaja junto al peso en un solo UPDATE: corregir el tono de una
    // bobina es lo que la vuelve emparejable con su ranura del AMS, y partirlo
    // en dos requests dejaría un estado intermedio con familia y tono en
    // desacuerdo.
    const nuevoHex = body.color_hex !== undefined ? hex : row.color_hex;
    const nuevoColorId = familiaDeBobina({
      color_hex: nuevoHex,
      color_id: body.color_id !== undefined ? body.color_id : row.color_id,
    });
    const updated = await c.env.DB.prepare(
      `UPDATE bobinas SET weight_left_g = COALESCE(?, weight_left_g),
         color_id = ?, color_hex = ?, updated_at = datetime('now')
       WHERE id = ? RETURNING *`,
    )
      .bind(conPeso ? (peso as number) : null, nuevoColorId, nuevoHex, id)
      .first<BobinaRow>();
    return c.json(shapeBobina(updated!));
  }

  // Nada que cambiar (o el status pedido ya es el actual): idempotente.
  return c.json(shapeBobina(row));
});

// ---- Piezas ----------------------------------------------------------------

// Piezas para el tablero. Por defecto las vivas (stock y reservas); las
// vendidas y la merma se consultan con `?status=`.
inventario.get('/piezas', async (c) => {
  const status = c.req.query('status');
  const where = status ? 'status = ?' : "status NOT IN ('vendida', 'merma')";
  const stmt = c.env.DB.prepare(`SELECT * FROM piezas WHERE ${where} ORDER BY created_at DESC`);
  const { results } = await (status ? stmt.bind(status) : stmt).all<PiezaRow>();
  return c.json({ piezas: results.map(shapePieza) });
});

// Alta de pieza terminada: nace 'en_stock'. El config (lámpara) se guarda
// tal cual llega; una pieza puede nacer ya ligada a un pedido (order_id).
inventario.post('/piezas', async (c) => {
  type Body = {
    product_id?: string;
    config?: unknown;
    location?: string;
    order_id?: string;
  };
  const body = await c.req.json<Body>().catch(() => ({}) as Body);
  if (!body.product_id) return c.json({ error: 'product_id_requerido' }, 400);

  const product = await c.env.DB.prepare('SELECT id FROM products WHERE id = ?')
    .bind(body.product_id)
    .first<{ id: string }>();
  if (!product) return c.json({ error: 'producto_no_existe' }, 400);

  if (body.order_id) {
    const order = await c.env.DB.prepare('SELECT id FROM orders WHERE id = ?')
      .bind(body.order_id)
      .first<{ id: string }>();
    if (!order) return c.json({ error: 'pedido_no_existe' }, 400);
  }

  const row = await c.env.DB.prepare(
    `INSERT INTO piezas (id, product_id, config_json, location, order_id)
     VALUES (?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(
      'pza_' + crypto.randomUUID(),
      body.product_id,
      body.config !== undefined && body.config !== null ? JSON.stringify(body.config) : null,
      body.location ?? null,
      body.order_id ?? null,
    )
    .first<PiezaRow>();

  return c.json(shapePieza(row!));
});

// Avanza el estado por el grafo y/o edita ubicación y veredicto de calidad
// (qc_status es manual y denormalizado, editado a mano desde /taller).
inventario.patch('/piezas/:id', async (c) => {
  const id = c.req.param('id');
  type Body = { status?: string; location?: string; qc_status?: string };
  const body = await c.req.json<Body>().catch(() => ({}) as Body);

  const next = body.status;
  if (next !== undefined && !PIEZA_STATUSES.includes(next as (typeof PIEZA_STATUSES)[number])) {
    return c.json({ error: 'estado_desconocido', status: next }, 400);
  }
  const qc = body.qc_status;
  if (qc !== undefined && !QC_VALUES.includes(qc)) {
    return c.json({ error: 'qc_invalido', qc_status: qc }, 400);
  }
  const conLocation = typeof body.location === 'string';
  // Cadena vacía = borrar la ubicación.
  const location = conLocation ? body.location!.trim() || null : null;

  const row = await c.env.DB.prepare('SELECT * FROM piezas WHERE id = ?')
    .bind(id)
    .first<PiezaRow>();
  if (!row) return c.json({ error: 'no_existe' }, 404);

  const cambiaStatus = next !== undefined && next !== row.status;
  if (cambiaStatus && !canTransitionPieza(row.status, next)) {
    return c.json({ error: 'transicion_invalida', from: row.status, to: next }, 409);
  }

  // location y qc_status entran al mismo UPDATE con pares bandera+valor
  // (CASE WHEN) para poder también borrar la ubicación con NULL.
  const SET_EXTRAS = `location = CASE WHEN ? THEN ? ELSE location END,
       qc_status = CASE WHEN ? THEN ? ELSE qc_status END`;
  const extras = [conLocation ? 1 : 0, location, qc !== undefined ? 1 : 0, qc ?? null];

  if (cambiaStatus) {
    // UPDATE guardado por el estado leído (patrón pedidos.ts).
    const updated = await c.env.DB.prepare(
      `UPDATE piezas SET status = ?, ${SET_EXTRAS} WHERE id = ? AND status = ? RETURNING *`,
    )
      .bind(next, ...extras, id, row.status)
      .first<PiezaRow>();
    if (!updated) {
      return c.json({ error: 'transicion_concurrente', from: row.status, to: next }, 409);
    }
    return c.json(shapePieza(updated));
  }

  if (conLocation || qc !== undefined) {
    const updated = await c.env.DB.prepare(
      `UPDATE piezas SET ${SET_EXTRAS} WHERE id = ? RETURNING *`,
    )
      .bind(...extras, id)
      .first<PiezaRow>();
    return c.json(shapePieza(updated!));
  }

  // Nada que cambiar (o el status pedido ya es el actual): idempotente.
  return c.json(shapePieza(row));
});
