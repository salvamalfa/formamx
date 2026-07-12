// @ts-check
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

import preact from '@astrojs/preact';

// La CSP de Astro (security.csp) hashea sus bloques <style> de islands, y en
// cuanto aparece un hash el navegador IGNORA 'unsafe-inline' para style-src.
// Eso bloquearía los atributos style= de la marca y los swatches dinámicos de
// color de las islands (imposibles de volver clases). Este hook reescribe SOLO
// el style-src del <meta> a 'self' 'unsafe-inline' (sin hashes), dejando
// intactos los hashes de script-src, que son la defensa real del token.
function cspLenientStyleSrc() {
  return {
    name: 'csp-lenient-style-src',
    hooks: {
      'astro:build:done': async (/** @type {{ dir: URL }} */ { dir }) => {
        const root = fileURLToPath(dir);
        const walk = async (/** @type {string} */ d) => {
          const entries = await readdir(d, { withFileTypes: true });
          for (const e of entries) {
            const full = path.join(d, e.name);
            if (e.isDirectory()) await walk(full);
            else if (e.name.endsWith('.html')) {
              const html = await readFile(full, 'utf8');
              const fixed = html.replace(
                /(http-equiv="content-security-policy" content="[^"]*?)style-src[^";]*/i,
                "$1style-src 'self' 'unsafe-inline'",
              );
              if (fixed !== html) await writeFile(full, fixed);
            }
          }
        };
        await walk(root);
      },
    },
  };
}

export default defineConfig({
  output: 'static',
  site: 'https://formamx.com',

  // CSP: Astro emite un <meta> por página y hashea sus propios scripts inline
  // de hidratación (islands), así que script-src queda en 'self' + hashes SIN
  // 'unsafe-inline'. Eso cierra el robo del token de /taller por XSS
  // (localStorage es por-origen). style-src permite inline por los atributos
  // style= de la marca (no hay bloques <style>). frame-ancestors no aplica en
  // <meta>: el anti-clickjacking va por X-Frame-Options en public/.htaccess.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self' https://formamx-api.formamx.workers.dev",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
      scriptDirective: { resources: ["'self'"] },
      styleDirective: { resources: ["'self'", "'unsafe-inline'"] },
    },
  },

  // El dev server usa el puerto que asigne el entorno (PORT), con 4321 de reserva.
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 4321,
  },

  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [preact(), cspLenientStyleSrc()],
});