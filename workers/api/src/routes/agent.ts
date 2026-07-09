import { Hono } from 'hono';
import type { AppContext } from '../env';
import { bearer } from '../lib/auth';
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
    'SELECT slot, color_id FROM spool_slots ORDER BY slot',
  ).all<{ slot: number; color_id: string | null }>();

  return c.json({ job: shapeJob(job), spools });
});

// Transiciones que puede reportar el agente. `printing` repetido actualiza
// el progreso; los desenlaces son terminales para el trabajo.
const AGENT_TRANSITIONS: Record<string, string[]> = {
  claimed: ['printing', 'failed'],
  printing: ['printing', 'done', 'failed'],
};

agent.post('/jobs/:id/status', async (c) => {
  const id = c.req.param('id');
  const body = await c.req
    .json<{ status?: string; progress_pct?: number; message?: string }>()
    .catch(() => ({}) as { status?: string; progress_pct?: number; message?: string });
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
      typeof body.progress_pct === 'number' ? Math.round(body.progress_pct) : job.progress_pct,
      body.message ?? job.message,
      id,
    )
    .run();

  // Efectos sobre el pedido y avisos al taller.
  const label = job.part === 'pantalla' ? 'pantalla' : 'cuerpo y tapa';
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
    if (pending && pending.n === 0) {
      // Ambas piezas listas. El pedido se queda en imprimiendo: pasarlo a
      // `lista` es gate humano (inspección) desde /taller.
      c.executionCtx.waitUntil(
        notify(
          c.env.NTFY_TOPIC,
          'forma: salio de la impresora',
          `Pedido ${job.order_id}: las dos piezas están listas. Revísalas y márcalo Lista en /taller.`,
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
