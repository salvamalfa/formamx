// Única fuente de verdad del configurador de lámparas.
// Añadir un modelo de pantalla nuevo = añadir una entrada a MODELS y copiar sus
// 6 PNGs a public/images/lamps/pantalla/. Los componentes no necesitan cambios.

export interface LampColor {
  id: string;
  label: string;
  swatch: string; // color CSS del círculo selector
  file: string; // segmento de color en el nombre de archivo
}

export interface LampModel {
  id: string;
  label: string;
  file: string; // prefijo de archivo: <file>_Pantalla_<color>.png
}

export type LayerKey = 'pantalla' | 'base';

export interface Step {
  id: 'pantalla' | 'cuerpo' | 'tapa';
  label: string;
  showModels: boolean; // chips de modelo (solo el paso Pantalla)
  colors: LampColor[];
  layer: LayerKey | null; // capa de imagen que cambia; null = paso sin efecto visual
}

export const COLORS: LampColor[] = [
  { id: 'azul', label: 'Azul', swatch: '#2f5fd6', file: 'Azul' },
  { id: 'rojo', label: 'Rojo', swatch: '#c5202b', file: 'Rojo' },
  { id: 'verde', label: 'Verde', swatch: '#2e9e3f', file: 'Verde' },
  { id: 'amarillo', label: 'Amarillo', swatch: '#d9a221', file: 'Amarillo' },
  { id: 'morado', label: 'Morado', swatch: '#7b3fc4', file: 'Morado' },
  { id: 'naranja', label: 'Naranja', swatch: '#e0701a', file: 'Naranja' },
];

// El cuerpo solo existe en blanco; las imágenes CuerpoTapa ya lo traen incluido.
export const BLANCO: LampColor = { id: 'blanco', label: 'Blanco', swatch: '#f4f4f2', file: '' };

export const MODELS: LampModel[] = [
  { id: 'tessera', label: 'Tessera', file: 'TesseraLamp' },
  { id: 'diamond', label: 'Diamond', file: 'DiamondLamp' },
  { id: 'fluted', label: 'Fluted', file: 'FlutedLamp' },
  { id: 'rhombus', label: 'Rhombus', file: 'RhombusLamp' },
  { id: 'torsion', label: 'Torsion', file: 'TorsionLamp' },
];

export const STEPS: Step[] = [
  { id: 'pantalla', label: 'Pantalla', showModels: true, colors: COLORS, layer: 'pantalla' },
  { id: 'cuerpo', label: 'Cuerpo', showModels: false, colors: [BLANCO], layer: null },
  { id: 'tapa', label: 'Tapa', showModels: false, colors: COLORS, layer: 'base' },
];

export const DEFAULTS = {
  modelId: 'tessera',
  pantallaColorId: 'azul',
  tapaColorId: 'azul',
};

// Claves del manifest de imágenes optimizadas que se genera en build
// (ver src/lib/lampImages.ts). Coinciden con la ruta relativa del PNG
// original en src/assets/lamps/, sin extensión.
export const pantallaKey = (model: LampModel, color: LampColor): string =>
  `pantalla/${model.file}_Pantalla_${color.file}`;

// La base (cuerpo + tapa) es común a todos los modelos de pantalla.
export const baseKey = (color: LampColor): string =>
  `base/TesseraLamp_CuerpoTapa_${color.file}`;

// Todas las combinaciones, para precargarlas y que el cambio sea instantáneo.
export const ALL_IMAGE_KEYS: string[] = [
  ...MODELS.flatMap((m) => COLORS.map((c) => pantallaKey(m, c))),
  ...COLORS.map((c) => baseKey(c)),
];

// Entrada del manifest: srcset WebP multi-tamaño + fallback.
export interface LampImage {
  src: string;
  srcset: string;
}

export type LampImageManifest = Record<string, LampImage>;
