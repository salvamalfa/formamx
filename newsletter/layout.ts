// La envoltura del correo: cabecera, pie y el <style> que ajusta móvil y modo
// oscuro. El contenido de en medio lo ponen los bloques.

import { escapar, regla } from './bloques.ts';
import type { Edicion } from './edicion.ts';
import { ANCHO, BASE_IMAGENES, EMPRESA, FUENTE, MARGEN, SITIO } from './marca.ts';
import type { Paleta } from './tokens.ts';

/** Formatea 2026-09-15 como "septiembre de 2026", para la metadata de cabecera. */
export function mesLargo(fechaIso: string): string {
  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaIso);
  if (!partes || partes[1] === undefined || partes[2] === undefined) {
    throw new Error(`La fecha "${fechaIso}" no está en formato AAAA-MM-DD`);
  }
  const mes = meses[Number(partes[2]) - 1];
  if (!mes) throw new Error(`Mes inválido en la fecha "${fechaIso}"`);
  return `${mes} de ${partes[1]}`;
}

export function envolver(edicion: Edicion, filas: string, p: Paleta): string {
  const numero = String(edicion.numero).padStart(3, '0');
  return `<!doctype html>
<html lang="es" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapar(edicion.asunto)}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
<style>
  /* Alan Sans solo llega a los clientes que cargan webfonts (Apple Mail, iOS).
     Gmail la ignora y cae a Arial: el diseño está medido para aguantarlo. */
  @import url('https://fonts.googleapis.com/css2?family=Alan+Sans:wght@400;500;700&display=swap');

  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table { border-collapse: collapse !important; }
  img { -ms-interpolation-mode: bicubic; }
  a { color: ${p.azul}; }

  @media only screen and (max-width: 620px) {
    .w-full { width: 100% !important; max-width: 100% !important; }
    .px { padding-left: 24px !important; padding-right: 24px !important; }
    .h1 { font-size: 28px !important; }
    .h2 { font-size: 22px !important; }
  }

  /* Modo oscuro: la marca ya define sus tonos de noche, así que en vez de
     dejar que el cliente invierta los colores a su gusto, se los damos.
     Solo lo respetan algunos (Apple Mail, iOS); Gmail invierte por su cuenta
     y no hay forma de impedirlo, por eso el diseño claro tiene que aguantar
     una inversión automática sin romperse.

     Cada selector de aquí tiene que existir en el HTML: si se renombra una
     clase en bloques.ts y no aquí, el fondo se oscurece pero el texto se
     queda negro y el correo se vuelve ilegible. */
  @media (prefers-color-scheme: dark) {
    .cuerpo { background-color: #0A0A09 !important; }
    .lienzo { background-color: #121211 !important; }
    .banda { background-color: #1C1C1A !important; }
    .titulo { color: #F2F2EF !important; }
    .texto { color: #DEDED9 !important; }
    .meta, .enlace { color: ${p.azulNoche} !important; }
    .tenue { color: ${p.grisClaro} !important; }
    .etiqueta { background-color: ${p.bosqueSombra} !important; color: ${p.bosqueNoche} !important; }
    .logo-claro { display: none !important; }
    .logo-oscuro { display: block !important; width: 132px !important; height: 36px !important; max-height: none !important; }
  }
</style>
</head>
<body class="cuerpo" style="margin:0;padding:0;width:100%;background-color:${p.hueso};">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${p.hueso};">${escapar(edicion.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.hueso}" style="width:100%;background-color:${p.hueso};">
    <tr>
      <td align="center" style="padding:0;">
        <!--[if mso]><table role="presentation" width="${ANCHO}" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
        <table role="presentation" class="w-full lienzo" width="${ANCHO}" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.blanco}" style="width:${ANCHO}px;max-width:${ANCHO}px;background-color:${p.blanco};">
${cabecera(numero, edicion.fecha, p)}
${regla(p)}
${filas}
${pie(p)}
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

function cabecera(numero: string, fecha: string, p: Paleta): string {
  return `      <tr>
        <td class="px" style="padding:40px ${MARGEN}px 28px ${MARGEN}px;">
          <a href="${SITIO}" style="text-decoration:none;">
            <img class="logo-claro" src="${BASE_IMAGENES}/forma-tinta.png" alt="forma" width="132" height="36" style="display:block;width:132px;height:36px;border:0;outline:none;">
            <img class="logo-oscuro" src="${BASE_IMAGENES}/forma-blanco.png" alt="forma" width="132" height="36" style="display:none;width:0;height:0;max-height:0;overflow:hidden;border:0;outline:none;">
          </a>
          <div class="meta" style="padding-top:16px;font-family:${FUENTE};font-size:12px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${p.azul};">Bitácora &middot; Edición ${numero} &middot; ${escapar(mesLargo(fecha))}</div>
        </td>
      </tr>`;
}

/**
 * El pie lleva razón social y domicilio porque un correo comercial masivo está
 * obligado a llevarlos. El enlace de baja NO se maqueta aquí a propósito:
 * Reach se encarga de ponerlo y de que funcione, y maquetar uno propio pelearía
 * con el suyo (ver docs/MARKETING.md).
 */
function pie(p: Paleta): string {
  return `      <tr>
        <td class="px pie" bgcolor="${p.tinta}" style="padding:40px ${MARGEN}px;background-color:${p.tinta};">
          <img src="${BASE_IMAGENES}/forma-blanco.png" alt="forma" width="88" height="24" style="display:block;width:88px;height:24px;border:0;outline:none;">
          <p class="tenue" style="margin:20px 0 0 0;font-family:${FUENTE};font-size:13px;line-height:1.6;color:${p.grisClaro};">Te llega este correo porque te suscribiste en <a href="${SITIO}" class="enlace" style="color:${p.azulNoche};text-decoration:none;">formamx.com</a>. Escribo cuando hay algo que contar, más o menos una vez al mes.</p>
          <p style="margin:16px 0 0 0;font-family:${FUENTE};font-size:12px;line-height:1.6;color:${p.gris};">${escapar(EMPRESA.razonSocial)}<br>${escapar(EMPRESA.domicilio)}</p>
        </td>
      </tr>`;
}
