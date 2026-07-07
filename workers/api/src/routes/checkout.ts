import { Hono } from 'hono';
import type { AppContext } from '../env';
import { lampLabel, validateLampConfig } from '../lib/catalog';
import type { ProductRow } from '../lib/db';
import { stripeClient } from '../lib/stripe';

export const checkout = new Hono<AppContext>();

// El precio sale SIEMPRE de la base (nunca del cliente); la combinación de la
// lámpara se valida contra el catálogo real del configurador.
checkout.post('/', async (c) => {
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
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card', 'oxxo'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'mxn',
            unit_amount: product.price_mxn,
            product_data: { name },
          },
        },
      ],
      shipping_address_collection: { allowed_countries: ['MX'] },
      phone_number_collection: { enabled: true },
      metadata,
      success_url: `${c.env.SITE_ORIGIN}/gracias?sid={CHECKOUT_SESSION_ID}`,
      cancel_url: `${c.env.SITE_ORIGIN}${cancelPath}`,
    });
    if (!session.url) return c.json({ error: 'stripe' }, 500);
    return c.json({ url: session.url });
  } catch (err) {
    console.error('stripe checkout fallo', err);
    return c.json({ error: 'stripe' }, 500);
  }
});
