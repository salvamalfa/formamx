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
// agente (POST /api/agent/ams). Solo lectura: el AMS dicta el estado de la app.
impresora.get('/spools', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT slot, color_id, material, color_hex FROM spool_slots ORDER BY slot',
  ).all<{ slot: number; color_id: string | null; material: string | null; color_hex: string | null }>();
  return c.json({ slots: results });
});
