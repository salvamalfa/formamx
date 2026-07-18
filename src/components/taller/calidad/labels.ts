import { PART_LABEL } from '../pedidos/labels';

// El veredicto lo calcula el worker (todos los items en true); aquí solo se
// traduce a la voz del taller.
export function passedLabel(passed: boolean): 'Aprobada' | 'Rechazada' {
  return passed ? 'Aprobada' : 'Rechazada';
}

// Chips de parte del formulario: las tres piezas de la lámpara (reutiliza
// PART_LABEL de pedidos) + revisar la pieza completa, que viaja como
// part = null (el registro no lleva part).
export const PART_CHOICE_LABEL: Record<string, string> = {
  ...PART_LABEL,
  completa: 'Pieza completa',
};
