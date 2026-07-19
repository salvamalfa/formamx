export const ENVIO_STATUS_LABEL: Record<string, string> = {
  creada: 'Guía creada',
  en_transito: 'En tránsito',
  entregada: 'Entregada',
  incidencia: 'Incidencia',
};

// Colores del badge de estado (pill mono), análogos a los de pedidos/labels.ts:
// mostaza para lo recién creado, naranja para lo que está en movimiento (o con
// bronca), bosque para lo cerrado bien.
export interface EnvioBadge {
  bg: string;
  color: string;
}

const ENVIO_BADGE_DEFAULT: EnvioBadge = { bg: 'var(--crema-oscuro)', color: 'var(--text-faint)' };

export const ENVIO_STATUS_BADGE: Record<string, EnvioBadge> = {
  creada: { bg: 'var(--mostaza-claro)', color: '#8A6510' },
  en_transito: { bg: 'var(--naranja-claro)', color: 'var(--naranja-oscuro)' },
  entregada: { bg: 'var(--bosque-claro)', color: 'var(--bosque)' },
  incidencia: { bg: 'var(--naranja-claro)', color: 'var(--naranja-oscuro)' },
};

export function envioStatusBadge(status: string): EnvioBadge {
  return ENVIO_STATUS_BADGE[status] ?? ENVIO_BADGE_DEFAULT;
}

// Botón primario del siguiente paso feliz por estado; "Incidencia" se ofrece
// aparte (ghost) donde el grafo lo permite. Entregada no tiene siguiente.
export const NEXT_STEP_ENVIO: Record<string, { status: string; label: string }> = {
  creada: { status: 'en_transito', label: 'Marcar en tránsito' },
  en_transito: { status: 'entregada', label: 'Marcar entregada' },
  incidencia: { status: 'en_transito', label: 'Retomar tránsito' },
};

// Paqueterías habituales del taller: sugerencias del <datalist>, no un enum —
// el campo acepta cualquier texto.
export const CARRIERS = [
  'Estafeta',
  'DHL',
  'FedEx',
  'Correos de México',
  '99minutos',
  'Entrega en mano',
];
