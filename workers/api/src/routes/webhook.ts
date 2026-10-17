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
// - Idempotencia: los handlers son idempotentes por sí mismos (UNIQUE de
//   session_id, UPDATEs guardados, candado de paid_at). webhook_events solo
//   ahorra trabajo: se escribe DESPUÉS de procesar, así un isolate que muere a
//   media corrida o un reintento que se cruza con el primero nunca deja el
//   evento marcado como visto sin haberse aplicado.
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

  const seen = await c.env.DB.prepare('SELECT 1 FROM webhook_events WHERE event_id = ?')
    .bind(event.id)
    .first();
  if (seen) return c.text('duplicado', 200);

  const session = event.data.object as Stripe.Checkout.Session;
  // Sesiones que no salieron de /api/checkout (un Payment Link o una sesión
  // creada a mano en el dashboard) no llevan product_id: no hay pedido que
  // esperar para ellas.
  const fromCheckout = Boolean(session.metadata?.product_id);

  // Si el procesamiento falla (error transitorio de D1, etc.) se responde 500
  // sin marcar el evento: Stripe reintenta y vuelve a procesarse en vez de
  // quedar consumido con el pedido a medias o perdido.
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await onSessionCompleted(c.env, c.executionCtx, session);
        break;
      case 'checkout.session.async_payment_succeeded':
        await promotePendingOrder(c.env, c.executionCtx, session.id, 'pagada', fromCheckout);
        break;
      case 'checkout.session.async_payment_failed':
        await promotePendingOrder(c.env, c.executionCtx, session.id, 'cancelada', fromCheckout);
        break;
      case 'checkout.session.expired':
        // Una sesión que expira casi nunca tuvo pedido (nadie llegó a pagar):
        // no hay nada que esperar, a diferencia de los dos casos de arriba.
        await promotePendingOrder(c.env, c.executionCtx, session.id, 'cancelada', false);
        break;
      // Otros tipos: aceptados y olvidados a propósito.
    }
  } catch (err) {
    console.error('procesando webhook fallo', event.id, err);
    return c.text('error', 500);
  }

  await c.env.DB.prepare('INSERT OR IGNORE INTO webhook_events (event_id, type) VALUES (?, ?)')
    .bind(event.id, event.type)
    .run();
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

  // Los efectos de pago se disparan por el candado atómico de paid_at (dentro
  // de onOrderPaid), no por si esta inserción fue la que creó el pedido: así un
  // reintento del webhook sobre un pedido ya existente los completa igual.
  if (paid) {
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
  requireOrder: boolean,
): Promise<void> {
  // Stripe no garantiza el orden de entrega. Si el `completed` de esta sesión
  // falló y está en reintentos cuando llega el desenlace del OXXO, no hay
  // pedido que mover; dar el evento por bueno dejaría el pedido atorado en
  // `pendiente` con el dinero ya cobrado. Se lanza para que el handler
  // responda 500 sin marcar el evento: Stripe reintenta cuando el pedido ya
  // existe.
  if (requireOrder) {
    const exists = await env.DB.prepare('SELECT 1 FROM orders WHERE provider_session_id = ?')
      .bind(sessionId)
      .first();
    if (!exists) throw new Error(`pedido aun no existe para ${sessionId}`);
  }

  // El pago confirmado también rescata un pedido que Salva canceló a mano
  // mientras la ficha seguía vigente: el cliente ya pagó en efectivo y OXXO no
  // se puede reembolsar por Stripe, así que el pedido vuelve a la vista como
  // `pagada` para decidir (surtirlo o devolver por transferencia) en vez de
  // quedarse cancelado con el dinero adentro. paid_at IS NULL distingue esa
  // cancelación de una que ocurrió después de cobrar.
  const from =
    outcome === 'pagada'
      ? "(status = 'pendiente' OR (status = 'cancelada' AND paid_at IS NULL))"
      : "status = 'pendiente'";
  await env.DB.prepare(
    `UPDATE orders SET status = ?, updated_at = datetime('now')
     WHERE provider_session_id = ? AND ${from}`,
  )
    .bind(outcome, sessionId)
    .run();

  // No se condiciona a que ESTE update haya movido el estado: si un intento
  // previo ya lo pasó a 'pagada' pero murió antes de los efectos, el candado
  // de paid_at en onOrderPaid los corre ahora (y los evita si ya corrieron).
  if (outcome === 'pagada') {
    await onOrderPaid(env, ctx, sessionId);
  }
}

// Efectos de entrar a `pagada`: descontar stock de piezas únicas y avisar al
// taller. Corre exactamente una vez por pedido: el candado atómico de paid_at
// deja pasar solo al primer llamador, aunque el webhook se reintente.
async function onOrderPaid(env: Env, ctx: WaitUntil, sessionId: string): Promise<void> {
  const order = await env.DB.prepare('SELECT * FROM orders WHERE provider_session_id = ?')
    .bind(sessionId)
    .first<OrderRow>();
  if (!order) return;

  // Descuento de stock y candado en un solo batch (una transacción de D1): o
  // pasan los dos o ninguno. Separados, un error entre ambos dejaba paid_at
  // puesto sin descontar, y el reintento ya no descontaba nunca: la pieza
  // única se podía vender otra vez. El descuento va primero y exige que el
  // candado siga libre; D1 corre los statements de un batch en orden y sin
  // concurrencia, así que solo el llamador que va a ganar el candado descuenta.
  // status = 'pagada': un pedido cancelado a mano entre un intento y su
  // reintento ya no cobra efectos.
  const [decremented, claimed] = await env.DB.batch([
    env.DB.prepare(
      `UPDATE products SET stock = stock - 1
       WHERE id = ? AND stock > 0 AND EXISTS (
         SELECT 1 FROM orders
         WHERE provider_session_id = ? AND paid_at IS NULL AND status = 'pagada'
       )`,
    ).bind(order.product_id, sessionId),
    env.DB.prepare(
      `UPDATE orders SET paid_at = datetime('now')
       WHERE provider_session_id = ? AND paid_at IS NULL AND status = 'pagada'`,
    ).bind(sessionId),
  ]);
  // Otro procesamiento (o un reintento) ya corrió los efectos: no repetir.
  if (!claimed.meta.changes) return;

  const product = await env.DB.prepare('SELECT * FROM products WHERE id = ?')
    .bind(order.product_id)
    .first<ProductRow>();
  // Dos compradores pueden llegar a Stripe antes de que aterrice cualquiera
  // de los dos webhooks; el pedido se conserva pero el aviso pide reembolso.
  // Piezas sin stock (NULL, la lámpara) nunca descuentan y nunca se sobrevenden.
  const oversold = product?.stock !== null && product?.stock !== undefined && !decremented.meta.changes;
  // ntfy no llega desde Workers: el log de Cloudflare es hoy el único rastro.
  if (oversold) console.error('posible sobreventa, reembolsar', order.id, order.product_id);

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
