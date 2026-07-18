export const CHANNEL_LABEL: Record<string, string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  web: 'Web',
  manual: 'Manual',
};

export const MSG_STATUS_LABEL: Record<string, string> = {
  nuevo: 'Nuevo',
  leido: 'Leído',
  respondido: 'Respondido',
  archivado: 'Archivado',
};

export const DIRECTION_LABEL: Record<string, string> = {
  in: 'Recibido',
  out: 'Enviado',
};

// Acciones por estado, derivadas del grafo del worker (lib/inbox.ts):
// nuevo→[leido, respondido, archivado], leido→[respondido, archivado],
// respondido→[archivado]; archivado es terminal y no aparece.
export const MSG_ACTIONS: Record<string, { status: string; label: string }[]> = {
  nuevo: [
    { status: 'leido', label: 'Leído' },
    { status: 'respondido', label: 'Respondido' },
    { status: 'archivado', label: 'Archivar' },
  ],
  leido: [
    { status: 'respondido', label: 'Respondido' },
    { status: 'archivado', label: 'Archivar' },
  ],
  respondido: [{ status: 'archivado', label: 'Archivar' }],
};
