import { Hono } from 'hono';
import type { AppContext } from '../env';
import { bearer } from '../lib/auth';
import { isSpoolMaterial, nearestCatalogColor } from '../lib/catalog';
import {
  previewKey,
  shapeCustomPrint,
  SLICE_STALE_MINUTES,
  type CustomPrintRow,
} from '../lib/custom_prints';
import { shapeJob, STALE_CLAIM_MINUTES, type PrintJobRow } from '../lib/jobs';
import { notify } from '../lib/ntfy';

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

// El hex viene de la impresora como RGBA (8 dígitos) o RGB (6); se normaliza
// a '#RRGGBB' para mostrarlo tal cual en el panel.
function normalizeHex(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const h = raw.replace('#', '');
  if (!/^[0-9a-fA-F]{6,8}$/.test(h)) return null;
  return `#${h.slice(0, 6).toUpperCase()}`;
}

// El agente reporta lo que la impresora dice tener cargado en el AMS
// (tray_type y tray_color de cada ranura). El color hex se empareja con el
// catálogo; si no se parece a ninguno queda sin asignar y se corrige a mano.
agent.post('/ams', async (c) => {
  const body = await c.req
    .json<{ slots?: Array<{ slot: number; material?: string | null; color_hex?: string | null }> }>()
    .catch(() => ({}) as { slots?: [] });
  if (!Array.isArray(body.slots)) return c.json({ error: 'slots_requerido' }, 400);

  const updates = body.slots
    .filter((s) => typeof s.slot === 'number' && s.slot >= 0 && s.slot <= 3)
    .map((s) => ({
      slot: s.slot,
      color_id: nearestCatalogColor(s.color_hex),
      color_hex: normalizeHex(s.color_hex),
      material: isSpoolMaterial(s.material) ? s.material : null,
    }));

  await c.env.DB.batch([
    ...updates.map((s) =>
      c.env.DB.prepare(
        "UPDATE spool_slots SET color_id = ?, color_hex = ?, material = ?, updated_at = datetime('now') WHERE slot = ?",
      ).bind(s.color_id, s.color_hex, s.material, s.slot),
    ),
    c.env.DB.prepare(
      "UPDATE printer_flags SET ams_synced_at = datetime('now') WHERE id = 1",
    ),
  ]);

  return c.json({ slots: updates });
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

  await c.env.DB.prepare(
    `UPDATE print_jobs SET status = ?, progress_pct = ?, message = ?, updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(
      next,
      typeof body.progress_pct === 'number'
        ? Math.min(100, Math.max(0, Math.round(body.progress_pct)))
        : job.progress_pct,
      body.message ?? job.message,
      id,
    )
    .run();

  if (body.bed_dirty && (next === 'done' || next === 'failed')) {
    await c.env.DB.prepare(
      "UPDATE printer_flags SET bed_clear = 0, updated_at = datetime('now') WHERE id = 1",
    ).run();
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
      // Terminada la pieza, el STL del cliente y su vista previa ya cumplieron
      // su propósito: se limpian de R2 y solo queda el metadato para el
      // histórico. Best effort (no bloquea la respuesta al agente); si falla,
      // el botón Borrar del histórico reintenta la limpieza más tarde.
      if (marcada) {
        const customPrintId = job.custom_print_id;
        c.executionCtx.waitUntil(
          (async () => {
            try {
              await c.env.STL_BUCKET.delete(marcada.r2_key);
              await c.env.STL_BUCKET.delete(previewKey(customPrintId));
              await c.env.DB.prepare(
                "UPDATE custom_prints SET preview = 0 WHERE id = ?",
              )
                .bind(customPrintId)
                .run();
            } catch {
              /* limpieza best effort; el borrado manual reintenta */
            }
          })(),
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

// El STL crudo, para que el agente lo rebane. Va por el bearer del agente:
// nada de URLs firmadas ni llaves S3 que rotar.
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
