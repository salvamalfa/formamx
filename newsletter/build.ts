// CLI: convierte las ediciones de `newsletter/ediciones/` en HTML de correo.
//
//   npm run newsletter:build            todas las ediciones
//   npm run newsletter:build -- 2026-09 solo las que empiecen así
//   npm run newsletter:check            solo revisa, no escribe nada
//
// El HTML sale a `newsletter/dist/` (ignorado por git) y de ahí se sube a
// Reach a mano: su API no deja crear ni mandar campañas. Ver docs/MARKETING.md.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { dibujarBloque } from './bloques.ts';
import { parsearEdicion, type Edicion } from './edicion.ts';
import { envolver } from './layout.ts';
import { revisar } from './lint.ts';
import { BASE_IMAGENES } from './marca.ts';
import { leerPaleta, type Paleta } from './tokens.ts';

export const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const EDICIONES = join(RAIZ, 'newsletter', 'ediciones');
const SALIDA = join(RAIZ, 'newsletter', 'dist');

/** Arma el HTML del correo a partir de una edición ya parseada. */
export function construir(edicion: Edicion, paleta: Paleta): string {
  const filas = edicion.bloques.map((b) => dibujarBloque(b, paleta)).join('\n');
  return envolver(edicion, filas, paleta);
}

/**
 * El HTML bueno apunta a las imágenes de formamx.com, que solo existen después
 * de desplegar. Para poder mirar una edición ANTES de subirla, esta copia trae
 * las imágenes incrustadas: se abre en cualquier navegador y se puede mandar
 * como archivo suelto. Es solo para mirar; lo que se sube a Reach es el otro.
 */
export function versionPrevia(html: string, raiz: string): string {
  const tipos: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };
  return html.replaceAll(new RegExp(`${BASE_IMAGENES}/([^"]+)`, 'g'), (original, ruta: string) => {
    const archivo = join(raiz, 'public', 'newsletter', ruta);
    const tipo = tipos[extname(ruta).toLowerCase()];
    if (!tipo || !existsSync(archivo)) {
      console.error(`   aviso  la imagen ${ruta} no existe en public/newsletter/`);
      return original;
    }
    return `data:${tipo};base64,${readFileSync(archivo).toString('base64')}`;
  });
}

function main(): void {
  const args = process.argv.slice(2);
  const soloRevisar = args.includes('--revisar');
  const filtro = args.find((a) => !a.startsWith('--'));

  const archivos = readdirSync(EDICIONES)
    .filter((n) => n.endsWith('.md'))
    .filter((n) => !filtro || n.startsWith(filtro))
    .sort();

  if (!archivos.length) {
    console.error(filtro ? `Ninguna edición empieza con "${filtro}".` : 'No hay ediciones en newsletter/ediciones/.');
    process.exit(1);
  }

  const paleta = leerPaleta(RAIZ);
  let hayErrores = false;

  for (const archivo of archivos) {
    let edicion: Edicion;
    try {
      edicion = parsearEdicion(readFileSync(join(EDICIONES, archivo), 'utf8'), archivo);
    } catch (e) {
      console.error(`\n  ${archivo}\n   ${e instanceof Error ? e.message : String(e)}`);
      hayErrores = true;
      continue;
    }

    const { errores, avisos } = revisar(edicion);
    console.log(`\n  ${archivo}  ·  "${edicion.asunto}"`);
    for (const aviso of avisos) console.log(`   aviso  ${aviso}`);
    for (const error of errores) console.error(`   error  ${error}`);

    if (errores.length) {
      hayErrores = true;
      continue;
    }
    if (soloRevisar) {
      console.log('   sin errores');
      continue;
    }

    mkdirSync(SALIDA, { recursive: true });
    const nombre = archivo.replace(/\.md$/, '');
    const html = construir(edicion, paleta);
    writeFileSync(join(SALIDA, `${nombre}.html`), html, 'utf8');
    writeFileSync(join(SALIDA, `${nombre}.preview.html`), versionPrevia(html, RAIZ), 'utf8');
    console.log(`   para Reach   newsletter/dist/${nombre}.html`);
    console.log(`   para mirar   newsletter/dist/${nombre}.preview.html`);
  }

  if (hayErrores) {
    console.error('\nHay ediciones con errores. No se escribió nada para esas.\n');
    process.exit(1);
  }
  console.log(
    soloRevisar ? '\nTodo en orden.\n' : '\nListo. Sube el HTML a Reach y mándate una prueba antes del envío real.\n',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
