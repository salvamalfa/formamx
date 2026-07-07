import { Hono } from 'hono';
import type { AppContext } from '../env';
import type { ProductRow } from '../lib/db';

export const products = new Hono<AppContext>();

// Disponibilidad para las páginas estáticas (/banca la consulta al cargar).
// No expone el stock crudo, solo si se puede comprar.
products.get('/:id', async (c) => {
  const product = await c.env.DB.prepare('SELECT * FROM products WHERE id = ?')
    .bind(c.req.param('id'))
    .first<ProductRow>();
  if (!product) return c.json({ error: 'no_existe' }, 404);
  return c.json({
    id: product.id,
    available: Boolean(product.active) && (product.stock === null || product.stock > 0),
    price_mxn: product.price_mxn,
  });
});
