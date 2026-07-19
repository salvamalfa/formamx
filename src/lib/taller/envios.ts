import { call } from './http';
import type { Order } from './pedidos';

export interface Envio {
  id: string;
  order_id: string;
  carrier: string | null;
  service: string | null;
  tracking_number: string | null;
  label_url: string | null;
  cost_mxn: number | null;
  status: string;
  created_at: string;
  shipped_at: string | null;
  delivered_at: string | null;
  // Resumen del pedido que el worker adjunta por JOIN; null si responde un
  // worker anterior al módulo.
  pedido: { id: string; customer_name: string | null; shipping: Order['shipping'] } | null;
}

// Normalizaciones por si responde un worker anterior al módulo.
const normalizeEnvio = (e: Envio): Envio => ({
  ...e,
  carrier: e.carrier ?? null,
  service: e.service ?? null,
  tracking_number: e.tracking_number ?? null,
  label_url: e.label_url ?? null,
  cost_mxn: e.cost_mxn ?? null,
  shipped_at: e.shipped_at ?? null,
  delivered_at: e.delivered_at ?? null,
  pedido: e.pedido ?? null,
});

// El worker soporta `?order_id=` para traer solo las guías de un pedido (lo
// usa el detalle); sin filtro devuelve las guías activas (lista de Envíos).
export const getEnvios = (token: string, opts: { order_id?: string } = {}) => {
  const qs = opts.order_id ? `?order_id=${encodeURIComponent(opts.order_id)}` : '';
  return call<{ envios: Envio[] }>(token, `/envios${qs}`).then((r) =>
    (r.envios ?? []).map(normalizeEnvio),
  );
};

export const createEnvio = (
  token: string,
  data: {
    order_id: string;
    carrier?: string;
    service?: string;
    tracking_number?: string;
    label_url?: string;
    cost_mxn?: number;
  },
) =>
  call<Envio>(token, '/envios', { method: 'POST', body: JSON.stringify(data) }).then(
    normalizeEnvio,
  );

export const patchEnvio = (token: string, id: string, status: string) =>
  call<Envio>(token, `/envios/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  }).then(normalizeEnvio);
