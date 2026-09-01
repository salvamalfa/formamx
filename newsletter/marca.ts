// Constantes de marca y de empresa que el correo necesita y que no salen de
// los tokens de color.

/**
 * Razón social y domicilio: van en el pie porque un correo comercial masivo
 * está obligado a llevarlos. Datos de la boleta de inscripción en el Registro
 * Público de Comercio (FORMA/01-Legal/Boleta_RPC.pdf): inscrita el 24/07/2026,
 * FME N-2026059434, capital fijo (de ahí "S.A.S." sin "de C.V.").
 *
 * El domicilio es el SOCIAL, del acta constitutiva. Si la Constancia de
 * Situación Fiscal termina diciendo otro, manda la de la CSF: ver
 * docs/MARKETING.md.
 */
export const EMPRESA = {
  razonSocial: 'FORMA WORKS, S.A.S.',
  domicilio: 'Camino San Juan de Aragón 215, L-14, Pueblo San Juan de Aragón, C.P. 07950, Gustavo A. Madero, Ciudad de México',
} as const;

export const SITIO = 'https://formamx.com';

/** Las imágenes del correo se sirven del sitio: se despliegan con él y la URL no cambia. */
export const BASE_IMAGENES = `${SITIO}/newsletter`;

/**
 * Gmail ignora las webfonts, así que la mayoría va a leer esto en Arial y el
 * diseño tiene que aguantarlo. Alan Sans queda para los clientes que sí las
 * cargan (Apple Mail, iOS).
 */
export const FUENTE = "'Alan Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif";

/** Ancho estándar de correo. Más de 600px se corta en varios clientes. */
export const ANCHO = 600;

/** Aire lateral del contenido. En móvil el <style> del layout lo baja a 24px. */
export const MARGEN = 40;
