import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { parsearEdicion } from './edicion.ts';
import { revisar } from './lint.ts';

function conEntrada(cuerpo: string, asunto = 'Un asunto', preheader = 'Un preheader'): ReturnType<typeof revisar> {
  return revisar(
    parsearEdicion(`---
edicion: 1
fecha: 2026-09-15
asunto: ${asunto}
preheader: ${preheader}
---

## entrada
titulo: Un título

${cuerpo}
`),
  );
}

test('una edición limpia pasa', () => {
  const { errores, avisos } = conEntrada('Bajé la altura de capa a 0.16 mm y aguantó.');
  assert.deepEqual(errores, []);
  assert.deepEqual(avisos, []);
});

test('un emoji la detiene', () => {
  assert.match(conEntrada('Quedó bien 🎉').errores.join('\n'), /emoji/);
});

test('un guion largo la detiene', () => {
  assert.match(conEntrada('Quedó bien — muy bien.').errores.join('\n'), /guion largo/);
});

test('una exclamación la detiene', () => {
  assert.match(conEntrada('¡Quedó bien!').errores.join('\n'), /exclamación/);
});

test('la jerga de marketing la detiene', () => {
  assert.match(conEntrada('Calidad premium, no te lo pierdas.').errores.join('\n'), /jerga de marketing/);
});

test('un hueco sin llenar la detiene', () => {
  assert.match(conEntrada('Sale el [MES] que viene.').errores.join('\n'), /hueco sin llenar/);
});

test('un enlace relativo en la prosa la detiene', () => {
  assert.match(conEntrada('Míralo en [el sitio](/lampara).').errores.join('\n'), /relativo/);
});

test('un enlace absoluto en la prosa pasa', () => {
  assert.deepEqual(conEntrada('Míralo en [el sitio](https://formamx.com/lampara).').errores, []);
});

test('el botón con URL relativa la detiene', () => {
  const revision = revisar(
    parsearEdicion(`---
edicion: 1
fecha: 2026-09-15
asunto: Un asunto
preheader: Un preheader
---

## accion
boton: Armar mi lámpara
url: /lampara

Cinco pantallas.
`),
  );
  assert.match(revision.errores.join('\n'), /relativo/);
});

test('dos botones primarios la detienen: la marca permite uno', () => {
  const dos = `## accion
boton: Uno
url: https://formamx.com/a

Texto.

## accion
boton: Dos
url: https://formamx.com/b

Texto.
`;
  const revision = revisar(
    parsearEdicion(`---
edicion: 1
fecha: 2026-09-15
asunto: Un asunto
preheader: Un preheader
---

${dos}`),
  );
  assert.match(revision.errores.join('\n'), /un solo botón primario/);
});

test('un alt vacío la detiene', () => {
  const revision = revisar(
    parsearEdicion(`---
edicion: 1
fecha: 2026-09-15
asunto: Un asunto
preheader: Un preheader
---

## pieza
imagen: a.jpg
alt: x
meta: Tessera
`),
  );
  assert.match(revision.errores.join('\n'), /alt/);
});

test('un asunto largo solo avisa, no detiene', () => {
  const largo = 'Terminé la quinta pantalla y también la sexta y la séptima por si acaso';
  const { errores, avisos } = conEntrada('Todo bien.', largo);
  assert.deepEqual(errores, []);
  assert.match(avisos.join('\n'), /asunto/);
});
