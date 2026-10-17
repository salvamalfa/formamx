import type Stripe from 'stripe';

// Métodos que ofrece el checkout. Desde la API 2026-09-30 ya no se listan a
// mano (payment_method_types desapareció): Stripe calcula los métodos según
// la configuración de la cuenta y esta lista FILTRA ese cálculo. Por eso cada
// método tiene que estar además encendido en el dashboard (Settings → Payment
// methods); si OXXO se apaga ahí, desaparece del checkout sin error.
// Apple Pay y Google Pay entran como `card`. El webhook asume que solo hay un
// método síncrono (tarjeta) y uno diferido (OXXO): agregar otro aquí obliga a
// revisar cómo webhook.ts deduce payment_method.
export const ALLOWED_PAYMENT_METHODS = ['card', 'oxxo'] as const;
export type CheckoutPaymentMethod = (typeof ALLOWED_PAYMENT_METHODS)[number];

// Las piezas con stock (únicas, como la banca) se cobran solo con tarjeta. Un
// OXXO no aparta la pieza mientras la ficha está vigente (hasta días), y si
// otro comprador paga con tarjeta en ese hueco, el efectivo del primero ya no
// se puede reembolsar por Stripe. La lámpara (stock NULL, se hace bajo
// pedido) no tiene ese problema.
export function paymentMethodsFor(stock: number | null): CheckoutPaymentMethod[] {
  return stock === null ? [...ALLOWED_PAYMENT_METHODS] : ['card'];
}

export interface SessionInput {
  name: string;
  // Centavos MXN, leídos de la base. Nunca del cliente.
  unitAmountMxn: number;
  metadata: Record<string, string>;
  cancelPath: string;
  siteOrigin: string;
  paymentMethods: CheckoutPaymentMethod[];
}

export function buildSessionParams(input: SessionInput): Stripe.Checkout.SessionCreateParams {
  return {
    mode: 'payment',
    allowed_payment_method_types: [...input.paymentMethods],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'mxn',
          unit_amount: input.unitAmountMxn,
          product_data: { name: input.name },
        },
      },
    ],
    shipping_address_collection: { allowed_countries: ['MX'] },
    phone_number_collection: { enabled: true },
    metadata: input.metadata,
    success_url: `${input.siteOrigin}/gracias?sid={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.siteOrigin}${input.cancelPath}`,
  };
}
