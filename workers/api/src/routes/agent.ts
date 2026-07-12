import { Hono } from 'hono';
import type { AppContext } from '../env';
import { bearer } from '../lib/auth';
import { isSpoolMaterial, nearestCatalogColor } from '../lib/catalog';
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

  const { results: spools } = await c.env.DB.prepare(
    'SELECT slot, color_id, material, color_hex FROM spool_slots ORDER BY slot',
  ).all<{ slot: number; color_id: string | null; material: string | null; color_hex: string | null }>();

  return c.json({ job: shapeJob(job), spools });
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
