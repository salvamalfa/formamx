// El configurador (src/config/lamps.ts) es la única fuente de verdad de
// modelos y colores; el bundler de wrangler lo incluye desde fuera del worker.
import { BLANCO, COLORS, MODELS } from '../../../../src/config/lamps';

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

// Materiales que maneja el taller. El material de la ranura decide qué
// archivo rebanado usa el agente (p. ej. tessera.petg.gcode.3mf).
export const SPOOL_MATERIALS = new Set(['PLA', 'PETG']);

export function isSpoolMaterial(m: unknown): m is string {
  return typeof m === 'string' && SPOOL_MATERIALS.has(m);
}

// Empareja el color hex que reporta la impresora (tray_color, RGBA) con el
// color del catálogo más cercano. Devuelve null si no se parece a ninguno
// (p. ej. un filamento negro): esa ranura se corrige a mano en /taller.
const SWATCHES: Array<{ id: string; rgb: [number, number, number] }> = [
  { id: BLANCO.id, rgb: hexToRgb(BLANCO.swatch) },
  ...COLORS.map((c) => ({ id: c.id, rgb: hexToRgb(c.swatch) })),
];

const MATCH_THRESHOLD = 170;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function nearestCatalogColor(trayColorHex: unknown): string | null {
  if (typeof trayColorHex !== 'string') return null;
  const h = trayColorHex.replace('#', '');
  if (!/^[0-9a-fA-F]{6,8}$/.test(h)) return null;
  const [r, g, b] = hexToRgb(h);

  let best: string | null = null;
  let bestDist = Infinity;
  for (const s of SWATCHES) {
    const d = Math.hypot(r - s.rgb[0], g - s.rgb[1], b - s.rgb[2]);
    if (d < bestDist) {
      bestDist = d;
      best = s.id;
    }
  }
  return bestDist <= MATCH_THRESHOLD ? best : null;
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
