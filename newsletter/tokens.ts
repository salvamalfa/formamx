// Los tokens de marca viven como CSS y el correo no puede usarlos: las
// variables CSS no existen en Outlook ni en Gmail. Este módulo los lee y los
// resuelve a hex literales, para hornearlos en estilos en línea al construir
// el correo.
//
// La fuente es `ds-bundle/tokens/`, que es el design system sincronizado con
// Claude Design. `src/styles/brand.css` es la copia que aplica el sitio;
// tokens.test.ts comprueba que las dos no se hayan separado, porque hoy nada
// más lo vigila.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Colores de marca que usa el correo, ya resueltos a hex. */
export type Paleta = {
  blanco: string;
  hueso: string;
  borde: string;
  gris: string;
  grisClaro: string;
  tinta: string;
  azul: string;
  azulOscuro: string;
  azulNoche: string;
  naranja: string;
  naranjaOscuro: string;
  naranjaNoche: string;
  naranjaSombra: string;
  bosque: string;
  bosqueClaro: string;
  bosqueNoche: string;
  bosqueSombra: string;
};

/** Nombre del token CSS por cada campo de la paleta. */
const MAPA: Record<keyof Paleta, string> = {
  blanco: '--blanco',
  hueso: '--hueso',
  borde: '--borde',
  gris: '--gris',
  grisClaro: '--gris-claro',
  tinta: '--tinta',
  azul: '--azul',
  azulOscuro: '--azul-oscuro',
  azulNoche: '--azul-noche',
  naranja: '--naranja',
  naranjaOscuro: '--naranja-oscuro',
  naranjaNoche: '--naranja-noche',
  naranjaSombra: '--naranja-sombra',
  bosque: '--bosque',
  bosqueClaro: '--bosque-claro',
  bosqueNoche: '--bosque-noche',
  bosqueSombra: '--bosque-sombra',
};

/** Saca las declaraciones `--token: valor;` de un CSS, ignorando comentarios. */
export function parsearTokens(css: string): Map<string, string> {
  const limpio = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const tokens = new Map<string, string>();
  for (const [, nombre, valor] of limpio.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    if (nombre && valor) tokens.set(nombre.toLowerCase(), valor.trim());
  }
  return tokens;
}

/**
 * Resuelve las referencias `var(--otro)` hasta dejar solo valores literales.
 * Los semánticos de la marca (`--action`, `--accent`...) apuntan a los colores
 * base, así que sin esto saldrían literales `var(--naranja)` dentro del correo.
 */
export function resolverTokens(tokens: Map<string, string>): Map<string, string> {
  const resueltos = new Map<string, string>();
  for (const nombre of tokens.keys()) resueltos.set(nombre, resolverUno(nombre, tokens, new Set()));
  return resueltos;
}

function resolverUno(nombre: string, tokens: Map<string, string>, visitados: Set<string>): string {
  const valor = tokens.get(nombre);
  if (valor === undefined) throw new Error(`Token de marca inexistente: ${nombre}`);
  if (visitados.has(nombre)) throw new Error(`Referencia circular en el token ${nombre}`);
  visitados.add(nombre);
  return valor.replace(/var\(\s*(--[a-z0-9-]+)\s*\)/gi, (_, ref: string) =>
    resolverUno(ref.toLowerCase(), tokens, visitados),
  );
}

/** Lee la paleta del design system. `raiz` es la raíz del repo. */
export function leerPaleta(raiz: string): Paleta {
  const css = readFileSync(join(raiz, 'ds-bundle', 'tokens', 'colors.css'), 'utf8');
  const resueltos = resolverTokens(parsearTokens(css));
  const paleta = {} as Paleta;
  for (const [campo, token] of Object.entries(MAPA) as [keyof Paleta, string][]) {
    const valor = resueltos.get(token);
    if (valor === undefined) {
      throw new Error(`El design system ya no define ${token}; actualiza newsletter/tokens.ts`);
    }
    // El correo es más seguro en mayúsculas y forma larga; los clientes viejos
    // se atragantan con hex de 3 dígitos en algunos atributos.
    paleta[campo] = normalizarHex(valor);
  }
  return paleta;
}

/** #abc -> #AABBCC. Deja intacto lo que no sea hex. */
export function normalizarHex(valor: string): string {
  const corto = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(valor.trim());
  if (corto) return `#${corto[1]}${corto[1]}${corto[2]}${corto[2]}${corto[3]}${corto[3]}`.toUpperCase();
  return /^#[0-9a-f]{6}$/i.test(valor.trim()) ? valor.trim().toUpperCase() : valor.trim();
}
