import { BLANCO, COLORS } from "../../../config/lamps";
import {
  familiaDeHex,
  familiaLabel,
  familiaSwatch,
  FAMILIAS,
} from "../../../config/colores";

// Colores que puede elegir una bobina del almacén: las 9 familias de
// src/config/colores.ts (blanco + los 6 del catálogo + gris + negro). El gris
// y el negro no son configurables en una lámpara pero sí existen como
// filamento, y sin ellos una ranura gris del AMS no podía emparejar con nada.
export const SPOOL_COLORS = FAMILIAS;

// Los 7 del configurador, para donde sí importa el catálogo de la lámpara.
export const CATALOG_COLORS = [BLANCO, ...COLORS];

export const colorLabel = familiaLabel;
export const colorSwatch = (id: string) => familiaSwatch(id);

// Nombre común para un hex de bobina. No intenta precisión: un gris claro,
// medio u oscuro dicen todos "Gris" — el matiz exacto ya está a la vista en el
// hex de al lado. Si no cae en ninguna familia se muestra el hex tal cual.
export function nearestColorName(hex: string): string {
  const familia = familiaDeHex(hex);
  return familia ? familiaLabel(familia) : hex;
}

export {
  familiaDeBobina,
  familiaDeRanura,
  familiaDeHex,
  mismaFamilia,
} from "../../../config/colores";
