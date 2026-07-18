import { call } from './http';
import type { Order } from './pedidos';

export interface Cliente {
  id: string;
  created_at: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  order_count: number;
  last_order_at: string | null;
}

// Pedido del historial de un cliente: como Order pero sin trabajos de
// impresión (el detalle del CRM no los trae).
export type ClientePedido = Omit<Order, 'jobs'>;

// Normalizaciones por si responde un worker anterior al módulo.
const normalizeCliente = (c: Cliente): Cliente => ({
  ...c,
  name: c.name ?? null,
  email: c.email ?? null,
  phone: c.phone ?? null,
  notes: c.notes ?? null,
  order_count: c.order_count ?? 0,
  last_order_at: c.last_order_at ?? null,
});

const normalizePedido = (p: ClientePedido): ClientePedido => ({
  ...p,
  production: p.production ?? (p.config ? 'impresion_3d' : 'manual'),
});

export const getClientes = (token: string) =>
  call<{ clientes: Cliente[] }>(token, '/clientes').then((r) =>
    (r.clientes ?? []).map(normalizeCliente),
  );

export const getCliente = (token: string, id: string) =>
  call<{ cliente: Cliente; pedidos: ClientePedido[] }>(token, `/clientes/${id}`).then((r) => ({
    cliente: normalizeCliente(r.cliente),
    pedidos: (r.pedidos ?? []).map(normalizePedido),
  }));

export const patchClienteNotes = (token: string, id: string, notes: string) =>
  call<Cliente>(token, `/clientes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ notes }),
  }).then(normalizeCliente);
