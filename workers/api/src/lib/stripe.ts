import Stripe from 'stripe';

// Versión de API fijada a mano (la que trae stripe-node 23). Dos razones:
// - Subir la librería no debe cambiar en silencio la forma de los objetos.
// - El webhook de Stripe manda los eventos con la versión configurada en el
//   endpoint del dashboard, no con la del código: el endpoint live debe
//   crearse con ESTA misma versión (docs/NEGOCIO.md §1c).
export const STRIPE_API_VERSION = '2026-09-30.endive';

// En Workers no hay http de Node ni crypto síncrono: Stripe necesita el
// cliente fetch y el proveedor SubtleCrypto (constructEventAsync, nunca
// constructEvent).
export const webhookCryptoProvider = Stripe.createSubtleCryptoProvider();

export function stripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
  });
}
