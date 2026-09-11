import type { FullConfig } from '@playwright/test';

// Guardia contra servidores ajenos.
//
// `astro dev` NO falla si su puerto está ocupado: se mueve al siguiente libre
// (4321 → 4322) sin avisar. Playwright, mientras tanto, sigue esperando en
// `webServer.url`; si ahí contesta otra app, la suite entera corre contra ella
// y los errores salen como violaciones de modo estricto o textos que no
// existen en este sitio. Pasó en el run 34551172325 de master.
//
// Esto lo convierte en un error de una línea, antes del primer test: se pide
// la portada y se exige el <link rel="canonical"> de formamx.com, que
// BaseLayout emite en todas las páginas.
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL;
  if (!baseURL) return;

  const res = await fetch(baseURL);
  const html = await res.text();

  if (!/<link rel="canonical" href="https:\/\/formamx\.com/.test(html)) {
    const titulo = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? '(sin <title>)';
    throw new Error(
      `${baseURL} no está sirviendo formamx: falta el <link rel="canonical"> de formamx.com. ` +
        `La página que contestó dice <title>${titulo}</title> (HTTP ${res.status}). ` +
        `Seguramente otro proceso tomó el puerto y el dev server de Astro se movió al siguiente.`,
    );
  }
}
