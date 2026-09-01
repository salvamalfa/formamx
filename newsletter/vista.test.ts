import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { construir, RAIZ, versionPrevia } from './build.ts';
import { parsearEdicion } from './edicion.ts';
import { BASE_IMAGENES } from './marca.ts';
import { leerPaleta } from './tokens.ts';
import { paraArtifact } from './vista.ts';

const paleta = leerPaleta(RAIZ);
const edicion = parsearEdicion(
  readFileSync(join(RAIZ, 'newsletter', 'ediciones', '2026-09-15-ejemplo.md'), 'utf8'),
  'la edición de ejemplo',
);
const correo = construir(edicion, paleta);
const pagina = paraArtifact(edicion, versionPrevia(correo, RAIZ), paleta);

test('es contenido de página, no un documento completo', () => {
  // El artifact envuelve lo que le das en su propio doctype/head/body.
  for (const etiqueta of ['<!doctype', '<html', '<head>', '<body']) {
    assert.ok(!pagina.toLowerCase().includes(etiqueta), `no debe traer ${etiqueta} propio`);
  }
  assert.match(pagina, /<title>Newsletter 001<\/title>/);
});

test('el correo va dentro del iframe, escapado', () => {
  assert.match(pagina, /<iframe[^>]*\bsrcdoc="/);
  // Si el HTML del correo entrara sin escapar, sus comillas cerrarían el
  // atributo y la página saldría partida a la mitad.
  const srcdoc = /\bsrcdoc="([\s\S]*?)"\s*>/.exec(pagina)?.[1];
  assert.ok(srcdoc, 'no encontré el srcdoc');
  assert.ok(!srcdoc.includes('"'), 'quedó una comilla sin escapar dentro del srcdoc');
  assert.match(srcdoc, /&lt;!doctype html&gt;/i, 'el correo sí conserva su propio documento');
});

/**
 * La CSP del artifact solo deja salir a Google Fonts. Si a esta página le
 * llega el HTML con las imágenes por URL en vez de incrustadas, el correo se
 * publica sin una sola imagen y no avisa nadie.
 */
test('no queda ninguna imagen apuntando fuera', () => {
  assert.ok(!pagina.includes(BASE_IMAGENES), 'hay imágenes por URL; usa versionPrevia() antes');
  assert.match(pagina, /data:image\/jpeg;base64,/);
});

test('trae los dos anchos con los que se revisa un correo', () => {
  assert.match(pagina, /data-ancho="600"/);
  assert.match(pagina, /data-ancho="390"/);
});

test('la página se adapta al tema del lector', () => {
  assert.match(pagina, /@media \(prefers-color-scheme: dark\)/);
  assert.match(pagina, /:root\[data-theme="dark"\]/);
  assert.match(pagina, /:root:not\(\[data-theme="light"\]\)/);
});

test('un correo ancho se desplaza dentro de su contenedor, no encoge la página', () => {
  assert.match(pagina, /\.escenario \{[^}]*overflow-x: auto/);
});
