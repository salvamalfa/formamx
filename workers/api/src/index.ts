import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppContext } from './env';
import { admin } from './routes/admin/index';
import { agent } from './routes/agent';
import { checkout } from './routes/checkout';
import { products } from './routes/products';
import { webhook } from './routes/webhook';

const PROD_ORIGINS = ['https://formamx.com', 'https://www.formamx.com'];
const DEV_ORIGINS = ['http://localhost:4321', 'http://127.0.0.1:4321'];

const app = new Hono<AppContext>();

// CORS con lista cerrada. Los orígenes de desarrollo (localhost) solo se
// permiten cuando el propio worker corre en local (wrangler dev sirve en
// localhost); en producción, sobre workers.dev, quedan fuera. Al webhook no le
// afecta: Stripe llama server-to-server sin header Origin.
app.use(
  '/api/*',
  cors({
    origin: (origin, c) => {
      if (PROD_ORIGINS.includes(origin)) return origin;
      const host = new URL(c.req.url).hostname;
      const local = host === 'localhost' || host === '127.0.0.1';
      if (local && DEV_ORIGINS.includes(origin)) return origin;
      return null;
    },
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
);

app.route('/api/checkout', checkout);
app.route('/api/products', products);
app.route('/api/webhook', webhook);
app.route('/api/admin', admin);
app.route('/api/agent', agent);

app.get('/', (c) => c.json({ ok: true, servicio: 'formamx-api' }));

export default app;
