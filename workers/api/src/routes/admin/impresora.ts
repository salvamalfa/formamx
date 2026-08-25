import { Hono } from 'hono';
import type { AppContext } from '../../env';
import { shapeJob, type PrintJobRow } from '../../lib/jobs';

export const impresora = new Hono<AppContext>();

// La cola de la impresora, COMPLETA: un trabajo puede venir de un pedido de
// lámpara (order_id) o de una pieza STL de cliente (custom_print_id), y la
// impresora no distingue — es una sola cola física. El tablero la leía
// armándola desde los pedidos, así que las piezas de cliente eran invisibles
// ahí; por eso vive aquí y no colgada de /orders.
// Devuelve solo lo vivo (en cola, reclamado, imprimiendo) en el orden en que
// entró, más el nombre del STL cuando el trabajo es de un cliente: la etiqueta
// la arma el sitio, aquí solo van los datos.
impresora.get('/jobs', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT pj.*, cp.file_name AS custom_file_name
       FROM print_jobs pj
       LEFT JOIN custom_prints cp ON cp.id = pj.custom_print_id
      WHERE pj.status IN ('queued', 'claimed', 'printing')
      ORDER BY pj.created_at`,
  ).all<PrintJobRow & { custom_file_name: string | null }>();
  return c.json({
    jobs: results.map((row) => ({
      ...shapeJob(row),
      custom_file_name: row.custom_file_name,
    })),
  });
});

// Estado físico de la impresora: candado de cama + última lectura del AMS.
impresora.get('/printer', async (c) => {
  const flags = await c.env.DB.prepare(
    'SELECT bed_clear, ams_synced_at FROM printer_flags WHERE id = 1',
  ).first<{ bed_clear: number; ams_synced_at: string | null }>();
  return c.json({
    bed_clear: Boolean(flags?.bed_clear ?? 1),
    ams_synced_at: flags?.ams_synced_at ?? null,
  });
});

// El taller confirma que retiró la pieza: el agente vuelve a recibir trabajos.
impresora.post('/printer/bed-clear', async (c) => {
  await c.env.DB.prepare(
    "UPDATE printer_flags SET bed_clear = 1, updated_at = datetime('now') WHERE id = 1",
  ).run();
  return c.json({ bed_clear: true });
});

// Estado de las 4 ranuras del AMS, tal como lo reporta la impresora vía el
// agente (POST /api/agent/ams), más la bobina de almacén que Salva vinculó a
// mano a cada ranura (0019) — de ahí sale el peso restante real en vez de la
// heurística por color+material.
impresora.get('/spools', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT s.slot, s.color_id, s.material, s.color_hex, s.bobina_id,
            b.weight_g AS bobina_weight_g, b.weight_left_g AS bobina_weight_left_g
       FROM spool_slots s
       LEFT JOIN bobinas b ON b.id = s.bobina_id
      ORDER BY s.slot`,
  ).all<{
    slot: number;
    color_id: string | null;
    material: string | null;
    color_hex: string | null;
    bobina_id: string | null;
    bobina_weight_g: number | null;
    bobina_weight_left_g: number | null;
  }>();
  return c.json({ slots: results });
});

// Vincula (o desvincula con bobina_id: null) una ranura del AMS a una bobina
// del almacén. Sin esto, spool_slots.bobina_id se queda NULL para siempre y
// el panel sigue sin datos de peso — es una decisión explícita de Salva, no
// algo que el sistema deba adivinar por color.
impresora.patch('/spools/:slot', async (c) => {
  const slot = Number(c.req.param('slot'));
  if (!Number.isInteger(slot) || slot < 0 || slot > 3) {
    return c.json({ error: 'ranura_invalida' }, 400);
  }
  const body = await c.req
    .json<{ bobina_id?: string | null }>()
    .catch(() => ({}) as { bobina_id?: string | null });
  const bobinaId = body.bobina_id ?? null;

  if (bobinaId !== null) {
    const bobina = await c.env.DB.prepare('SELECT id FROM bobinas WHERE id = ?')
      .bind(bobinaId)
      .first<{ id: string }>();
    if (!bobina) return c.json({ error: 'bobina_no_existe' }, 400);
  }

  await c.env.DB.prepare(
    "UPDATE spool_slots SET bobina_id = ?, updated_at = datetime('now') WHERE slot = ?",
  )
    .bind(bobinaId, slot)
    .run();
  return c.json({ slot, bobina_id: bobinaId });
});
