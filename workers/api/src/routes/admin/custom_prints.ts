import { Hono } from 'hono';
import type { AppContext } from '../../env';
import { isSpoolColor, isSpoolMaterial } from '../../lib/catalog';
import {
  CANCELABLE_STATUSES,
  DELETABLE_STATUSES,
  isOrient,
  isSupports,
  MAX_STL_BYTES,
  previewKey,
  REBANABLE_STATUSES,
  shapeCustomPrint,
  stlKey,
  type CustomPrintRow,
} from '../../lib/custom_prints';

// Piezas STL que mandan los clientes: subirlas, pedir su rebanado y
// administrarlas. El archivo vive en R2 y el rebanado lo hace el agente
// (ver routes/agent.ts). Plan completo en docs/STL_CLIENTES.md.
export const customPrints = new Hono<AppContext>();

// Lista para el tablero. Por defecto lo vivo (sin las canceladas); el
// progreso de impresión se toma del trabajo ligado, si existe.
customPrints.get('/', async (c) => {
  const status = c.req.query('status');
  const limit = Math.min(Number(c.req.query('limit')) || 100, 200);
  const where = status ? 'cp.status = ?' : "cp.status != 'cancelado'";
  const stmt = c.env.DB.prepare(
    `SELECT cp.*, pj.progress_pct AS job_progress FROM custom_prints cp
     LEFT JOIN print_jobs pj ON pj.id = cp.print_job_id
     WHERE ${where} ORDER BY cp.created_at DESC LIMIT ?`,
  );
  const { results } = await (status ? stmt.bind(status, limit) : stmt.bind(limit)).all<
    CustomPrintRow & { job_progress: number | null }
  >();
  return c.json({
    prints: results.map((row) => shapeCustomPrint(row, row.job_progress)),
  });
});

// Subida del STL. El cuerpo es el archivo crudo (no multipart) para poder
// pasarlo a R2 en streaming sin cargarlo en memoria; el nombre viaja en
// ?filename=. R2 necesita saber el tamaño de antemano, así que el
// Content-Length es obligatorio y también sirve para rechazar lo enorme
// ANTES de escribir nada.
customPrints.post('/', async (c) => {
  const raw = c.req.query('filename') ?? '';
  // Un nombre con ruta ('C:\x\y.stl') se queda solo con su última parte.
  const fileName = raw.split(/[\\/]/).pop()?.trim() ?? '';
  if (!fileName || !fileName.toLowerCase().endsWith('.stl')) {
    return c.json({ error: 'nombre_invalido' }, 400);
  }

  const declared = Number(c.req.header('Content-Length'));
  if (!Number.isFinite(declared) || declared <= 0) {
    return c.json({ error: 'longitud_requerida' }, 411);
  }
  if (declared > MAX_STL_BYTES) {
    return c.json({ error: 'archivo_muy_grande', max_bytes: MAX_STL_BYTES }, 400);
  }
  if (!c.req.raw.body) return c.json({ error: 'archivo_vacio' }, 400);

  const id = 'cp_' + crypto.randomUUID();
  const key = stlKey(id);
  await c.env.STL_BUCKET.put(key, c.req.raw.body, {
    httpMetadata: { contentType: 'application/octet-stream' },
  });

  try {
    const row = await c.env.DB.prepare(
      `INSERT INTO custom_prints (id, file_name, r2_key, size_bytes)
       VALUES (?, ?, ?, ?) RETURNING *`,
    )
      .bind(id, fileName, key, declared)
      .first<CustomPrintRow>();
    return c.json(shapeCustomPrint(row!));
  } catch (e) {
    // Sin fila que lo apunte, el objeto sería basura invisible.
    await c.env.STL_BUCKET.delete(key).catch(() => {});
    throw e;
  }
});

// Pide (o repite) el rebanado con un material, color y opciones concretas.
// Encola: el agente lo reclama con GET /api/agent/custom-prints/next.
customPrints.post('/:id/rebanar', async (c) => {
  const id = c.req.param('id');
  type Body = {
    material?: unknown;
    color_id?: unknown;
    color_hex?: unknown;
    supports?: unknown;
    orient?: unknown;
  };
  const body = await c.req.json<Body>().catch(() => ({}) as Body);

  if (!isSpoolMaterial(body.material)) return c.json({ error: 'material_invalido' }, 400);
  if (!isSpoolColor(body.color_id)) return c.json({ error: 'color_invalido' }, 400);
  // Soportes y orientación tienen default: el caso común es dejar que el
  // rebanador decida (soportes automáticos, mejor orientación).
  const supports = body.supports ?? 'auto';
  const orient = body.orient ?? 'auto';
  if (!isSupports(supports)) return c.json({ error: 'soportes_invalido' }, 400);
  if (!isOrient(orient)) return c.json({ error: 'orientacion_invalida' }, 400);

  const row = await c.env.DB.prepare('SELECT * FROM custom_prints WHERE id = ?')
    .bind(id)
    .first<CustomPrintRow>();
  if (!row) return c.json({ error: 'no_existe' }, 404);
  if (!REBANABLE_STATUSES.includes(row.status as (typeof REBANABLE_STATUSES)[number])) {
    return c.json({ error: 'transicion_invalida', from: row.status, to: 'en_cola' }, 409);
  }

  // UPDATE guardado por el estado leído (patrón pedidos.ts). Limpia los
  // resultados anteriores: los estimados de la pasada previa no valen para
  // esta configuración.
  const updated = await c.env.DB.prepare(
    `UPDATE custom_prints
        SET status = 'en_cola', material = ?, color_id = ?, color_hex = ?,
            supports = ?, orient = ?, est_seconds = NULL, est_grams = NULL,
            preview = 0, message = NULL, claimed_at = NULL,
            updated_at = datetime('now')
      WHERE id = ? AND status = ? RETURNING *`,
  )
    .bind(
      body.material,
      body.color_id,
      typeof body.color_hex === 'string' ? body.color_hex : null,
      supports,
      orient,
      id,
      row.status,
    )
    .first<CustomPrintRow>();
  if (!updated) {
    return c.json({ error: 'transicion_concurrente', from: row.status, to: 'en_cola' }, 409);
  }
  return c.json(shapeCustomPrint(updated));
});

customPrints.post('/:id/cancelar', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM custom_prints WHERE id = ?')
    .bind(id)
    .first<CustomPrintRow>();
  if (!row) return c.json({ error: 'no_existe' }, 404);
  if (!CANCELABLE_STATUSES.includes(row.status as (typeof CANCELABLE_STATUSES)[number])) {
    return c.json({ error: 'transicion_invalida', from: row.status, to: 'cancelado' }, 409);
  }

  const updated = await c.env.DB.prepare(
    `UPDATE custom_prints SET status = 'cancelado', updated_at = datetime('now')
      WHERE id = ? AND status = ? RETURNING *`,
  )
    .bind(id, row.status)
    .first<CustomPrintRow>();
  if (!updated) {
    return c.json({ error: 'transicion_concurrente', from: row.status, to: 'cancelado' }, 409);
  }
  return c.json(shapeCustomPrint(updated));
});

// Borra la pieza y sus objetos en R2. Primero R2: si algo falla, la fila
// sigue ahí y se puede reintentar (al revés quedaría basura sin dueño).
customPrints.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM custom_prints WHERE id = ?')
    .bind(id)
    .first<CustomPrintRow>();
  if (!row) return c.json({ error: 'no_existe' }, 404);
  if (!DELETABLE_STATUSES.includes(row.status as (typeof DELETABLE_STATUSES)[number])) {
    return c.json({ error: 'estado_no_borrable', status: row.status }, 409);
  }

  await c.env.STL_BUCKET.delete(row.r2_key);
  if (row.preview) await c.env.STL_BUCKET.delete(previewKey(id)).catch(() => {});
  await c.env.DB.prepare('DELETE FROM custom_prints WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// Imagen del plato rebanado, para revisar orientación y soportes antes de
// imprimir. La sube el agente; puede no existir (es best effort).
customPrints.get('/:id/preview', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT preview FROM custom_prints WHERE id = ?')
    .bind(id)
    .first<{ preview: number }>();
  if (!row || !row.preview) return c.json({ error: 'no_existe' }, 404);

  const obj = await c.env.STL_BUCKET.get(previewKey(id));
  if (!obj) return c.json({ error: 'no_existe' }, 404);
  return c.body(obj.body, 200, {
    'Content-Type': 'image/png',
    'Content-Length': String(obj.size),
  });
});
