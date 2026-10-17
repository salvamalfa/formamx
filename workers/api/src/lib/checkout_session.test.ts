import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ALLOWED_PAYMENT_METHODS, buildSessionParams, paymentMethodsFor } from './checkout_session.ts';

const base = {
  name: 'Lámpara forma — Torsión',
  unitAmountMxn: 49900,
  metadata: { product_id: 'lampara', model: 'torsion', pantalla: 'rojo', tapa: 'negro' },
  cancelPath: '/lampara',
  siteOrigin: 'https://formamx.com',
  paymentMethods: paymentMethodsFor(null),
};

test('el monto y la moneda salen tal cual de la base', () => {
  const p = buildSessionParams(base);
  assert.equal(p.mode, 'payment');
  assert.equal(p.line_items?.length, 1);
  assert.equal(p.line_items?.[0].quantity, 1);
  assert.equal(p.line_items?.[0].price_data?.unit_amount, 49900);
  assert.equal(p.line_items?.[0].price_data?.currency, 'mxn');
});

test('solo tarjeta y OXXO, como filtro y no como lista fija', () => {
  const p = buildSessionParams(base);
  assert.deepEqual(p.allowed_payment_method_types, ['card', 'oxxo']);
  assert.equal('payment_method_types' in p, false);
  // Una copia: mutar los params no puede tocar la constante compartida.
  p.allowed_payment_method_types?.push('link');
  assert.deepEqual([...ALLOWED_PAYMENT_METHODS], ['card', 'oxxo']);
});

test('una pieza con stock (la banca) solo se cobra con tarjeta', () => {
  assert.deepEqual(paymentMethodsFor(1), ['card']);
  assert.deepEqual(paymentMethodsFor(0), ['card']);
  const p = buildSessionParams({ ...base, paymentMethods: paymentMethodsFor(1) });
  assert.deepEqual(p.allowed_payment_method_types, ['card']);
});

test('la lámpara bajo pedido (stock NULL) acepta tarjeta y OXXO', () => {
  assert.deepEqual(paymentMethodsFor(null), ['card', 'oxxo']);
});

test('la metadata viaja completa para que el webhook arme el pedido', () => {
  const p = buildSessionParams(base);
  assert.deepEqual(p.metadata, base.metadata);
});

test('envío solo a México con teléfono', () => {
  const p = buildSessionParams(base);
  assert.deepEqual(p.shipping_address_collection?.allowed_countries, ['MX']);
  assert.equal(p.phone_number_collection?.enabled, true);
});

test('las URLs de regreso usan el origen del sitio', () => {
  const p = buildSessionParams(base);
  assert.equal(p.success_url, 'https://formamx.com/gracias?sid={CHECKOUT_SESSION_ID}');
  assert.equal(p.cancel_url, 'https://formamx.com/lampara');
});
