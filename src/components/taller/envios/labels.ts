export const ENVIO_STATUS_LABEL: Record<string, string> = {
  creada: 'Guía creada',
  en_transito: 'En tránsito',
  entregada: 'Entregada',
  incidencia: 'Incidencia',
};

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
