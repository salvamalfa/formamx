import { call } from './http';

export interface Mensaje {
  id: string;
  // email|whatsapp|web|manual
  channel: string;
  // in (recibido) | out (enviado)
  direction: string;
  customer_id: string | null;
  order_id: string | null;
  subject: string | null;
  body: string;
  // nuevo|leido|respondido|archivado
  status: string;
  created_at: string;
  // Nombre del cliente que el worker adjunta por LEFT JOIN; null si el
  // mensaje no tiene cliente ligado o responde un worker anterior al módulo.
  customer_name: string | null;
}

// Normalizaciones por si responde un worker anterior al módulo.
const normalizeMensaje = (m: Mensaje): Mensaje => ({
  ...m,
  customer_id: m.customer_id ?? null,
  order_id: m.order_id ?? null,
  subject: m.subject ?? null,
  status: m.status ?? 'nuevo',
  customer_name: m.customer_name ?? null,
});

export const getMensajes = (
  token: string,
  opts?: { status?: string; customer_id?: string; limit?: number },
) => {
  const params = new URLSearchParams();
  if (opts?.status) params.set('status', opts.status);
  if (opts?.customer_id) params.set('customer_id', opts.customer_id);
  if (opts?.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return call<{ mensajes: Mensaje[] }>(token, `/inbox${qs ? `?${qs}` : ''}`).then((r) =>
    (r.mensajes ?? []).map(normalizeMensaje),
  );
};

export const createMensaje = (
  token: string,
  data: {
    channel: string;
    body: string;
    direction?: string;
    subject?: string;
    customer_id?: string;
    order_id?: string;
  },
) =>
  call<Mensaje>(token, '/inbox', { method: 'POST', body: JSON.stringify(data) }).then(
    normalizeMensaje,
  );

export const patchMensaje = (token: string, id: string, status: string) =>
  call<Mensaje>(token, `/inbox/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  }).then(normalizeMensaje);
