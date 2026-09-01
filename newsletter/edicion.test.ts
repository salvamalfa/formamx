import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { parsearEdicion } from './edicion.ts';

const CABECERA = `---
edicion: 3
fecha: 2026-09-15
asunto: Un asunto
preheader: Un preheader
---
`;

test('lee el frontmatter y los bloques', () => {
  const e = parsearEdicion(`${CABECERA}
## entrada
titulo: Terminé la quinta pantalla

Primer párrafo.

Segundo párrafo.
`);
  assert.equal(e.numero, 3);
  assert.equal(e.asunto, 'Un asunto');
  assert.equal(e.bloques.length, 1);
  const bloque = e.bloques[0];
  assert.ok(bloque?.tipo === 'entrada');
  assert.equal(bloque.titulo, 'Terminé la quinta pantalla');
  assert.deepEqual(bloque.parrafos, ['Primer párrafo.', 'Segundo párrafo.']);
});

test('un párrafo partido en varias líneas se junta en una', () => {
  const e = parsearEdicion(`${CABECERA}
## nota
titulo: Lo que no salió

Una frase
que sigue en la línea de abajo.
`);
  const bloque = e.bloques[0];
  assert.ok(bloque?.tipo === 'nota');
  assert.deepEqual(bloque.parrafos, ['Una frase que sigue en la línea de abajo.']);
});

test('un "clave: valor" dentro de la prosa es texto, no un atributo', () => {
  const e = parsearEdicion(`${CABECERA}
## nota
titulo: Lo que no salió

Lo intenté dos veces.

Nota: la segunda salió mejor.
`);
  const bloque = e.bloques[0];
  assert.ok(bloque?.tipo === 'nota');
  assert.deepEqual(bloque.parrafos, ['Lo intenté dos veces.', 'Nota: la segunda salió mejor.']);
});

test('la galería junta los "item:" repetidos y parte el enlace', () => {
  const e = parsearEdicion(`${CABECERA}
## galeria
titulo: Las otras
item: a.jpg | Pantalla A | Torsion
item: b.jpg | Pantalla B | Diamond
enlace: Ver las cinco | https://formamx.com/lampara
`);
  const bloque = e.bloques[0];
  assert.ok(bloque?.tipo === 'galeria');
  assert.equal(bloque.items.length, 2);
  assert.deepEqual(bloque.items[1], { imagen: 'b.jpg', alt: 'Pantalla B', pie: 'Diamond' });
  assert.equal(bloque.enlace?.url, 'https://formamx.com/lampara');
});

test('un bloque desconocido dice cuáles existen', () => {
  assert.throws(() => parsearEdicion(`${CABECERA}\n## inventado\ntitulo: X\n`), /entrada, pieza, accion/);
});

test('un atributo obligatorio que falta se nombra', () => {
  assert.throws(() => parsearEdicion(`${CABECERA}\n## pieza\nimagen: a.jpg\nalt: Una lámpara\n`), /"meta:"/);
});

test('sin frontmatter no hay edición', () => {
  assert.throws(() => parsearEdicion('## entrada\ntitulo: X\n'), /frontmatter/);
});

test('sin bloques tampoco', () => {
  assert.throws(() => parsearEdicion(CABECERA), /ningún bloque/);
});

test('los saltos de línea de Windows no estorban', () => {
  const e = parsearEdicion(`${CABECERA.replace(/\n/g, '\r\n')}\r\n## entrada\r\ntitulo: X\r\n\r\nHola.\r\n`);
  assert.equal(e.bloques.length, 1);
});
