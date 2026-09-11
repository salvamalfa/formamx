// Cada bloque se dibuja como una fila de la tabla del correo. Todo va en
// tablas y con estilos en línea a propósito: es lo único que se comporta igual
// en Outlook, Gmail y Apple Mail.
//
// Las clases (`px`, `h1`, `h2`) solo sirven para el <style> del layout, que
// ajusta el móvil. Si un cliente las ignora, el correo se sigue viendo: el
// estilo en línea ya lo dejó bien en escritorio.

import type { Bloque, ItemGaleria } from './edicion.ts';
import { BASE_IMAGENES, FUENTE, MARGEN } from './marca.ts';
import type { Paleta } from './tokens.ts';

export function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Escapa y traduce el markdown mínimo que admite la prosa: enlaces y negritas. */
export function enriquecer(texto: string, p: Paleta): string {
  return escapar(texto)
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      (_, rotulo: string, url: string) =>
        `<a href="${url}" class="enlace" style="color:${p.azul};text-decoration:underline;">${rotulo}</a>`,
    )
    .replace(/\*\*([^*]+)\*\*/g, '<strong style="font-weight:700;">$1</strong>');
}

/** Una imagen del correo. Las rutas relativas cuelgan de formamx.com/newsletter. */
export function urlImagen(ruta: string): string {
  return /^https?:\/\//.test(ruta) ? ruta : `${BASE_IMAGENES}/${ruta.replace(/^\/+/, '')}`;
}

const parrafo = (texto: string, p: Paleta): string =>
  `<p class="texto" style="margin:0 0 16px 0;font-family:${FUENTE};font-size:16px;line-height:1.6;color:${p.tinta};">${enriquecer(texto, p)}</p>`;

const parrafos = (textos: string[], p: Paleta): string =>
  textos.map((t) => parrafo(t, p)).join('\n        ');

/** Metadata de la bitácora: 700, mayúsculas, tracking amplio, en azul taller. */
const meta = (texto: string, p: Paleta, color = p.azul): string =>
  `<div class="meta" style="font-family:${FUENTE};font-size:12px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${color};">${escapar(texto)}</div>`;

const titulo = (texto: string, tam: number, p: Paleta, clase: string): string =>
  `<h${tam === 32 ? '1' : '2'} class="${clase} titulo" style="margin:0 0 20px 0;font-family:${FUENTE};font-size:${tam}px;font-weight:700;line-height:1.2;letter-spacing:-0.3px;color:${p.tinta};">${escapar(texto)}</h${tam === 32 ? '1' : '2'}>`;

/** Fila con el aire lateral estándar. `fondo` pinta una banda de sección. */
const fila = (contenido: string, opciones: { fondo?: string; arriba?: number; abajo?: number } = {}): string => {
  const { fondo, arriba = 32, abajo = 32 } = opciones;
  const bg = fondo ? ` bgcolor="${fondo}"` : '';
  return `      <tr>
        <td class="px${fondo ? ' banda' : ''}"${bg} style="padding:${arriba}px ${MARGEN}px ${abajo}px ${MARGEN}px;${fondo ? `background-color:${fondo};` : ''}">
        ${contenido}
        </td>
      </tr>`;
};

export function dibujarBloque(bloque: Bloque, p: Paleta): string {
  switch (bloque.tipo) {
    case 'entrada':
      return fila(
        `${titulo(bloque.titulo, 32, p, 'h1')}
        ${parrafos(bloque.parrafos, p)}`,
        { arriba: 40, abajo: 8 },
      );

    case 'pieza':
      // A sangre: la pieza manda. El campo hueso ya viene dentro del JPEG.
      return `      <tr>
        <td style="padding:24px 0 0 0;font-size:0;line-height:0;">
          <img src="${urlImagen(bloque.imagen)}" alt="${escapar(bloque.alt)}" width="600" class="w-full" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;">
        </td>
      </tr>
${fila(meta(bloque.meta, p), { arriba: 16, abajo: 0 })}`;

    case 'accion':
      return fila(
        `${bloque.parrafos
          .map(
            (t) =>
              `<p class="texto" style="margin:0 0 24px 0;font-family:${FUENTE};font-size:19px;font-weight:500;line-height:1.4;color:${p.tinta};">${enriquecer(t, p)}</p>`,
          )
          .join('\n        ')}
        ${boton(bloque.boton, bloque.url, p)}`,
        { arriba: 32, abajo: 40 },
      );

    case 'galeria':
      return `${regla(p)}
${fila(
  `${titulo(bloque.titulo, 24, p, 'h2')}
        ${tresColumnas(bloque.items, p)}
        ${bloque.enlace ? `<div style="padding-top:24px;"><a href="${bloque.enlace.url}" class="enlace" style="font-family:${FUENTE};font-size:16px;font-weight:700;color:${p.azul};text-decoration:none;">${escapar(bloque.enlace.texto)}</a></div>` : ''}`,
  { arriba: 40, abajo: 40 },
)}`;

    case 'nota':
      return fila(
        `${titulo(bloque.titulo, 24, p, 'h2')}
        ${parrafos(bloque.parrafos, p)}`,
        { fondo: p.hueso, arriba: 40, abajo: 24 },
      );

    case 'afuera':
      return fila(
        `${titulo(bloque.titulo, 24, p, 'h2')}
        ${parrafos(bloque.parrafos, p)}`,
        { arriba: 40, abajo: 24 },
      );
  }
}

/** Botón a prueba de balas: el color va en la celda, no en el enlace. */
function boton(rotulo: string, url: string, p: Paleta): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
          <tr>
            <td bgcolor="${p.naranja}" style="background-color:${p.naranja};border-radius:999px;">
              <a href="${url}" style="display:inline-block;padding:14px 28px;font-family:${FUENTE};font-size:16px;font-weight:700;line-height:1.2;color:${p.blanco};text-decoration:none;border-radius:999px;">${escapar(rotulo)}</a>
            </td>
          </tr>
        </table>`;
}

/**
 * Tres pantallas en fila. Se quedan en tres también en móvil, igual que en el
 * diseño: apiladas ocuparían media pantalla cada una y el conjunto dejaría de
 * leerse como un juego de piezas.
 */
function tresColumnas(items: ItemGaleria[], p: Paleta): string {
  const celdas = items
    .map(
      (item) => `            <td width="33.33%" valign="top" style="width:33.33%;padding:0 6px;">
              <img src="${urlImagen(item.imagen)}" alt="${escapar(item.alt)}" width="160" style="display:block;width:100%;height:auto;border:0;outline:none;border-radius:12px;">
              <div style="padding-top:10px;">${meta(item.pie, p)}</div>
            </td>`,
    )
    .join('\n');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
          <tr>
${celdas}
          </tr>
        </table>`;
}

export function regla(p: Paleta): string {
  return `      <tr>
        <td style="padding:0;font-size:0;line-height:0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" bgcolor="${p.borde}" style="height:1px;background-color:${p.borde};font-size:0;line-height:0;">&nbsp;</td></tr></table>
        </td>
      </tr>`;
}
