import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppContext } from './env';
import { admin } from './routes/admin';
import { agent } from './routes/agent';
import { checkout } from './routes/checkout';
import { products } from './routes/products';
import { webhook } from './routes/webhook';

const ALLOWED_ORIGINS = [
  'https://formamx.com',
  'https://www.formamx.com',
  'http://localhost:4321',
  'http://127.0.0.1:4321',
];

const app = new Hono<AppContext>();

// CORS con lista cerrada de orígenes. Al webhook no le afecta: Stripe llama
// server-to-server sin header Origin y el middleware no agrega nada.
app.use(
  '/api/*',
  cors({
    origin: ALLOWED_ORIGINS,
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
