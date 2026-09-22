import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { RAIZ } from './build.ts';
import { leerPaleta, normalizarHex, parsearTokens, resolverTokens } from './tokens.ts';

test('parsear: saca las declaraciones y descarta los comentarios', () => {
  const tokens = parsearTokens('/* --falso: #000; */ :root { --azul: #2E6DA4; --hueso: #F7F7F5; }');
  assert.equal(tokens.size, 2);
  assert.equal(tokens.get('--azul'), '#2E6DA4');
  assert.equal(tokens.get('--falso'), undefined);
});

test('resolver: los semánticos apuntan al color base, no a un var() literal', () => {
  const resueltos = resolverTokens(parsearTokens(':root{--naranja:#D06A2C;--action:var(--naranja);--action-hover:var(--action);}'));
  assert.equal(resueltos.get('--action'), '#D06A2C');
  assert.equal(resueltos.get('--action-hover'), '#D06A2C');
});

test('resolver: una referencia circular truena en vez de colgarse', () => {
  assert.throws(
    () => resolverTokens(parsearTokens(':root{--a:var(--b);--b:var(--a);}')),
    /circular/,
  );
});

test('normalizarHex: los hex de 3 dígitos se expanden', () => {
  assert.equal(normalizarHex('#abc'), '#AABBCC');
  assert.equal(normalizarHex('#2e6da4'), '#2E6DA4');
});

test('la paleta sale de brand.css con los valores de marca', () => {
  const p = leerPaleta(RAIZ);
  assert.equal(p.naranja, '#D06A2C', 'naranja: acción principal');
  assert.equal(p.azul, '#2E6DA4', 'azul taller: información');
  assert.equal(p.bosque, '#3E5A40', 'verde bosque: lo de afuera');
  assert.equal(p.tinta, '#1A1A18', 'tinta, nunca negro puro');
});
