// El configurador (src/config/lamps.ts) es la única fuente de verdad de
// modelos y colores; el bundler de wrangler lo incluye desde fuera del worker.
import { COLORS, MODELS } from '../../../../src/config/lamps';

export interface LampConfig {
  model: string;
  pantalla: string;
  tapa: string;
}

const MODEL_IDS = new Set(MODELS.map((m) => m.id));
const COLOR_IDS = new Set(COLORS.map((c) => c.id));
// El cuerpo de la lámpara siempre es blanco: es un color válido de bobina
// aunque no sea seleccionable en el configurador.
const SPOOL_COLOR_IDS = new Set([...COLOR_IDS, 'blanco']);

// Color que puede cargarse en una ranura del AMS ('blanco' + los 6 del catálogo).
export function isSpoolColor(id: unknown): id is string {
  return typeof id === 'string' && SPOOL_COLOR_IDS.has(id);
}

export function validateLampConfig(raw: unknown): LampConfig | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { model, pantalla, tapa } = raw as Record<string, unknown>;
  if (typeof model !== 'string' || !MODEL_IDS.has(model)) return null;
  if (typeof pantalla !== 'string' || !COLOR_IDS.has(pantalla)) return null;
  if (typeof tapa !== 'string' || !COLOR_IDS.has(tapa)) return null;
  return { model, pantalla, tapa };
}

// «Lámpara Tessera — pantalla azul · tapa rojo», para el checkout y los avisos.
export function lampLabel(config: LampConfig): string {
  const model = MODELS.find((m) => m.id === config.model)!;
  const pantalla = COLORS.find((c) => c.id === config.pantalla)!;
  const tapa = COLORS.find((c) => c.id === config.tapa)!;
  return `Lámpara ${model.label} — pantalla ${pantalla.label.toLowerCase()} · tapa ${tapa.label.toLowerCase()}`;
}
