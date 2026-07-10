import { Hono } from 'hono';
import type Stripe from 'stripe';
import type { Env, AppContext } from '../env';
import { lampLabel, validateLampConfig } from '../lib/catalog';
import type { OrderRow, ProductRow } from '../lib/db';
import { notify } from '../lib/ntfy';
import { stripeClient, webhookCryptoProvider } from '../lib/stripe';

export const webhook = new Hono<AppContext>();

// Lo único que se usa del ExecutionContext (los tipos de Hono y de
// workers-types difieren en el resto).
interface WaitUntil {
  waitUntil(promise: Promise<unknown>): void;
}

// Reglas de oro de este endpoint:
// - La firma se verifica sobre el body crudo, antes de cualquier parseo.
// - Idempotencia doble: webhook_events por event_id + UNIQUE de session_id.
// - Los cambios de estado son UPDATEs guardados (WHERE status = ...) para que
//   un evento duplicado o tardío nunca regrese un pedido a un estado anterior.
// - OXXO es pago diferido: `completed` con payment_status 'unpaid' crea el
//   pedido `pendiente`; solo async_payment_succeeded lo promueve a `pagada`.
// - Siempre 200 en eventos manejados o ignorados; Stripe reintenta los demás.
webhook.post('/stripe', async (c) => {
  const signature = c.req.header('stripe-signature');
  if (!signature) return c.text('firma faltante', 400);
  const rawBody = await c.req.text();

  let event: Stripe.Event;
  try {
    const stripe = stripeClient(c.env.STRIPE_SECRET_KEY);
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      c.env.STRIPE_WEBHOOK_SECRET,
      undefined,
      webhookCryptoProvider,
    );
  } catch {
    return c.text('firma invalida', 400);
  }

  const dedupe = await c.env.DB.prepare(
    'INSERT OR IGNORE INTO webhook_events (event_id, type) VALUES (?, ?)',
  )
    .bind(event.id, event.type)
    .run();
  if (!dedupe.meta.changes) return c.text('duplicado', 200);

  const session = event.data.object as Stripe.Checkout.Session;

  switch (event.type) {
    case 'checkout.session.completed':
      await onSessionCompleted(c.env, c.executionCtx, session);
      break;
    case 'checkout.session.async_payment_succeeded':
      await promotePendingOrder(c.env, c.executionCtx, session.id, 'pagada');
      break;
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired':
      await promotePendingOrder(c.env, c.executionCtx, session.id, 'cancelada');
      break;
    // Otros tipos: aceptados y olvidados a propósito.
  }

  return c.text('ok', 200);
});

async function onSessionCompleted(
  env: Env,
  ctx: WaitUntil,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const meta = session.metadata ?? {};
  const productId = meta.product_id;
  if (!productId) {
    console.error('sesion sin product_id', session.id);
    return;
  }

  const lamp = validateLampConfig(meta);
  const paid = session.payment_status === 'paid';
  // En checkout solo ofrecemos tarjeta (síncrono) y OXXO (diferido); si la
  // sesión llega sin pagar, el método fue OXXO.
  const paymentMethod = paid ? 'card' : 'oxxo';
  // Según la versión de API, Stripe entrega el envío en collected_information
  // o en shipping_details; aceptamos ambos.
  const shipping =
    (session as { collected_information?: { shipping_details?: unknown } })
      .collected_information?.shipping_details ??
    (session as { shipping_details?: unknown }).shipping_details ??
    null;

  // Además del snapshot en el pedido, el cliente se normaliza en `customers`
  // (por email) para que el CRM futuro nazca con historial completo.
  const customerId = await upsertCustomer(env, session);

  const inserted = await env.DB.prepare(
    `INSERT OR IGNORE INTO orders (
       id, provider, provider_session_id, provider_payment_id, payment_method,
       product_id, config_json, amount_mxn, currency,
       customer_name, customer_email, customer_phone, customer_id,
       shipping_json, status
     ) VALUES (?, 'stripe', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      `ord_${crypto.randomUUID()}`,
      session.id,
      typeof session.payment_intent === 'string' ? session.payment_intent : null,
      paymentMethod,
      productId,
      lamp ? JSON.stringify(lamp) : null,
      session.amount_total ?? 0,
      session.currency ?? 'mxn',
      session.customer_details?.name ?? null,
      session.customer_details?.email ?? null,
      session.customer_details?.phone ?? null,
      customerId,
      shipping ? JSON.stringify(shipping) : null,
      paid ? 'pagada' : 'pendiente',
    )
    .run();

  if (inserted.meta.changes && paid) {
    await onOrderPaid(env, ctx, session.id);
  }
}

// Promueve un pedido `pendiente` (voucher OXXO) al desenlace que reportó
// Stripe. El WHERE guardado hace la operación idempotente y a prueba de
// eventos fuera de orden.
async function promotePendingOrder(
  env: Env,
  ctx: WaitUntil,
  sessionId: string,
  outcome: 'pagada' | 'cancelada',
): Promise<void> {
  const updated = await env.DB.prepare(
    `UPDATE orders SET status = ?, updated_at = datetime('now')
     WHERE provider_session_id = ? AND status = 'pendiente'`,
  )
    .bind(outcome, sessionId)
    .run();

  if (updated.meta.changes && outcome === 'pagada') {
    await onOrderPaid(env, ctx, sessionId);
  }
}

// Efectos de entrar a `pagada`: descontar stock de piezas únicas y avisar al
// taller. Corre exactamente una vez por pedido (los llamadores lo garantizan).
async function onOrderPaid(env: Env, ctx: WaitUntil, sessionId: string): Promise<void> {
  const order = await env.DB.prepare('SELECT * FROM orders WHERE provider_session_id = ?')
    .bind(sessionId)
    .first<OrderRow>();
  if (!order) return;

  let oversold = false;
  const product = await env.DB.prepare('SELECT * FROM products WHERE id = ?')
    .bind(order.product_id)
    .first<ProductRow>();
  if (product && product.stock !== null) {
    const decremented = await env.DB.prepare(
      'UPDATE products SET stock = stock - 1 WHERE id = ? AND stock > 0',
    )
      .bind(order.product_id)
      .run();
    // Dos compradores pueden llegar a Stripe antes de que aterrice cualquiera
    // de los dos webhooks; el pedido se conserva pero el aviso pide reembolso.
    oversold = !decremented.meta.changes;
  }

  const lamp = order.config_json ? validateLampConfig(JSON.parse(order.config_json)) : null;
  const label = lamp ? lampLabel(lamp) : (product?.name ?? order.product_id);
  const city = cityFromShipping(order.shipping_json);
  const amount = `$${(order.amount_mxn / 100).toLocaleString('es-MX')} MXN`;
  const body = [
    `${label} — ${amount}${city ? ` — ${city}` : ''}`,
    `Pedido ${order.id}`,
    oversold ? 'REVISAR: posible sobreventa, reembolsar.' : null,
  ]
    .filter(Boolean)
    .join('\n');

  ctx.waitUntil(notify(env.NTFY_TOPIC, 'forma: pedido nuevo', body));
}

// Alta o actualización del cliente por email. Un fallo aquí no debe tirar el
// webhook: sin email (o con error) el pedido simplemente queda sin FK.
async function upsertCustomer(env: Env, session: Stripe.Checkout.Session): Promise<string | null> {
  const email = session.customer_details?.email?.trim().toLowerCase();
  if (!email) return null;
  try {
    await env.DB.prepare(
      `INSERT INTO customers (id, name, email, phone) VALUES (?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         name = COALESCE(excluded.name, name),
         phone = COALESCE(excluded.phone, phone)`,
    )
      .bind(
        `cus_${crypto.randomUUID()}`,
        session.customer_details?.name ?? null,
        email,
        session.customer_details?.phone ?? null,
      )
      .run();
    const row = await env.DB.prepare('SELECT id FROM customers WHERE email = ?')
      .bind(email)
      .first<{ id: string }>();
    return row?.id ?? null;
  } catch (err) {
    console.error('upsert de cliente fallo', err);
    return null;
  }
}

function cityFromShipping(shippingJson: string | null): string | null {
  if (!shippingJson) return null;
  try {
    const shipping = JSON.parse(shippingJson) as { address?: { city?: string } };
    return shipping.address?.city ?? null;
  } catch {
    return null;
  }
}
