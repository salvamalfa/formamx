import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { construirFragmento, RAIZ, versionPrevia } from './build.ts';
import { parsearEdicion } from './edicion.ts';
import { BASE_IMAGENES } from './marca.ts';
import { leerPaleta } from './tokens.ts';
import { paraArtifact } from './vista.ts';

const paleta = leerPaleta(RAIZ);
const edicion = parsearEdicion(
  readFileSync(join(RAIZ, 'newsletter', 'ediciones', '2026-09-15-quinta-pantalla.md'), 'utf8'),
  'la edición de septiembre',
);
const fragmento = construirFragmento(edicion, paleta);
const pagina = paraArtifact(edicion, versionPrevia(fragmento, RAIZ), paleta);

test('es contenido de página, no un documento completo', () => {
  // El artifact envuelve lo que le das en su propio doctype/head/body.
  for (const etiqueta of ['<!doctype', '<html', '<head>', '<body']) {
    assert.ok(!pagina.toLowerCase().includes(etiqueta), `no debe traer ${etiqueta} propio`);
  }
  assert.match(pagina, /<title>Newsletter 001<\/title>/);
});

test('el correo va directo en el DOM de la página, no en un iframe', () => {
  // Dentro de un iframe la herramienta de comentarios no puede anclar un
  // comentario a un elemento del correo: por eso el fragmento va suelto.
  assert.ok(!pagina.includes('<iframe'), 'no debe usar iframe: rompe el comentario por elemento');
  assert.match(pagina, /<table role="presentation" class="w-full lienzo"/);
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
  // Sin iframe, el ancho móvil se fuerza por clase en vez de por viewport.
  assert.match(pagina, /forzar-movil/);
});

test('trae los dos temas con los que se revisa un correo', () => {
  assert.match(pagina, /data-tema="claro"/);
  assert.match(pagina, /data-tema="oscuro"/);
  // Igual que el ancho: sin iframe, el modo oscuro se fuerza por clase en
  // vez de por el tema del sistema, para que lo elija el botón.
  assert.match(pagina, /forzar-oscuro/);
  assert.ok(!pagina.includes('@media (prefers-color-scheme: dark) {\n    .cuerpo'), 'el modo oscuro del correo no debe depender del sistema aquí');
});

test('la página se adapta al tema del lector', () => {
  assert.match(pagina, /@media \(prefers-color-scheme: dark\)/);
  assert.match(pagina, /:root\[data-theme="dark"\]/);
  assert.match(pagina, /:root:not\(\[data-theme="light"\]\)/);
});

test('un correo ancho se desplaza dentro de su contenedor, no encoge la página', () => {
  assert.match(pagina, /\.escenario \{[^}]*overflow-x: auto/);
});
