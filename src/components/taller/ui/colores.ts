import { BLANCO, COLORS } from '../../../config/lamps';

// Colores que puede traer una bobina: blanco (cuerpo) + los 6 del catálogo.
export const SPOOL_COLORS = [BLANCO, ...COLORS];

export const colorLabel = (id: string | null) =>
  id ? (SPOOL_COLORS.find((c) => c.id === id)?.label ?? id) : 'vacío';

export const colorSwatch = (id: string) =>
  SPOOL_COLORS.find((c) => c.id === id)?.swatch ?? '#ccc';
