import { BLANCO, COLORS } from '../../../config/lamps';

// Colores que puede traer una bobina: blanco (cuerpo) + los 6 del catálogo.
export const SPOOL_COLORS = [BLANCO, ...COLORS];

export const colorLabel = (id: string | null) =>
  id ? (SPOOL_COLORS.find((c) => c.id === id)?.label ?? id) : 'vacío';

export const colorSwatch = (id: string) =>
  SPOOL_COLORS.find((c) => c.id === id)?.swatch ?? '#ccc';

function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6,8}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// Nombre común para un hex de bobina que no empató con ningún color del
// catálogo (p. ej. el AMS reporta un gris que no es exactamente el blanco del
// catálogo). No intenta precisión: un gris claro, medio u oscuro dicen todos
// "Gris" — el matiz exacto ya está a la vista en el hex de al lado.
export function nearestColorName(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb;
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  const lightness = (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
  if (chroma < 40) {
    if (lightness > 225) return 'Blanco';
    if (lightness < 40) return 'Negro';
    return 'Gris';
  }
  let best = SPOOL_COLORS[0];
  let bestDist = Infinity;
  for (const c of SPOOL_COLORS) {
    const crgb = hexToRgb(c.swatch);
    if (!crgb) continue;
    const d = Math.hypot(r - crgb[0], g - crgb[1], b - crgb[2]);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best.label;
}
