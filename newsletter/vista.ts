// Página para publicar una edición como artifact y poder revisarla en el panel
// lateral, con la herramienta de comentarios encima.
//
// El correo va dentro de un <iframe srcdoc>: un correo es un documento HTML
// completo (doctype, head, body) y un artifact no admite eso en su página, pero
// sí dentro de un iframe. Además así el CSS del correo queda aislado del de la
// página, que es justo lo que queremos para verlo tal cual.
//
// Ojo con la CSP del artifact: solo deja salir a Google Fonts. Por eso aquí
// entra el HTML con las imágenes ya incrustadas (`versionPrevia`), no el que
// apunta a formamx.com: ese saldría sin ninguna imagen.

import { escapar } from './bloques.ts';
import type { Edicion } from './edicion.ts';
import type { Paleta } from './tokens.ts';

/** Envuelve el correo en una página revisable. `html` ya debe traer las imágenes incrustadas. */
export function paraArtifact(edicion: Edicion, html: string, p: Paleta): string {
  return `<title>Newsletter ${String(edicion.numero).padStart(3, '0')}</title>
<style>
  :root {
    --fondo: ${p.hueso};
    --papel: ${p.blanco};
    --texto: ${p.tinta};
    --tenue: ${p.gris};
    --borde: ${p.borde};
    --acento: ${p.azul};
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --fondo: #0F0F0E; --papel: #1A1A18; --texto: #F2F2EF;
      --tenue: ${p.grisClaro}; --borde: #2E2E2A; --acento: ${p.azulNoche};
    }
  }
  :root[data-theme="dark"] {
    --fondo: #0F0F0E; --papel: #1A1A18; --texto: #F2F2EF;
    --tenue: ${p.grisClaro}; --borde: #2E2E2A; --acento: ${p.azulNoche};
  }

  body {
    margin: 0;
    background: var(--fondo);
    color: var(--texto);
    font-family: 'Alan Sans', ui-sans-serif, system-ui, sans-serif;
  }
  .barra {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: baseline;
    justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid var(--borde);
    background: var(--papel);
  }
  .quien { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .asunto { font-size: 17px; font-weight: 700; line-height: 1.3; }
  .datos {
    font-size: 11.5px; font-weight: 700; letter-spacing: 0.12em;
    text-transform: uppercase; color: var(--acento);
  }
  .anchos { display: flex; gap: 8px; }
  .anchos button {
    font: inherit; font-size: 13px; font-weight: 600;
    padding: 7px 16px; border-radius: 999px; cursor: pointer;
    border: 1.5px solid var(--borde); background: transparent; color: var(--tenue);
  }
  .anchos button[aria-pressed="true"] {
    border-color: var(--acento); color: var(--acento);
  }
  /* Un correo tiene ancho fijo: si el panel es más angosto se desplaza dentro
     de su contenedor, no se encoge. Encogerlo enseñaría algo que ningún
     cliente de correo va a mostrar. */
  .escenario { display: flex; justify-content: center; padding: 32px 16px 48px; overflow-x: auto; }
  iframe {
    flex: none;
    border: 1px solid var(--borde);
    border-radius: 8px;
    background: #FFFFFF;
    width: 600px;
    height: 2400px;
    transition: width 180ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .nota {
    max-width: 640px; margin: 0 auto; padding: 0 24px 40px;
    font-size: 13px; line-height: 1.6; color: var(--tenue);
  }
</style>

<div class="barra">
  <div class="quien">
    <div class="datos">Edición ${String(edicion.numero).padStart(3, '0')} &middot; ${escapar(edicion.fecha)}</div>
    <div class="asunto">${escapar(edicion.asunto)}</div>
  </div>
  <div class="anchos">
    <button type="button" data-ancho="600" aria-pressed="true">Escritorio</button>
    <button type="button" data-ancho="390" aria-pressed="false">Móvil</button>
  </div>
</div>

<div class="escenario">
  <iframe id="correo" title="Vista previa del correo" srcdoc="${escapar(html)}"></iframe>
</div>

<p class="nota">Así se ve el correo en un navegador. Un cliente real lo cambia:
Gmail ignora Alan Sans y cae a Arial, y el modo oscuro depende de cada cliente.
La prueba de verdad es mandárselo a uno mismo desde Reach.</p>

<script>
  const correo = document.getElementById('correo');
  for (const boton of document.querySelectorAll('.anchos button')) {
    boton.addEventListener('click', () => {
      for (const otro of document.querySelectorAll('.anchos button')) {
        otro.setAttribute('aria-pressed', String(otro === boton));
      }
      correo.style.width = boton.dataset.ancho + 'px';
    });
  }
  // El correo no tiene alto fijo: se lo pedimos al documento de dentro para
  // que no quede una barra de scroll interna.
  const ajustar = () => {
    const doc = correo.contentDocument;
    if (doc?.body) correo.style.height = doc.documentElement.scrollHeight + 'px';
  };
  correo.addEventListener('load', ajustar);
  new ResizeObserver(ajustar).observe(correo);
</script>
`;
}
