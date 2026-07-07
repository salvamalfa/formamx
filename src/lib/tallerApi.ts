import { API_BASE } from '../config/api';

// Cliente del dashboard /taller. Todo va con el bearer del taller; un 401
// lanza 'no_autorizado' para que la UI vuelva a pedir el token.

export interface Order {
  id: string;
  created_at: string;
  product_id: string;
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
}

export interface Spool {
  slot: number;
  color_id: string | null;
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
  call<{ orders: Order[] }>(token, '/orders').then((r) => r.orders);

export const patchOrder = (token: string, id: string, status: string) =>
  call<Order>(token, `/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });

export const getSpools = (token: string) =>
  call<{ slots: Spool[] }>(token, '/spools').then((r) => r.slots);

export const putSpools = (token: string, slots: Spool[]) =>
  call<{ slots: Spool[] }>(token, '/spools', {
    method: 'PUT',
    body: JSON.stringify({ slots }),
  }).then((r) => r.slots);
