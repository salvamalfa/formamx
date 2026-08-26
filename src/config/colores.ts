// Única fuente de verdad para 'de qué color es esta bobina'.
//
// Antes había dos matchers que no compartían código y se contradecían: el del
// sitio (nearestColorName) nunca devolvía null y el del worker
// (nearestCatalogColor) sí, con un umbral distinto. El vínculo AMS↔almacén
// necesita que ambos lados coincidan, así que la lógica vive aquí y los dos
// la importan — igual que lamps.ts, que el worker ya lee cruzando el límite.

import { BLANCO, COLORS, type LampColor } from './lamps';

// Familias de color que puede tener una bobina. Son las 7 del configurador
// (blanco + los 6 de la lámpara) más gris y negro: no son configurables en una
// lámpara, pero sí existen como filamento en la repisa y en el AMS — sin ellas
// una ranura gris como #757575 no tenía forma de emparejar con nada.
export const GRIS: LampColor = {
  id: 'gris',
  label: 'Gris',
  swatch: '#808080',
  file: '',
};
export const NEGRO: LampColor = {
  id: 'negro',
  label: 'Negro',
  swatch: '#1A1A18',
  file: '',
};

export const FAMILIAS: LampColor[] = [BLANCO, ...COLORS, GRIS, NEGRO];

const POR_ID = new Map(FAMILIAS.map((c) => [c.id, c]));

export const familiaLabel = (id: string | null): string =>
  id ? (POR_ID.get(id)?.label ?? id) : 'vacío';

export const familiaSwatch = (id: string | null): string =>
  (id && POR_ID.get(id)?.swatch) || '#ccc';

export function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.replace('#', '');
  // El AMS reporta RGBA (8 dígitos) además de RGB (6); el alfa se ignora.
  if (!/^[0-9a-fA-F]{6,8}$/.test(h)) return null;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export function normalizeHex(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const h = raw.replace('#', '');
  if (!/^[0-9a-fA-F]{6,8}$/.test(h)) return null;
  return `#${h.slice(0, 6).toUpperCase()}`;
}

// Distancia RGB máxima para considerar que un hex pertenece a una familia de
// color. Es holgada a propósito: dos 'azules' de marcas distintas pueden estar
// lejos en RGB y aun así ser el mismo color a ojo.
const MATCH_THRESHOLD = 170;

// Los neutros casi no tienen croma y la distancia RGB pura los empareja mal
// con colores saturados (un gris medio 'queda cerca' del morado), así que se
// resuelven por luminosidad en su propia rama.
const CROMA_NEUTRO = 40;

const CROMATICAS = FAMILIAS.filter(
  (c) => !['blanco', 'gris', 'negro'].includes(c.id),
);

// A qué familia pertenece un hex. null = no se parece a ninguna lo bastante.
export function familiaDeHex(hex: unknown): string | null {
  if (typeof hex !== 'string') return null;
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  if (max - min < CROMA_NEUTRO) {
    const lightness = (max + min) / 2;
    if (lightness > 225) return 'blanco';
    if (lightness < 40) return 'negro';
    return 'gris';
  }

  let best: string | null = null;
  let bestDist = Infinity;
  for (const c of CROMATICAS) {
    const crgb = hexToRgb(c.swatch);
    if (!crgb) continue;
    const d = Math.hypot(r - crgb[0], g - crgb[1], b - crgb[2]);
    if (d < bestDist) {
      bestDist = d;
      best = c.id;
    }
  }
  return bestDist <= MATCH_THRESHOLD ? best : null;
}

// La familia de una bobina del almacén: manda su tono real si lo tiene, y si
// no (bobinas dadas de alta antes de 0023) el color del catálogo que eligió
// Salva.
export function familiaDeBobina(b: {
  color_hex?: string | null;
  color_id?: string | null;
}): string | null {
  return familiaDeHex(b.color_hex) ?? b.color_id ?? null;
}

// La familia de una ranura del AMS: manda el hex que reporta la impresora.
export function familiaDeRanura(s: {
  color_hex?: string | null;
  color_id?: string | null;
}): string | null {
  return familiaDeHex(s.color_hex) ?? s.color_id ?? null;
}

// Dos colores hacen juego cuando caen en la misma familia. Un lado sin familia
// (hex raro, bobina sin color) NUNCA hace juego: mejor mandarla al grupo
// 'Otros' que fingir una coincidencia.
export const mismaFamilia = (a: string | null, b: string | null): boolean =>
  a !== null && b !== null && a === b;
