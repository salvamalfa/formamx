import { API_BASE } from '../config/api';

// Cliente del dashboard /taller. Todo va con el bearer del taller; un 401
// lanza 'no_autorizado' para que la UI vuelva a pedir el token.

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

export interface Spool {
  slot: number;
  color_id: string | null;
  material: string | null;
  // Color exacto que reporta la impresora ('#RRGGBB'), tenga o no
  // correspondencia con el catálogo.
  color_hex: string | null;
}

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}/api/admin${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (res.status === 401) throw new Error('no_autorizado');
  if (!res.ok) throw new Error(`error_${res.status}`);
  return (await res.json()) as T;
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

export const getSpools = (token: string) =>
  call<{ slots: Spool[] }>(token, '/spools').then((r) => r.slots);

export const getPrinter = (token: string) =>
  call<{ bed_clear: boolean; ams_synced_at: string | null }>(token, '/printer');

export const confirmBedClear = (token: string) =>
  call<{ bed_clear: boolean }>(token, '/printer/bed-clear', { method: 'POST' });

export const dispatchOrder = (token: string, id: string) =>
  call<{ jobs: PrintJob[] }>(token, `/orders/${id}/dispatch`, { method: 'POST' }).then(
    (r) => r.jobs,
  );

export const requeueJob = (token: string, id: string) =>
  call<PrintJob>(token, `/jobs/${id}/requeue`, { method: 'POST' });
