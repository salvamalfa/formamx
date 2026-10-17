// Los tests corren con node --experimental-strip-types, que no resuelve
// imports sin extensión. El código del worker (y src/config del sitio) los usa
// porque wrangler sí los resuelve; este hook agrega `.ts` cuando el archivo
// existe, solo para los tests.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier) && context.parentURL) {
    const url = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(fileURLToPath(url))) return next(url.href, context);
  }
  return next(specifier, context);
}

