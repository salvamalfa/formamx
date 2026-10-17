// El flujo de cobro completo contra una D1 de verdad: SQLite en memoria (el
// motor de D1) con todas las migraciones aplicadas y eventos firmados como los
// manda Stripe. Cada caso es un camino donde un error cuesta dinero o un
// pedido: duplicados, reintentos, eventos fuera de orden, sobreventa.
import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { beforeEach, test } from 'node:test';
import Stripe from 'stripe';
import { COLORS, MODELS } from '../../../../src/config/lamps.ts';
import app from '../index.ts';

const SECRET = 'whsec_test_formamx';
const MIGRATIONS = join(fileURLToPath(import.meta.url), '../../../migrations');
const stripe = new Stripe('sk_test_formamx');

let db: DatabaseSync;
let eventSeq = 0;

// Lo mínimo de la API de D1 que usa el worker, sobre node:sqlite. batch()
// es una transacción, como en D1.
function fakeD1(sq: DatabaseSync) {
  const prepare = (sql: string) => {
    let args: SQLInputValue[] = [];
    const stmt = {
      bind(...a: SQLInputValue[]) {
        args = a;
        return stmt;
      },
      async run() {
        const r = sq.prepare(sql).run(...args);
        return { meta: { changes: Number(r.changes) } };
      },
      async first() {
        return sq.prepare(sql).get(...args) ?? null;
      },
      async all() {
        return { results: sq.prepare(sql).all(...args) };
      },
    };
    return stmt;
  };
  return {
    prepare,
    async batch(stmts: ReturnType<typeof prepare>[]) {
      sq.exec('BEGIN');
      try {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        sq.exec('COMMIT');
        return out;
      } catch (err) {
        sq.exec('ROLLBACK');
        throw err;
      }
    },
  };
}

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  for (const f of readdirSync(MIGRATIONS).sort()) {
    db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
  }
});

interface Delivery {
  payload: string;
  header: string;
}

async function sign(type: string, object: object): Promise<Delivery> {
  const payload = JSON.stringify({
    id: `evt_${++eventSeq}`,
    object: 'event',
    type,
    livemode: false,
    data: { object },
  });
  const header = await stripe.webhooks.generateTestHeaderStringAsync({ payload, secret: SECRET });
  return { payload, header };
}

// Entrega (o reentrega, como un reintento de Stripe) un evento ya firmado.
async function deliver({ payload, header }: Delivery): Promise<Response> {
  const env = {
    DB: fakeD1(db),
    STRIPE_SECRET_KEY: 'sk_test_formamx',
    STRIPE_WEBHOOK_SECRET: SECRET,
    SITE_ORIGIN: 'https://formamx.com',
  };
  const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} };
  const req = new Request('https://api.test/api/webhook/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': header },
    body: payload,
  });
  return app.fetch(req, env, ctx);
}

async function send(type: string, object: object): Promise<{ res: Response; delivery: Delivery }> {
  const delivery = await sign(type, object);
  return { res: await deliver(delivery), delivery };
}

const lampMeta = {
  product_id: 'lampara',
  model: MODELS[0].id,
  pantalla: COLORS[0].id,
  tapa: COLORS[0].id,
};
const bancaMeta = { product_id: 'banca-001' };

function session(id: string, extra: Record<string, unknown>) {
  return {
    id,
    object: 'checkout.session',
    amount_total: 49900,
    currency: 'mxn',
    payment_intent: `pi_${id}`,
    customer_details: { name: 'Ana', email: ' Ana@Ejemplo.com ', phone: '+525500000000' },
    collected_information: { shipping_details: { name: 'Ana', address: { city: 'CDMX' } } },
    metadata: lampMeta,
    ...extra,
  };
}

type Row = Record<string, unknown>;
const order = (sid: string) =>
  db.prepare('SELECT * FROM orders WHERE provider_session_id = ?').get(sid) as Row | undefined;
const stock = (id: string) =>
  (db.prepare('SELECT stock FROM products WHERE id = ?').get(id) as Row).stock;
const seenEvents = () => (db.prepare('SELECT COUNT(*) AS n FROM webhook_events').get() as Row).n;

test('tarjeta: el pedido nace pagado, con monto de Stripe y cliente normalizado', async () => {
  const { res } = await send('checkout.session.completed', session('cs_card', { payment_status: 'paid' }));
  assert.equal(res.status, 200);
  const o = order('cs_card')!;
  assert.equal(o.status, 'pagada');
  assert.equal(o.payment_method, 'card');
  assert.equal(o.amount_mxn, 49900);
  assert.ok(o.paid_at);
  assert.ok(o.config_json);
  const c = db.prepare('SELECT email FROM customers').get() as Row;
  assert.equal(c.email, 'ana@ejemplo.com');
});

test('firma de otro secreto: 400 y no se escribe nada', async () => {
  const payload = JSON.stringify({
    id: 'evt_ajeno',
    type: 'checkout.session.completed',
    data: { object: session('cs_ajeno', { payment_status: 'paid' }) },
  });
  const header = await stripe.webhooks.generateTestHeaderStringAsync({ payload, secret: 'whsec_otro' });
  const res = await deliver({ payload, header });
  assert.equal(res.status, 400);
  assert.equal(order('cs_ajeno'), undefined);
});

test('OXXO: pendiente al emitir la ficha, pagada cuando la tienda reporta', async () => {
  await send('checkout.session.completed', session('cs_oxxo', { payment_status: 'unpaid' }));
  assert.equal(order('cs_oxxo')!.status, 'pendiente');
  assert.equal(order('cs_oxxo')!.payment_method, 'oxxo');
  assert.equal(order('cs_oxxo')!.paid_at, null);
  const { res } = await send(
    'checkout.session.async_payment_succeeded',
    session('cs_oxxo', { payment_status: 'paid' }),
  );
  assert.equal(res.status, 200);
  assert.equal(order('cs_oxxo')!.status, 'pagada');
  assert.ok(order('cs_oxxo')!.paid_at);
});

test('OXXO vencido: el pedido se cancela', async () => {
  await send('checkout.session.completed', session('cs_vencido', { payment_status: 'unpaid' }));
  await send('checkout.session.async_payment_failed', session('cs_vencido', { payment_status: 'unpaid' }));
  assert.equal(order('cs_vencido')!.status, 'cancelada');
});

test('fuera de orden: el pago OXXO llega antes que el pedido y el reintento lo rescata', async () => {
  const early = await send(
    'checkout.session.async_payment_succeeded',
    session('cs_orden', { payment_status: 'paid' }),
  );
  assert.equal(early.res.status, 500);
  assert.equal(seenEvents(), 0);
  await send('checkout.session.completed', session('cs_orden', { payment_status: 'unpaid' }));
  assert.equal(order('cs_orden')!.status, 'pendiente');
  const retry = await deliver(early.delivery);
  assert.equal(retry.status, 200);
  assert.equal(order('cs_orden')!.status, 'pagada');
});

test('una sesión que expira sin pedido no deja a Stripe reintentando', async () => {
  const { res } = await send('checkout.session.expired', session('cs_expira', { status: 'expired' }));
  assert.equal(res.status, 200);
});

test('una sesión ajena al sitio (sin product_id) no deja a Stripe reintentando', async () => {
  const { res } = await send(
    'checkout.session.async_payment_succeeded',
    session('cs_link', { payment_status: 'paid', metadata: {} }),
  );
  assert.equal(res.status, 200);
});

test('el evento se marca como visto solo después de procesarse', async () => {
  const { res } = await send('checkout.session.completed', session('cs_visto', { payment_status: 'paid' }));
  assert.equal(res.status, 200);
  assert.equal(seenEvents(), 1);
});

test('reintento del mismo evento: "duplicado", un solo pedido, stock baja una vez', async () => {
  const first = await send(
    'checkout.session.completed',
    session('cs_banca', { payment_status: 'paid', amount_total: 240000, metadata: bancaMeta }),
  );
  const again = await deliver(first.delivery);
  assert.equal(await again.text(), 'duplicado');
  assert.equal(stock('banca-001'), 0);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM orders').get() as Row).n, 1);
});

test('mismo pago en dos eventos distintos: el stock baja una sola vez', async () => {
  const s = session('cs_doble', { payment_status: 'paid', amount_total: 240000, metadata: bancaMeta });
  await send('checkout.session.completed', s);
  await send('checkout.session.completed', s);
  assert.equal(stock('banca-001'), 0);
});

test('sobreventa: el segundo pago se conserva y el stock no baja de cero', async () => {
  const banca = { payment_status: 'paid', amount_total: 240000, metadata: bancaMeta };
  await send('checkout.session.completed', session('cs_primero', banca));
  await send('checkout.session.completed', session('cs_segundo', banca));
  assert.equal(stock('banca-001'), 0);
  assert.equal(order('cs_segundo')!.status, 'pagada');
});

test('la lámpara (stock NULL) nunca toca el stock', async () => {
  await send('checkout.session.completed', session('cs_lampara', { payment_status: 'paid' }));
  assert.equal(stock('lampara'), null);
});

test('un pedido pagado no retrocede con un evento tardío de fallo', async () => {
  await send('checkout.session.completed', session('cs_tarde', { payment_status: 'unpaid' }));
  await send('checkout.session.async_payment_succeeded', session('cs_tarde', { payment_status: 'paid' }));
  await send('checkout.session.async_payment_failed', session('cs_tarde', { payment_status: 'unpaid' }));
  assert.equal(order('cs_tarde')!.status, 'pagada');
});

test('OXXO cancelado a mano y pagado después: vuelve a pagada para decidir', async () => {
  await send('checkout.session.completed', session('cs_rescate', { payment_status: 'unpaid' }));
  db.prepare("UPDATE orders SET status = 'cancelada' WHERE provider_session_id = 'cs_rescate'").run();
  await send('checkout.session.async_payment_succeeded', session('cs_rescate', { payment_status: 'paid' }));
  assert.equal(order('cs_rescate')!.status, 'pagada');
  assert.ok(order('cs_rescate')!.paid_at);
});
