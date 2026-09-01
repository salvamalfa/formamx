// Invariantes del HTML que sale. Son las reglas que hacen que un correo se vea
// igual en Outlook que en Gmail, y son fáciles de romper sin notarlo al tocar
// un bloque.

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { construir, RAIZ } from './build.ts';
import { enriquecer, escapar, urlImagen } from './bloques.ts';
import { parsearEdicion } from './edicion.ts';
import { mesLargo } from './layout.ts';
import { leerPaleta } from './tokens.ts';

const paleta = leerPaleta(RAIZ);
const edicion = parsearEdicion(
  readFileSync(join(RAIZ, 'newsletter', 'ediciones', '2026-09-15-ejemplo.md'), 'utf8'),
  'la edición de ejemplo',
);
const html = construir(edicion, paleta);

test('no queda ninguna variable CSS sin hornear', () => {
  assert.doesNotMatch(html, /var\(--/, 'el correo no puede usar variables CSS');
});

test('no hay flexbox ni grid: en correo no existen', () => {
  assert.doesNotMatch(html, /display\s*:\s*(flex|grid)/);
});

test('el lienzo mide 600px y se vuelve fluido en móvil', () => {
  assert.match(html, /width:600px;max-width:600px/);
  assert.match(html, /@media only screen and \(max-width: 620px\)/);
  assert.match(html, /\.w-full \{ width: 100% !important/);
});

test('todas las imágenes llevan alt y ancho', () => {
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(imgs.length >= 5, `esperaba varias imágenes, encontré ${imgs.length}`);
  for (const img of imgs) {
    assert.match(img, /\salt="[^"]/, `sin alt: ${img.slice(0, 80)}`);
    assert.match(img, /\swidth="\d+"/, `sin width: ${img.slice(0, 80)}`);
  }
});

test('todas las URL son absolutas', () => {
  for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (url === undefined) continue;
    assert.ok(/^https?:\/\//.test(url), `URL relativa en el correo: ${url}`);
  }
});

test('el cuerpo se lee a 16px', () => {
  assert.match(html, /font-size:16px;line-height:1\.6/);
});

test('hay un solo botón naranja: la acción principal', () => {
  const naranjas = [...html.matchAll(new RegExp(`background-color:${paleta.naranja}`, 'gi'))];
  assert.equal(naranjas.length, 1, 'la marca permite un primario por vista');
});

/**
 * Este test existe por un error real: el modo oscuro apuntaba a clases que
 * nadie tenía puestas, así que el fondo se oscurecía y el texto se quedaba
 * negro sobre negro. Desde el HTML no se nota hasta que abres el correo con
 * el móvil en oscuro.
 */
test('cada clase del modo oscuro existe de verdad en el HTML', () => {
  const bloque = /@media \(prefers-color-scheme: dark\) \{([\s\S]*?)\n  \}/.exec(html);
  assert.ok(bloque?.[1], 'no encontré el bloque de modo oscuro');
  const clases = new Set([...bloque[1].matchAll(/\.([a-z][a-z-]*)/g)].map((m) => m[1]));
  assert.ok(clases.size >= 8, `esperaba varias clases, encontré ${clases.size}`);
  for (const clase of clases) {
    assert.match(
      html,
      new RegExp(`class="[^"]*\\b${clase}\\b`),
      `el modo oscuro estiliza .${clase}, pero ningún elemento la lleva`,
    );
  }
});

test('el mismo cuidado para las clases de móvil', () => {
  const bloque = /@media only screen and \(max-width: 620px\) \{([\s\S]*?)\n  \}/.exec(html);
  assert.ok(bloque?.[1]);
  for (const [, clase] of bloque[1].matchAll(/\.([a-z][a-z0-9-]*)/g)) {
    assert.match(html, new RegExp(`class="[^"]*\\b${clase}\\b`), `.${clase} no la lleva ningún elemento`);
  }
});

test('la razón social y el domicilio van en el pie', () => {
  assert.match(html, /FORMA WORKS, S\.A\.S\./);
  assert.match(html, /Camino San Juan de Aragón 215/);
});

test('no maquetamos nuestro propio enlace de baja: lo pone Reach', () => {
  assert.doesNotMatch(html, /darte de baja|unsubscribe|cancelar suscripción/i);
});

test('el preheader va oculto al principio', () => {
  assert.match(html, /max-height:0;max-width:0;opacity:0/);
  assert.ok(html.indexOf(edicion.preheader) < html.indexOf('<table'), 'el preheader va antes del contenido');
});

test('pesa bastante menos de los 102 KB en los que Gmail recorta', () => {
  const kb = Buffer.byteLength(html, 'utf8') / 1024;
  assert.ok(kb < 60, `el correo pesa ${kb.toFixed(1)} KB`);
});

test('escapar: el HTML del texto no se cuela', () => {
  assert.equal(escapar('<b>"a" & b</b>'), '&lt;b&gt;&quot;a&quot; &amp; b&lt;/b&gt;');
});

test('enriquecer: enlaces y negritas, y nada más', () => {
  const salida = enriquecer('Mira [esto](https://formamx.com) y **esto**.', paleta);
  assert.match(salida, /<a href="https:\/\/formamx\.com"/);
  assert.match(salida, /<strong style="font-weight:700;">esto<\/strong>/);
  assert.doesNotMatch(enriquecer('<script>x</script>', paleta), /<script>/);
});

test('urlImagen: relativa cuelga del sitio, absoluta se respeta', () => {
  assert.equal(urlImagen('2026-09-15/a.jpg'), 'https://formamx.com/newsletter/2026-09-15/a.jpg');
  assert.equal(urlImagen('https://otro.com/a.jpg'), 'https://otro.com/a.jpg');
});

test('mesLargo: la metadata de cabecera va en español', () => {
  assert.equal(mesLargo('2026-09-15'), 'septiembre de 2026');
  assert.equal(mesLargo('2026-01-01'), 'enero de 2026');
  assert.throws(() => mesLargo('15/09/2026'), /AAAA-MM-DD/);
});
