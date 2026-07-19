import { Hono } from 'hono';
import type { AppContext } from '../../env';
import { getResumen } from '../../lib/resumen';

// Agregados del dashboard /taller (vista Resumen). Ruta delgada: toda la
// lógica vive en lib/resumen.ts. El bearer se aplica en routes/admin/index.ts.
export const resumen = new Hono<AppContext>();

resumen.get('/', async (c) => {
  return c.json(await getResumen(c.env.DB));
});
