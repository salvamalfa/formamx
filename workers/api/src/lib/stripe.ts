import Stripe from 'stripe';

// En Workers no hay http de Node ni crypto síncrono: Stripe necesita el
// cliente fetch y el proveedor SubtleCrypto (constructEventAsync, nunca
// constructEvent).
export const webhookCryptoProvider = Stripe.createSubtleCryptoProvider();

export function stripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}
