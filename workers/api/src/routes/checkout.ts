import { Hono } from 'hono';
import type { AppContext } from '../env';
import { lampLabel, validateLampConfig } from '../lib/catalog';
import type { ProductRow } from '../lib/db';
import { buildSessionParams, paymentMethodsFor } from '../lib/checkout_session';
import { stripeClient } from '../lib/stripe';

export const checkout = new Hono<AppContext>();

// El precio sale SIEMPRE de la base (nunca del cliente); la combinación de la
// lámpara se valida contra el catálogo real del configurador.
checkout.post('/', async (c) => {
  // Rate limit por IP: crear una sesión de Stripe cuesta una llamada de red;
  // sin esto alguien podría automatizar miles. La IP real la pone Cloudflare.
  const ip = c.req.header('CF-Connecting-IP') ?? 'anon';
  const { success } = await c.env.CHECKOUT_RL.limit({ key: ip });
  if (!success) return c.json({ error: 'demasiadas_solicitudes' }, 429);

  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) ?? {};
  } catch {
    return c.json({ error: 'body_invalido' }, 400);
  }

  const productId = body.product;
  if (typeof productId !== 'string') return c.json({ error: 'producto_invalido' }, 400);

  const product = await c.env.DB.prepare('SELECT * FROM products WHERE id = ?')
    .bind(productId)
    .first<ProductRow>();
  if (!product || !product.active) return c.json({ error: 'producto_invalido' }, 400);
  if (product.stock !== null && product.stock < 1) return c.json({ error: 'agotado' }, 409);

  let name = product.name;
  let cancelPath = '/';
  const metadata: Record<string, string> = { product_id: product.id };

  if (product.kind === 'configurable') {
    const lamp = validateLampConfig(body.config);
    if (!lamp) return c.json({ error: 'config_invalida' }, 400);
    name = lampLabel(lamp);
    metadata.model = lamp.model;
    metadata.pantalla = lamp.pantalla;
    metadata.tapa = lamp.tapa;
    cancelPath = '/lampara';
  } else {
    cancelPath = '/banca';
  }

  try {
    const stripe = stripeClient(c.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create(
      buildSessionParams({
        name,
        unitAmountMxn: product.price_mxn,
        metadata,
        cancelPath,
        siteOrigin: c.env.SITE_ORIGIN,
        paymentMethods: paymentMethodsFor(product.stock),
      }),
    );
    if (!session.url) return c.json({ error: 'stripe' }, 500);
    return c.json({ url: session.url });
  } catch (err) {
    console.error('stripe checkout fallo', err);
    return c.json({ error: 'stripe' }, 500);
  }
});
