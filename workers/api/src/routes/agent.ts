import { Hono } from 'hono';
import type { AppContext } from '../env';
import { normalizeUuid, remapBobinas, type RanuraPrevia } from '../lib/ams';
import { bearer } from '../lib/auth';
import { isSpoolMaterial, nearestCatalogColor, normalizeHex } from '../lib/catalog';
import { syncBobinaEstados } from '../lib/inventario';
import {
  previewKey,
  purgeCustomPrintFiles,
  shapeCustomPrint,
  SLICE_STALE_MINUTES,
  type CustomPrintRow,
} from '../lib/custom_prints';
import { shapeJob, STALE_CLAIM_MINUTES, STALE_PRINTING_MINUTES, type PrintJobRow } from '../lib/jobs';
import { notify } from '../lib/ntfy';
import { computeCostBreakdown, computeSuggestedPrice, type PricingConfigRow } from '../lib/pricing';

// API del agente de impresión (la PC junto a la Bambu). Polling: el agente
// reclama un trabajo, lo imprime y reporta progreso/desenlace.
export const agent = new Hono<AppContext>();

agent.use('*', bearer('AGENT_TOKEN'));

// Reclama el siguiente trabajo en cola (atómico vía UPDATE...RETURNING).
// Devuelve también las bobinas actuales para que el agente calcule el
// ams_mapping con datos frescos. 204 = nada pendiente.
agent.get('/jobs/next', async (c) => {
  // Candado de cama: tras una impresión, no se entrega NADA hasta que el
  // taller confirme en /taller que retiró la pieza.
  const flags = await c.env.DB.prepare('SELECT bed_clear FROM printer_flags WHERE id = 1').first<{
    bed_clear: number;
  }>();
  if (flags && !flags.bed_clear) return c.body(null, 204);

  // Reencola claims abandonados antes de reclamar.
  await c.env.DB.prepare(
    `UPDATE print_jobs SET status = 'queued', claimed_at = NULL, updated_at = datetime('now')
     WHERE status = 'claimed' AND claimed_at < datetime('now', ?)`,
  )
    .bind(`-${STALE_CLAIM_MINUTES} minutes`)
    .run();

  await failStalePrintingJobs(c.env.DB);

  const job = await c.env.DB.prepare(
    `UPDATE print_jobs
     SET status = 'claimed', claimed_at = datetime('now'), updated_at = datetime('now')
     WHERE id = (SELECT id FROM print_jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1)
     RETURNING *`,
  ).first<PrintJobRow>();
  if (!job) return c.body(null, 204);

  // Una pieza de cliente ya se rebanó para un material concreto, así que el
  // trabajo lo lleva: sin esto el agente elegiría la ranura de número menor
  // con ese color y, si tiene otro material, buscaría un 3MF que no existe.
  const material = job.custom_print_id
    ? (
        await c.env.DB.prepare('SELECT material FROM custom_prints WHERE id = ?')
          .bind(job.custom_print_id)
          .first<{ material: string | null }>()
      )?.material ?? null
    : null;

  const { results: spools } = await c.env.DB.prepare(
    'SELECT slot, color_id, material, color_hex FROM spool_slots ORDER BY slot',
  ).all<{ slot: number; color_id: string | null; material: string | null; color_hex: string | null }>();

  return c.json({ job: { ...shapeJob(job), material }, spools });
});

// Descuenta est_grams de la bobina que quedó FIJADA en custom_prints.bobina_id
// al calcular el precio (computeAndSavePricing, en slice-result) — no vuelve
// a buscar por material+color aquí. Antes cada función (precio y descuento)
// hacía su propio emparejamiento por separado; si el AMS cambiaba entre el
// rebanado y el fin de la impresión, o dos ranuras compartían material+color,
// el costo calculado y el gramaje descontado podían salir de bobinas
// distintas (hallazgo de revisión, PR de la Fase 3e). Sin bobina fijada o sin
// est_grams, no descuenta nada: el peso a mano sigue siendo la corrección de
// respaldo (nunca se auto-agota por debajo de 0).
async function deductBobinaGrams(db: D1Database, customPrintId: string): Promise<void> {
  const print = await db
    .prepare('SELECT bobina_id, est_grams FROM custom_prints WHERE id = ?')
    .bind(customPrintId)
    .first<{ bobina_id: string | null; est_grams: number | null }>();
  if (!print || !print.bobina_id || !print.est_grams) return;

  await db
    .prepare(
      `UPDATE bobinas SET weight_left_g = MAX(0, weight_left_g - ?), updated_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(print.est_grams, print.bobina_id)
    .run();
}

const STALE_PRINTING_MESSAGE =
  'el agente perdió la conexión con este trabajo (sin reportes desde hace ' +
  `más de ${STALE_PRINTING_MINUTES} min); revisa la impresora y reintenta desde /taller`;

// Job fantasma: quedó en 'printing' sin un solo reporte de progreso en más de
// STALE_PRINTING_MINUTES. Pasa igual que un fallo normal del agente (ver
// AGENT_TRANSITIONS más abajo): si es una pieza de cliente, custom_prints
// vuelve a 'listo' para poder reintentar sin rebanar de nuevo.
async function failStalePrintingJobs(db: D1Database): Promise<void> {
  const { results: stale } = await db
    .prepare(
      `SELECT id, custom_print_id FROM print_jobs
       WHERE status = 'printing' AND updated_at < datetime('now', ?)`,
    )
    .bind(`-${STALE_PRINTING_MINUTES} minutes`)
    .all<{ id: string; custom_print_id: string | null }>();
  if (stale.length === 0) return;

  await db.batch([
    db
      .prepare(
        `UPDATE print_jobs SET status = 'failed', message = ?, updated_at = datetime('now')
         WHERE status = 'printing' AND updated_at < datetime('now', ?)`,
      )
      .bind(STALE_PRINTING_MESSAGE, `-${STALE_PRINTING_MINUTES} minutes`),
    ...stale
      .filter((j) => j.custom_print_id)
      .map((j) =>
        db
          .prepare(
            `UPDATE custom_prints SET status = 'listo', message = ?, updated_at = datetime('now')
             WHERE id = ? AND status = 'imprimiendo'`,
          )
          .bind(STALE_PRINTING_MESSAGE, j.custom_print_id),
      ),
  ]);
}

// El agente reporta lo que la impresora dice tener cargado en el AMS
// (tray_type, tray_color y, si la bobina trae RFID, tray_uuid de cada ranura).
// El color hex se empareja con una familia del catálogo; si no se parece a
// ninguna queda sin asignar y se corrige a mano.
//
// Además de refrescar el contenido, esta lectura MUEVE el vínculo con el
// almacén: si Salva cambió una bobina de ranura, bobina_id se va con ella en
// vez de quedarse pegado al número de ranura descontando gramos de la bobina
// equivocada (ver lib/ams.ts para las reglas y sus casos ambiguos).
agent.post('/ams', async (c) => {
  const body = await c.req
    .json<{
      slots?: Array<{
        slot: number;
        material?: string | null;
        color_hex?: string | null;
        tray_uuid?: string | null;
      }>;
    }>()
    .catch(() => ({}) as { slots?: [] });
  if (!Array.isArray(body.slots)) return c.json({ error: 'slots_requerido' }, 400);

  const updates = body.slots
    .filter((s) => typeof s.slot === 'number' && s.slot >= 0 && s.slot <= 3)
    .map((s) => ({
      slot: s.slot,
      color_id: nearestCatalogColor(s.color_hex),
      color_hex: normalizeHex(s.color_hex),
      material: isSpoolMaterial(s.material) ? s.material : null,
      tray_uuid: normalizeUuid(s.tray_uuid),
    }));

  // Solo se leen las ranuras que este reporte va a tocar: una lectura parcial
  // no debe soltar el vínculo de una ranura de la que no se dijo nada.
  const slots = updates.map((s) => s.slot);
  const { results: previas } = await c.env.DB.prepare(
    `SELECT slot, material, color_hex, tray_uuid, bobina_id
       FROM spool_slots WHERE slot IN (${slots.map(() => '?').join(',') || 'NULL'})`,
  )
    .bind(...slots)
    .all<RanuraPrevia>();

  const destino = remapBobinas(previas, updates);

  await c.env.DB.batch([
    ...updates.map((s) =>
      c.env.DB.prepare(
        `UPDATE spool_slots
            SET color_id = ?, color_hex = ?, material = ?, tray_uuid = ?, bobina_id = ?,
                updated_at = datetime('now')
          WHERE slot = ?`,
      ).bind(
        s.color_id,
        s.color_hex,
        s.material,
        s.tray_uuid,
        destino.get(s.slot) ?? null,
        s.slot,
      ),
    ),
    c.env.DB.prepare("UPDATE printer_flags SET ams_synced_at = datetime('now') WHERE id = 1"),
  ]);

  // en_uso sigue al AMS: toda bobina que queda vinculada a una ranura pasa a
  // en_uso, y la que se soltó (el AMS ya no la reporta en ningún lado) vuelve
  // a nueva.
  await syncBobinaEstados(c.env.DB);

  return c.json({
    slots: updates.map((s) => ({ ...s, bobina_id: destino.get(s.slot) ?? null })),
  });
});

// Transiciones que puede reportar el agente. `printing` repetido actualiza
// el progreso; los desenlaces son terminales para el trabajo.
const AGENT_TRANSITIONS: Record<string, string[]> = {
  claimed: ['printing', 'failed'],
  printing: ['printing', 'done', 'failed'],
};

interface StatusBody {
  status?: string;
  progress_pct?: number;
  message?: string;
  // true cuando la impresión llegó a tocar la cama (terminada o fallida a
  // medias): activa el candado hasta que el taller confirme que la despejó.
  bed_dirty?: boolean;
  // El agente en modo ensayo (DryPrinter, sin impresora real) manda esto en
  // 'printing'/'done'/'failed': no hubo impresión física, así que no debe
  // sumar horas de máquina ni descontar gramos de ninguna bobina — solo eso.
  // El resto del reporte (status, notificaciones) se procesa igual, porque el
  // ensayo existe justo para probar ese flujo de punta a punta.
  dry_run?: boolean;
}

agent.post('/jobs/:id/status', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<StatusBody>().catch(() => ({}) as StatusBody);
  const next = body.status;
  if (!next || !['printing', 'done', 'failed'].includes(next)) {
    return c.json({ error: 'status_invalido' }, 400);
  }

  const job = await c.env.DB.prepare('SELECT * FROM print_jobs WHERE id = ?')
    .bind(id)
    .first<PrintJobRow>();
  if (!job) return c.json({ error: 'no_existe' }, 404);
  if (!(AGENT_TRANSITIONS[job.status] ?? []).includes(next)) {
    return c.json({ error: 'transicion_invalida', from: job.status, to: next }, 409);
  }

  // printing_started_at se llena UNA sola vez, en el primer claimed→printing
  // (no en cada reporte repetido de progreso): es el ancla para medir la
  // duración real de esta impresión (0021, amortización dinámica).
  const empiezaAImprimir = next === 'printing' && job.status === 'claimed';

  await c.env.DB.prepare(
    `UPDATE print_jobs SET status = ?, progress_pct = ?, message = ?,
       printing_started_at = CASE WHEN ? THEN datetime('now') ELSE printing_started_at END,
       updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(
      next,
      typeof body.progress_pct === 'number'
        ? Math.min(100, Math.max(0, Math.round(body.progress_pct)))
        : job.progress_pct,
      body.message ?? job.message,
      empiezaAImprimir ? 1 : 0,
      id,
    )
    .run();

  if (body.bed_dirty && (next === 'done' || next === 'failed')) {
    await c.env.DB.prepare(
      "UPDATE printer_flags SET bed_clear = 0, updated_at = datetime('now') WHERE id = 1",
    ).run();
  }

  // Desenlace: suma la duración real de esta impresión a las horas
  // acumuladas de la impresora (amortización dinámica) y, si es una pieza de
  // cliente, descuenta su material de la bobina vinculada a la ranura que lo
  // trae puesto (0019). Ninguna de las dos bloquea la respuesta al agente si
  // falta el dato (job viejo sin printing_started_at, ranura sin bobina
  // vinculada): mejor un costo/horas ligeramente desalineado que un job que
  // no puede reportar su desenlace. dry_run (DryPrinter, sin impresora real)
  // se salta esto por completo: nada de eso ocurrió de verdad.
  if (!body.dry_run && (next === 'done' || next === 'failed') && job.status === 'printing') {
    if (job.printing_started_at) {
      c.executionCtx.waitUntil(
        c.env.DB.prepare(
          `UPDATE printer_flags SET
             total_print_seconds = total_print_seconds +
               CAST((julianday('now') - julianday(?)) * 86400 AS INTEGER),
             updated_at = datetime('now')
           WHERE id = 1`,
        )
          .bind(job.printing_started_at)
          .run()
          .then(() => {}),
      );
    }
    if (job.custom_print_id) {
      c.executionCtx.waitUntil(deductBobinaGrams(c.env.DB, job.custom_print_id).then(() => {}));
    }
  }

  // Una pieza de cliente no tiene pedido: su espejo es la fila de
  // custom_prints. Los UPDATE van guardados por estado para no pisar una
  // cancelación ni un reporte repetido.
  if (job.custom_print_id) {
    if (next === 'done') {
      const marcada = await c.env.DB.prepare(
        `UPDATE custom_prints SET status = 'terminado', updated_at = datetime('now')
         WHERE id = ? AND status = 'imprimiendo' RETURNING r2_key`,
      )
        .bind(job.custom_print_id)
        .first<{ r2_key: string }>();
      // Terminada la pieza, el STL del cliente ya cumplió su propósito: se
      // limpia de R2 (la vista previa se queda para el histórico). No bloquea
      // la respuesta al agente, y si R2 falla la fila se queda con
      // files_deleted = 0: el listado del tablero lo reintenta, así que un
      // fallo transitorio no deja el archivo del cliente guardado para
      // siempre en silencio.
      if (marcada) {
        c.executionCtx.waitUntil(
          purgeCustomPrintFiles(
            c.env.STL_BUCKET,
            c.env.DB,
            job.custom_print_id,
            marcada.r2_key,
          ).then(() => {}),
        );
      }
      c.executionCtx.waitUntil(
        notify(
          c.env.NTFY_TOPIC,
          'forma: pieza de cliente lista',
          `Salió de la impresora.${
            body.bed_dirty ? ' Retírala de la cama y confirma en /taller para continuar.' : ''
          }`,
        ),
      );
    } else if (next === 'failed') {
      // Vuelve a 'listo', no a 'fallido': el .gcode.3mf sigue existiendo, así
      // que se puede reintentar la impresión sin volver a rebanar.
      await c.env.DB.prepare(
        `UPDATE custom_prints SET status = 'listo', message = ?, updated_at = datetime('now')
         WHERE id = ? AND status = 'imprimiendo'`,
      )
        .bind(body.message ?? 'falló la impresión', job.custom_print_id)
        .run();
      c.executionCtx.waitUntil(
        notify(
          c.env.NTFY_TOPIC,
          'forma: fallo de impresion',
          `Pieza de cliente: ${body.message ?? 'sin detalle'}. Reintenta desde /taller.`,
        ),
      );
    }
    const updatedJob = await c.env.DB.prepare('SELECT * FROM print_jobs WHERE id = ?')
      .bind(id)
      .first<PrintJobRow>();
    return c.json(shapeJob(updatedJob!));
  }

  // Efectos sobre el pedido y avisos al taller.
  const label = job.part;
  if (next === 'printing' && job.status === 'claimed') {
    // Primera pieza que empieza: el pedido pasa a imprimiendo (guardado).
    const moved = await c.env.DB.prepare(
      `UPDATE orders SET status = 'imprimiendo', updated_at = datetime('now')
       WHERE id = ? AND status = 'en_cola'`,
    )
      .bind(job.order_id)
      .run();
    if (moved.meta.changes) {
      c.executionCtx.waitUntil(
        notify(c.env.NTFY_TOPIC, 'forma: imprimiendo', `Pedido ${job.order_id}: empezó la ${label}.`),
      );
    }
  } else if (next === 'done') {
    const pending = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM print_jobs WHERE order_id = ? AND status NOT IN ('done', 'canceled')`,
    )
      .bind(job.order_id)
      .first<{ n: number }>();
    const confirma = body.bed_dirty
      ? ' Retira la pieza de la cama y confirma en /taller para continuar.'
      : '';
    if (pending && pending.n === 0) {
      // Todas las piezas listas. El pedido se queda en imprimiendo: pasarlo a
      // `lista` es gate humano (inspección) desde /taller.
      c.executionCtx.waitUntil(
        notify(
          c.env.NTFY_TOPIC,
          'forma: salio de la impresora',
          `Pedido ${job.order_id}: todas las piezas están listas. Revísalas y márcalo Lista en /taller.${confirma}`,
        ),
      );
    } else {
      c.executionCtx.waitUntil(
        notify(
          c.env.NTFY_TOPIC,
          'forma: pieza terminada',
          `Pedido ${job.order_id}: ${label} lista.${confirma}`,
        ),
      );
    }
  } else if (next === 'failed') {
    c.executionCtx.waitUntil(
      notify(
        c.env.NTFY_TOPIC,
        'forma: fallo de impresion',
        `Pedido ${job.order_id} (${label}): ${body.message ?? 'sin detalle'}. Reintenta desde /taller.`,
      ),
    );
  }

  const updated = await c.env.DB.prepare('SELECT * FROM print_jobs WHERE id = ?')
    .bind(id)
    .first<PrintJobRow>();
  return c.json(shapeJob(updated!));
});

// ---- Rebanado de STL de clientes -------------------------------------------
// El agente corre el CLI de Bambu Studio en la PC de Salva: reclama una
// pieza, se baja el STL, lo rebana y reporta el resultado. Detalle y receta
// del CLI en docs/STL_CLIENTES.md.

// Reclama la siguiente pieza por rebanar (mismo claim atómico que los
// trabajos de impresión). SIN candado de cama: rebanar no toca la impresora,
// así que se puede preparar trabajo mientras hay una pieza en la cama.
agent.get('/custom-prints/next', async (c) => {
  await c.env.DB.prepare(
    `UPDATE custom_prints SET status = 'en_cola', claimed_at = NULL, updated_at = datetime('now')
     WHERE status = 'rebanando' AND claimed_at < datetime('now', ?)`,
  )
    .bind(`-${SLICE_STALE_MINUTES} minutes`)
    .run();

  const print = await c.env.DB.prepare(
    `UPDATE custom_prints
     SET status = 'rebanando', claimed_at = datetime('now'), updated_at = datetime('now')
     WHERE id = (SELECT id FROM custom_prints WHERE status = 'en_cola' ORDER BY updated_at LIMIT 1)
     RETURNING *`,
  ).first<CustomPrintRow>();
  if (!print) return c.body(null, 204);

  return c.json({ print: shapeCustomPrint(print) });
});

// El STL o el proyecto 3MF crudo, para que el agente lo rebane (sirve lo que
// diga r2_key, sea cual sea el formato). Va por el bearer del agente: nada de
// URLs firmadas ni llaves S3 que rotar.
agent.get('/custom-prints/:id/stl', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT r2_key FROM custom_prints WHERE id = ?')
    .bind(id)
    .first<{ r2_key: string }>();
  if (!row) return c.json({ error: 'no_existe' }, 404);

  const obj = await c.env.STL_BUCKET.get(row.r2_key);
  if (!obj) return c.json({ error: 'archivo_no_existe' }, 404);
  return c.body(obj.body, 200, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(obj.size),
  });
});

interface SliceResultBody {
  ok?: boolean;
  seconds?: number;
  grams?: number;
  message?: string;
}

// Costo/precio sugeridos (Fase 3e): se calculan en cuanto el rebanado da
// gramos/tiempo reales, igual que est_seconds/est_grams se guardan como
// snapshot. Best effort — si algo falla (config sin fila, lo que sea), la
// pieza se queda con cost_mxn/price_mxn en NULL y el desglose en /taller lo
// muestra vacío en vez de romper el rebanado.
async function computeAndSavePricing(
  db: D1Database,
  customPrintId: string,
  material: string | null,
  colorId: string | null,
  gramos: number,
  segundos: number,
): Promise<void> {
  const config = await db
    .prepare('SELECT * FROM pricing_config WHERE id = 1')
    .first<PricingConfigRow>();
  if (!config) return;

  const flags = await db
    .prepare('SELECT total_print_seconds FROM printer_flags WHERE id = 1')
    .first<{ total_print_seconds: number }>();

  let bobina: { id: string; cost_mxn: number | null; weight_g: number } | null = null;
  if (material && colorId) {
    bobina = await db
      .prepare(
        `SELECT b.id, b.cost_mxn, b.weight_g FROM spool_slots s
         JOIN bobinas b ON b.id = s.bobina_id
         WHERE s.material = ? AND s.color_id = ? ORDER BY s.slot LIMIT 1`,
      )
      .bind(material, colorId)
      .first<{ id: string; cost_mxn: number | null; weight_g: number }>();
  }

  const breakdown = computeCostBreakdown(
    gramos,
    segundos,
    bobina,
    config,
    flags?.total_print_seconds ?? 0,
  );
  const price = computeSuggestedPrice(breakdown.total_mxn, config);

  // bobina_id queda FIJO aquí: el descuento de gramos al terminar la
  // impresión (deductBobinaGrams) usa este mismo valor, no vuelve a buscar
  // por material+color — así el costo calculado y lo que se descuenta
  // siempre son la misma bobina, sin importar qué cambie en el AMS después.
  await db
    .prepare(
      `UPDATE custom_prints SET cost_mxn = ?, price_mxn = ?, cost_breakdown_json = ?, bobina_id = ?
       WHERE id = ?`,
    )
    .bind(breakdown.total_mxn, price, JSON.stringify(breakdown), bobina?.id ?? null, customPrintId)
    .run();
}

// Desenlace del rebanado. Un 409 aquí es normal y el agente lo ignora: pasa
// cuando Salva canceló la pieza mientras se rebanaba.
agent.post('/custom-prints/:id/slice-result', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<SliceResultBody>().catch(() => ({}) as SliceResultBody);
  if (typeof body.ok !== 'boolean') return c.json({ error: 'ok_requerido' }, 400);

  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

  const updated = body.ok
    ? await c.env.DB.prepare(
        `UPDATE custom_prints
            SET status = 'listo', est_seconds = ?, est_grams = ?, message = NULL,
                claimed_at = NULL, updated_at = datetime('now')
          WHERE id = ? AND status = 'rebanando' RETURNING *`,
      )
        .bind(
          num(body.seconds) === null ? null : Math.round(body.seconds as number),
          num(body.grams),
          id,
        )
        .first<CustomPrintRow>()
    : await c.env.DB.prepare(
        `UPDATE custom_prints
            SET status = 'fallido', message = ?, claimed_at = NULL,
                updated_at = datetime('now')
          WHERE id = ? AND status = 'rebanando' RETURNING *`,
      )
        .bind(body.message ?? 'el rebanado falló sin detalle', id)
        .first<CustomPrintRow>();

  if (!updated) return c.json({ error: 'transicion_invalida', to: body.ok ? 'listo' : 'fallido' }, 409);

  if (body.ok && updated.est_grams != null && updated.est_seconds != null) {
    c.executionCtx.waitUntil(
      computeAndSavePricing(
        c.env.DB,
        id,
        updated.material,
        updated.color_id,
        updated.est_grams,
        updated.est_seconds,
      ),
    );
  }

  return c.json(shapeCustomPrint(updated));
});

// Imagen del plato rebanado (best effort: si el rebanador no la generó, el
// agente simplemente no la sube y /taller muestra solo los estimados).
agent.post('/custom-prints/:id/preview', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT id FROM custom_prints WHERE id = ?')
    .bind(id)
    .first<{ id: string }>();
  if (!row) return c.json({ error: 'no_existe' }, 404);
  if (!c.req.raw.body) return c.json({ error: 'archivo_vacio' }, 400);

  await c.env.STL_BUCKET.put(previewKey(id), c.req.raw.body, {
    httpMetadata: { contentType: 'image/png' },
  });
  await c.env.DB.prepare(
    "UPDATE custom_prints SET preview = 1, updated_at = datetime('now') WHERE id = ?",
  )
    .bind(id)
    .run();
  return c.json({ ok: true });
});
