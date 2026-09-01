// Reglas que una edición tiene que cumplir antes de salir. Existen porque la
// marca es fácil de erosionar sin darse cuenta: un emoji aquí, un "no te lo
// pierdas" allá, y a la tercera edición el correo ya no suena a forma.
//
// Corre en CI, así que un PR con una edición mal escrita no pasa.

import type { Edicion } from './edicion.ts';

/** Frases de marketing que la guía de voz prohíbe explícitamente. */
const JERGA = [
  'no te lo pierdas',
  'calidad premium',
  'edicion limitada',
  'edición limitada',
  'oferta unica',
  'oferta única',
  'ultima oportunidad',
  'última oportunidad',
  'haz clic aqui',
  'haz clic aquí',
];

const EMOJI = /\p{Extended_Pictographic}/u;
const ENLACE_MARKDOWN = /\[([^\]]+)\]\(([^)\s]+)\)/g;
const PLACEHOLDER = /\[[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{2,}\]/;

/**
 * Los errores bloquean el build; los avisos solo se imprimen. La diferencia es
 * si el correo saldría roto o solo mejorable: un enlace relativo no funciona
 * para nadie, un asunto de 62 caracteres nada más se corta un poco.
 */
export type Revision = { errores: string[]; avisos: string[] };

export function revisar(edicion: Edicion): Revision {
  const errores: string[] = [];
  const avisos: string[] = [];
  const error = (donde: string, que: string): void => {
    errores.push(`${donde}: ${que}`);
  };
  const aviso = (donde: string, que: string): void => {
    avisos.push(`${donde}: ${que}`);
  };

  if (edicion.asunto.length > 60) {
    aviso('asunto', `${edicion.asunto.length} caracteres; pasando de 60 se corta en la bandeja`);
  }
  if (edicion.preheader.length > 100) {
    aviso('preheader', `${edicion.preheader.length} caracteres; pasando de 100 no se ve el final`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(edicion.fecha)) {
    error('fecha', `"${edicion.fecha}" no está en formato AAAA-MM-DD`);
  }

  for (const [indice, bloque] of edicion.bloques.entries()) {
    const donde = `bloque ${indice + 1} (${bloque.tipo})`;
    for (const texto of textosDe(bloque)) revisarTexto(texto, donde, error);
    for (const url of urlsDe(bloque)) {
      if (!/^https?:\/\//.test(url)) {
        error(donde, `el enlace "${url}" es relativo; en un correo todas las URL van absolutas`);
      }
    }
    for (const alt of altsDe(bloque)) {
      if (alt.trim().length < 3) error(donde, 'una imagen tiene el alt vacío o demasiado corto');
    }
  }

  revisarTexto(edicion.asunto, 'asunto', error);
  revisarTexto(edicion.preheader, 'preheader', error);

  const primarios = edicion.bloques.filter((b) => b.tipo === 'accion').length;
  if (primarios > 1) {
    error('edición', `${primarios} bloques "accion"; la marca permite un solo botón primario por vista`);
  }
  return { errores, avisos };
}

function revisarTexto(texto: string, donde: string, error: (d: string, q: string) => void): void {
  if (EMOJI.test(texto)) error(donde, 'trae un emoji, y la marca no los usa nunca');
  if (texto.includes('—')) error(donde, 'trae un guion largo (—); usa punto, coma o dos puntos');
  if (texto.includes('!') || texto.includes('¡')) {
    error(donde, 'trae una exclamación; el tono de la bitácora no las usa');
  }
  if (PLACEHOLDER.test(texto)) {
    error(donde, `quedó un hueco sin llenar: ${PLACEHOLDER.exec(texto)?.[0] ?? ''}`);
  }
  const minusculas = texto.toLowerCase();
  for (const frase of JERGA) {
    if (minusculas.includes(frase)) error(donde, `jerga de marketing: "${frase}"`);
  }
  for (const [, , url] of texto.matchAll(ENLACE_MARKDOWN)) {
    if (url && !/^https?:\/\//.test(url)) {
      error(donde, `el enlace "${url}" es relativo; en un correo todas las URL van absolutas`);
    }
  }
}

function textosDe(bloque: Edicion['bloques'][number]): string[] {
  switch (bloque.tipo) {
    case 'entrada':
    case 'nota':
      return [bloque.titulo, ...bloque.parrafos];
    case 'afuera':
      return [bloque.etiqueta, bloque.titulo, ...bloque.parrafos];
    case 'accion':
      return [...bloque.parrafos, bloque.boton];
    case 'pieza':
      return [bloque.meta, bloque.alt];
    case 'galeria':
      return [
        bloque.titulo,
        ...bloque.items.flatMap((i) => [i.pie, i.alt]),
        ...(bloque.enlace ? [bloque.enlace.texto] : []),
      ];
  }
}

function urlsDe(bloque: Edicion['bloques'][number]): string[] {
  if (bloque.tipo === 'accion') return [bloque.url];
  if (bloque.tipo === 'galeria' && bloque.enlace) return [bloque.enlace.url];
  return [];
}

function altsDe(bloque: Edicion['bloques'][number]): string[] {
  if (bloque.tipo === 'pieza') return [bloque.alt];
  if (bloque.tipo === 'galeria') return bloque.items.map((i) => i.alt);
  return [];
}
