import { Hono } from 'hono';
import type { AppContext } from '../../env';

export const impresora = new Hono<AppContext>();

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
