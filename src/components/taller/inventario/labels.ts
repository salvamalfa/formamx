export const BOBINA_STATUS_LABEL: Record<string, string> = {
  nueva: 'Nueva',
  en_uso: 'En uso',
  agotada: 'Agotada',
};

export const PIEZA_STATUS_LABEL: Record<string, string> = {
  en_stock: 'En stock',
  reservada: 'Reservada',
  vendida: 'Vendida',
  merma: 'Merma',
};

export const QC_LABEL: Record<string, string> = {
  ok: 'QC ok',
  rechazada: 'QC rechazada',
};

export const PRODUCT_LABEL: Record<string, string> = {
  lampara: 'Lámpara',
  'banca-001': 'Banca',
};

// Materiales habituales del taller: sugerencias del <datalist>, no un enum —
// el campo acepta cualquier texto.
export const MATERIALS = ['PLA', 'PETG'];
