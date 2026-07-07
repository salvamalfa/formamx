import { API_BASE } from '../config/api';

export type CheckoutPayload =
  | { product: 'lampara'; config: { model: string; pantalla: string; tapa: string } }
  | { product: string };

// Pide la sesión de pago y manda al comprador a Stripe. Si algo falla lanza
// Error con mensaje `checkout_<status>` (p. ej. checkout_409 = agotado) para
// que cada botón decida qué mostrar.
export async function startCheckout(payload: CheckoutPayload): Promise<void> {
  const res = await fetch(`${API_BASE}/api/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`checkout_${res.status}`);
  const { url } = (await res.json()) as { url: string };
  window.location.assign(url);
}
