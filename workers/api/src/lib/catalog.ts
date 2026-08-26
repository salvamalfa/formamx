// El configurador (src/config/lamps.ts) es la única fuente de verdad de
// modelos y colores; el bundler de wrangler lo incluye desde fuera del worker.
import { COLORS, MODELS } from '../../../../src/config/lamps';
import { FAMILIAS, familiaDeHex } from '../../../../src/config/colores';

export interface LampConfig {
  model: string;
  pantalla: string;
  tapa: string;
}

const MODEL_IDS = new Set(MODELS.map((m) => m.id));
const COLOR_IDS = new Set(COLORS.map((c) => c.id));
// Un filamento no está limitado a los colores del configurador: el cuerpo de
// la lámpara es blanco, y en la repisa hay gris y negro que ninguna lámpara
// usa. Las 9 familias viven en src/config/colores.ts.
const SPOOL_COLOR_IDS = new Set(FAMILIAS.map((c) => c.id));

// Color que puede cargarse en una ranura del AMS (las 9 familias de bobina).
export function isSpoolColor(id: unknown): id is string {
  return typeof id === 'string' && SPOOL_COLOR_IDS.has(id);
}

// Materiales que maneja el taller. El material de la ranura decide qué
// archivo rebanado usa el agente (p. ej. tessera.petg.gcode.3mf).
export const SPOOL_MATERIALS = new Set(['PLA', 'PETG']);

export function isSpoolMaterial(m: unknown): m is string {
  return typeof m === 'string' && SPOOL_MATERIALS.has(m);
}

// Empareja el color hex que reporta la impresora (tray_color, RGBA) con la
// familia de color más cercana. Devuelve null si no se parece a ninguna: esa
// ranura se corrige a mano en /taller. La lógica vive en src/config/colores.ts
// para que el sitio y el worker decidan exactamente lo mismo — el vínculo
// AMS↔almacén depende de que ambos lados coincidan.
export {
  familiaDeBobina,
  familiaDeHex,
  familiaDeRanura,
  mismaFamilia,
  normalizeHex,
} from '../../../../src/config/colores';

export function nearestCatalogColor(trayColorHex: unknown): string | null {
  return familiaDeHex(trayColorHex);
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
