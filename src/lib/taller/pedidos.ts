import { call } from './http';

export interface PrintJob {
  id: string;
  order_id: string;
  part: 'pantalla' | 'cuerpo' | 'tapa';
  file_key: string;
  colors: string[];
  status: 'queued' | 'claimed' | 'printing' | 'done' | 'failed' | 'canceled';
  progress_pct: number | null;
  message: string | null;
}

export interface Order {
  id: string;
  created_at: string;
  product_id: string;
  // 'impresion_3d' pasa por la impresora; 'manual' (madera, etc.) no.
  production: 'impresion_3d' | 'manual';
  config: { model: string; pantalla: string; tapa: string } | null;
  amount_mxn: number;
  status: string;
  payment_method: string | null;
  customer: { name: string | null; email: string | null; phone: string | null };
  customer_id: string | null;
  shipping: {
    name?: string;
    address?: {
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postal_code?: string;
      country?: string;
    };
  } | null;
  jobs: PrintJob[];
}

export const getOrders = (token: string) =>
  call<{ orders: Order[] }>(token, '/orders').then((r) =>
    // Normalizaciones por si responde un worker anterior al campo.
    r.orders.map((o) => ({
      ...o,
      jobs: o.jobs ?? [],
      production: o.production ?? (o.config ? 'impresion_3d' : 'manual'),
    })),
  );

export const patchOrder = (token: string, id: string, status: string) =>
  call<Order>(token, `/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });

export const dispatchOrder = (token: string, id: string) =>
  call<{ jobs: PrintJob[] }>(token, `/orders/${id}/dispatch`, { method: 'POST' }).then(
    (r) => r.jobs,
  );

export const requeueJob = (token: string, id: string) =>
  call<PrintJob>(token, `/jobs/${id}/requeue`, { method: 'POST' });
