import { Hono } from 'hono';
import type { AppContext } from '../../env';
import type { PricingConfigRow } from '../../lib/pricing';

// Configuración de costos de la calculadora de precio (0020, Fase 3e). Una
// sola fila editable desde /taller — nada de esto vive hardcodeado en
// código, porque va a cambiar (sube la luz, cambia de impresora, etc).
export const pricing = new Hono<AppContext>();

const FIELDS = [
  'costo_kwh_mxn',
  'consumo_w',
  'costo_hora_mano_obra_mxn',
  'minutos_mano_obra_default',
  'precio_impresora_mxn',
  'vida_util_horas_estimada',
  'rep_percent',
  'margen_default_pct',
] as const;

pricing.get('/config', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM pricing_config WHERE id = 1').first<
    PricingConfigRow & { updated_at: string }
  >();
  if (!row) return c.json({ error: 'no_existe' }, 404);
  return c.json(row);
});

// Edición parcial: solo los campos que vienen en el body, todos enteros
// (centavos donde aplica, igual que bobinas.cost_mxn). Sin CHECK en D1 —
// se valida aquí.
pricing.patch('/config', async (c) => {
  const body = await c.req
    .json<Record<string, unknown>>()
    .catch(() => ({}) as Record<string, unknown>);

  const sets: string[] = [];
  const values: number[] = [];
  for (const field of FIELDS) {
    const value = body[field];
    if (value === undefined) continue;
    if (!Number.isInteger(value) || (value as number) < 0) {
      return c.json({ error: 'valor_invalido', field }, 400);
    }
    sets.push(`${field} = ?`);
    values.push(value as number);
  }
  if (sets.length === 0) {
    const row = await c.env.DB.prepare('SELECT * FROM pricing_config WHERE id = 1').first();
    return c.json(row!);
  }

  const row = await c.env.DB.prepare(
    `UPDATE pricing_config SET ${sets.join(', ')}, updated_at = datetime('now')
     WHERE id = 1 RETURNING *`,
  )
    .bind(...values)
    .first();
  return c.json(row!);
});
