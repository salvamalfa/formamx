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
  purgeCustomPrintFiles,
  REBANABLE_STATUSES,
  SCOPE_WHERE,
  shapeCustomPrint,
  stlKey,
  type CustomPrintRow,
} from '../../lib/custom_prints';

// Piezas STL que mandan los clientes: subirlas, pedir su rebanado y
// administrarlas. El archivo vive en R2 y el rebanado lo hace el agente
// (ver routes/agent.ts). Plan completo en docs/STL_CLIENTES.md.
export const customPrints = new Hono<AppContext>();

// Lista para el tablero. Por defecto lo vivo (sin las canceladas); con
// ?scope=pendientes|historico se piden las dos pestañas por separado, que es
// lo que evita que el tope del listado esconda una pieza pendiente vieja
// detrás de cien terminadas. El progreso de impresión se toma del trabajo
// ligado, si existe. Los conteos van completos (sin tope) para que las
// pestañas digan la verdad aunque la página venga recortada.
customPrints.get('/', async (c) => {
  const status = c.req.query('status');
  const scope = c.req.query('scope');
  const limit = Math.min(Number(c.req.query('limit')) || 100, 200);
  const where = status
    ? 'cp.status = ?'
    : (SCOPE_WHERE[scope ?? ''] ?? "cp.status != 'cancelado'");
  const stmt = c.env.DB.prepare(
    `SELECT cp.*, pj.progress_pct AS job_progress, pj.status AS job_status FROM custom_prints cp
     LEFT JOIN print_jobs pj ON pj.id = cp.print_job_id
     WHERE ${where} ORDER BY cp.created_at DESC LIMIT ?`,
  );
  const [{ results }, counts] = await Promise.all([
    (status ? stmt.bind(status, limit) : stmt.bind(limit)).all<
      CustomPrintRow & { job_progress: number | null; job_status: string | null }
    >(),
    c.env.DB.prepare(
      `SELECT
         SUM(CASE WHEN ${SCOPE_WHERE.pendientes} THEN 1 ELSE 0 END) AS pendientes,
         SUM(CASE WHEN ${SCOPE_WHERE.historico} THEN 1 ELSE 0 END) AS historico
       FROM custom_prints cp`,
    ).first<{ pendientes: number | null; historico: number | null }>(),
  ]);

  // Limpieza pendiente: si al terminar una impresión R2 falló, los archivos
  // del cliente siguen guardados. Se reintenta aquí (fuera de la respuesta)
  // porque es el punto que se visita solo, sin cron ni cola aparte.
  const sucias = results.filter((row) => row.status === 'terminado' && !row.files_deleted);
  if (sucias.length) {
    c.executionCtx.waitUntil(
      Promise.all(
        sucias.map((row) =>
          purgeCustomPrintFiles(c.env.STL_BUCKET, c.env.DB, row.id, row.r2_key),
        ),
      ).then(() => {}),
    );
  }

  return c.json({
    prints: results.map((row) => shapeCustomPrint(row, row.job_progress, row.job_status)),
    counts: { pendientes: counts?.pendientes ?? 0, historico: counts?.historico ?? 0 },
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

// Sobrescribe el precio sugerido de una pieza (desglose "›" en /taller).
// `price_override_mxn: null` limpia la sobrescritura y vuelve a mostrar el
// price_mxn calculado. No toca cost_mxn: el costo es un hecho (lo que costó
// producirla), el override es una decisión de negocio sobre el precio.
customPrints.patch('/:id/precio', async (c) => {
  const id = c.req.param('id');
  const body = await c.req
    .json<{ price_override_mxn?: number | null }>()
    .catch(() => ({}) as { price_override_mxn?: number | null });
  const value = body.price_override_mxn ?? null;
  if (value !== null && (!Number.isInteger(value) || value < 0)) {
    return c.json({ error: 'precio_invalido' }, 400);
  }

  const updated = await c.env.DB.prepare(
    'UPDATE custom_prints SET price_override_mxn = ? WHERE id = ? RETURNING *',
  )
    .bind(value, id)
    .first<CustomPrintRow>();
  if (!updated) return c.json({ error: 'no_existe' }, 404);
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

// Manda la pieza a la impresora: crea su trabajo en la MISMA cola que las
// lámparas, así hereda el claim atómico, el candado de cama y el reencolado
// sin duplicar nada. Las dos sentencias van en un batch (una transacción) y
// las dos están guardadas por `status = 'listo'`: si la pieza dejó de estarlo
// entre la lectura y aquí, no se inserta trabajo ni se mueve el estado.
customPrints.post('/:id/imprimir', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM custom_prints WHERE id = ?')
    .bind(id)
    .first<CustomPrintRow>();
  if (!row) return c.json({ error: 'no_existe' }, 404);
  if (row.status !== 'listo') {
    return c.json({ error: 'transicion_invalida', from: row.status, to: 'imprimiendo' }, 409);
  }
  // Sin color no hay ams_mapping posible: el agente fallaría el trabajo justo
  // antes de tocar la impresora, así que mejor no crearlo.
  if (!row.color_id) return c.json({ error: 'color_requerido' }, 400);

  const jobId = `job_${crypto.randomUUID()}`;
  const [inserted] = await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO print_jobs (id, order_id, custom_print_id, part, file_key, colors_json)
       SELECT ?, NULL, id, 'cliente', 'clientes/' || id, json_array(color_id)
       FROM custom_prints WHERE id = ? AND status = 'listo' AND color_id IS NOT NULL`,
    ).bind(jobId, id),
    c.env.DB.prepare(
      `UPDATE custom_prints SET status = 'imprimiendo', print_job_id = ?, message = NULL,
         updated_at = datetime('now')
       WHERE id = ? AND status = 'listo'`,
    ).bind(jobId, id),
  ]);
  if (!inserted.meta.changes) {
    return c.json({ error: 'transicion_concurrente', from: row.status, to: 'imprimiendo' }, 409);
  }

  const updated = await c.env.DB.prepare('SELECT * FROM custom_prints WHERE id = ?')
    .bind(id)
    .first<CustomPrintRow>();
  return c.json(shapeCustomPrint(updated!));
});

// Borra la pieza y sus objetos en R2, en tres pasos para no perder ni la
// carrera ni los archivos:
//  1. la fila pasa a 'borrado' con un UPDATE guardado por estado — si alguien
//     la encoló para rebanar entre la lectura y aquí, esto no toca nada y el
//     archivo se conserva;
//  2. se limpian los objetos de R2 (claves deterministas, borrado idempotente);
//  3. recién entonces desaparece la fila.
// Si R2 falla, la fila se queda en 'borrado': es la única pista de qué archivos
// hay que limpiar, y repetir el borrado reintenta. Nunca se reporta éxito con
// el STL del cliente todavía guardado.
customPrints.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM custom_prints WHERE id = ?')
    .bind(id)
    .first<CustomPrintRow>();
  if (!row) return c.json({ error: 'no_existe' }, 404);
  if (!DELETABLE_STATUSES.includes(row.status as (typeof DELETABLE_STATUSES)[number])) {
    return c.json({ error: 'estado_no_borrable', status: row.status }, 409);
  }

  const marcas = DELETABLE_STATUSES.map(() => '?').join(', ');
  const marcada = await c.env.DB.prepare(
    `UPDATE custom_prints SET status = 'borrado', updated_at = datetime('now')
      WHERE id = ? AND status IN (${marcas}) RETURNING *`,
  )
    .bind(id, ...DELETABLE_STATUSES)
    .first<CustomPrintRow>();
  if (!marcada) return c.json({ error: 'borrado_concurrente' }, 409);

  try {
    // El preview se borra siempre por su clave determinista: la bandera
    // `preview` pudo quedar en 0 tras un re-rebanado fallido y el PNG del
    // modelo del cliente seguiría en R2.
    await c.env.STL_BUCKET.delete(marcada.r2_key);
    await c.env.STL_BUCKET.delete(previewKey(id));
  } catch {
    return c.json({ error: 'limpieza_pendiente' }, 503);
  }

  // Los trabajos de impresión de la pieza se van con ella: apuntan a esta fila
  // por clave foránea, así que sin borrarlos primero el DELETE falla y la
  // pieza se queda en 'borrado' para siempre, ya sin sus archivos. Se van en
  // el mismo batch para no dejar el borrado a medias.
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM print_jobs WHERE custom_print_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM custom_prints WHERE id = ?').bind(id),
  ]);
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
