import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

test('la paleta sale del design system con los valores de marca', () => {
  const p = leerPaleta(RAIZ);
  assert.equal(p.naranja, '#D06A2C', 'naranja: acción principal');
  assert.equal(p.azul, '#2E6DA4', 'azul taller: información');
  assert.equal(p.bosque, '#3E5A40', 'verde bosque: lo de afuera');
  assert.equal(p.tinta, '#1A1A18', 'tinta, nunca negro puro');
});

/**
 * Diferencias a propósito entre el design system y la copia del sitio. Van
 * aquí con su motivo para que el test siga cazando las que NO son a propósito.
 */
const DIVERGENCIAS_ACEPTADAS: Record<string, string> = {
  // brand.css lo explica en su propio comentario: en el kit este token es el
  // halo del Input (borde azul + halo azul claro), pero el sitio lo usa como
  // el trazo visible del focus-visible, y el halo solo no se vería.
  '--focus-ring': 'el sitio lo usa como trazo de foco, el kit como halo',
};

/**
 * La marca vive por duplicado: `ds-bundle/tokens/` es el design system que se
 * sincroniza con Claude Design, y `src/styles/brand.css` es la copia que
 * aplica el sitio. Nada vigilaba que no se separaran; ahora esto.
 */
test('las dos copias de la marca siguen diciendo lo mismo', () => {
  const sistema = resolverTokens(parsearTokens(readFileSync(join(RAIZ, 'ds-bundle', 'tokens', 'colors.css'), 'utf8')));
  const sitio = resolverTokens(parsearTokens(readFileSync(join(RAIZ, 'src', 'styles', 'brand.css'), 'utf8')));

  const diferencias: string[] = [];
  for (const [token, valor] of sistema) {
    const enElSitio = sitio.get(token);
    if (enElSitio === undefined) continue; // el sitio no copia todos
    if (token in DIVERGENCIAS_ACEPTADAS) continue;
    if (normalizarHex(valor) !== normalizarHex(enElSitio)) {
      diferencias.push(`${token}: ds-bundle ${valor} vs brand.css ${enElSitio}`);
    }
  }
  assert.deepEqual(diferencias, [], `ds-bundle/tokens/colors.css y src/styles/brand.css se separaron:\n${diferencias.join('\n')}`);
});
