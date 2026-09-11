// Página para publicar una edición como artifact y poder revisarla en el panel
// lateral, con la herramienta de comentarios encima.
//
// El correo va directo en el DOM de la página, no en un iframe: la
// herramienta de comentarios de Claude solo puede anclar un comentario a un
// elemento del documento que ve, y el contenido de un iframe es un documento
// aparte al que no llega. Por eso lo que entra aquí es solo la tabla del
// correo (`tablaLienzo`, sin doctype/head/body) — un artifact no admite un
// documento HTML propio en su página de cualquier forma.
//
// El costo: las @media del correo responden al ancho o al tema real de la
// ventana, no a los de un contenedor, así que los botones "Móvil" y "Oscuro"
// no pueden reusarlas tal cual. Por eso aquí no se incluye el
// `@media (prefers-color-scheme: dark)` de `estilosCorreo`: el modo oscuro se
// fuerza con `.forzar-oscuro` (mismas declaraciones, sin el `@media`) y el
// ancho con `.forzar-movil` — ambos por botón, no por el sistema. Ninguno de
// los dos toca el HTML que se sube a Reach.
//
// Ojo con la CSP del artifact: solo deja salir a Google Fonts. Por eso aquí
// entra el fragmento con las imágenes ya incrustadas (`versionPrevia`), no el
// que apunta a formamx.com: ese saldría sin ninguna imagen.

import { escapar } from './bloques.ts';
import type { Edicion } from './edicion.ts';
import type { Paleta } from './tokens.ts';

/** Envuelve el correo en una página revisable. `tabla` ya debe traer las imágenes incrustadas y ser el fragmento de `tablaLienzo()`, no el documento completo. */
export function paraArtifact(edicion: Edicion, tabla: string, p: Paleta): string {
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
  /* Dos grupos de botones: ancho (Escritorio/Móvil) y tema (Claro/Oscuro). */
  .anchos { display: flex; flex-wrap: wrap; gap: 16px; }
  .grupo { display: flex; gap: 8px; }
  .grupo + .grupo { border-left: 1px solid var(--borde); padding-left: 16px; }
  .grupo button {
    font: inherit; font-size: 13px; font-weight: 600;
    padding: 7px 16px; border-radius: 999px; cursor: pointer;
    border: 1.5px solid var(--borde); background: transparent; color: var(--tenue);
  }
  .grupo button[aria-pressed="true"] {
    border-color: var(--acento); color: var(--acento);
  }
  /* Un correo tiene ancho fijo: si el panel es más angosto se desplaza dentro
     de su contenedor, no se encoge. Encogerlo enseñaría algo que ningún
     cliente de correo va a mostrar. */
  .escenario { display: flex; justify-content: center; padding: 32px 16px 48px; overflow-x: auto; background: var(--fondo); }
  #correo {
    flex: none;
    width: 600px;
    transition: width 180ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  /* Reglas reales del correo (mismo origen que newsletter/layout.ts), menos
     su modo oscuro automático: aquí lo elige el botón, no el sistema. */
  @import url('https://fonts.googleapis.com/css2?family=Alan+Sans:wght@400;500;700&display=swap');
  #correo, #correo table, #correo td, #correo a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  #correo table { border-collapse: collapse !important; }
  #correo img { -ms-interpolation-mode: bicubic; }
  #correo a { color: ${p.azul}; }

  /* La misma regla de móvil del correo, pero por clase: aquí no hay un
     viewport propio que achicar como en un iframe, solo el botón. */
  #correo.forzar-movil { width: 390px; }
  #correo.forzar-movil .w-full { width: 100% !important; max-width: 100% !important; }
  #correo.forzar-movil .px { padding-left: 24px !important; padding-right: 24px !important; }
  #correo.forzar-movil .h1 { font-size: 28px !important; }
  #correo.forzar-movil .h2 { font-size: 22px !important; }

  /* El modo oscuro real del correo, pero por clase en vez de por el
     @media de sistema: mismas declaraciones que estilosCorreo(), solo que
     atadas al botón "Oscuro". */
  #correo.forzar-oscuro .cuerpo { background-color: #0A0A09 !important; }
  #correo.forzar-oscuro .lienzo { background-color: #121211 !important; }
  #correo.forzar-oscuro .banda { background-color: #1C1C1A !important; }
  #correo.forzar-oscuro .titulo { color: #F2F2EF !important; }
  #correo.forzar-oscuro .texto { color: #DEDED9 !important; }
  #correo.forzar-oscuro .meta, #correo.forzar-oscuro .enlace { color: ${p.azulNoche} !important; }
  #correo.forzar-oscuro .tenue { color: ${p.grisClaro} !important; }
  #correo.forzar-oscuro .logo-claro { display: none !important; }
  #correo.forzar-oscuro .logo-oscuro { display: block !important; width: 132px !important; height: 36px !important; max-height: none !important; }
</style>

<div class="barra">
  <div class="quien">
    <div class="datos">Edición ${String(edicion.numero).padStart(3, '0')} &middot; ${escapar(edicion.fecha)}</div>
    <div class="asunto">${escapar(edicion.asunto)}</div>
  </div>
  <div class="anchos">
    <div class="grupo">
      <button type="button" data-ancho="600" aria-pressed="false">Escritorio</button>
      <button type="button" data-ancho="390" aria-pressed="true">Móvil</button>
    </div>
    <div class="grupo">
      <button type="button" data-tema="claro" aria-pressed="true">Claro</button>
      <button type="button" data-tema="oscuro" aria-pressed="false">Oscuro</button>
    </div>
  </div>
</div>

<div class="escenario">
  <div id="correo" class="forzar-movil">
${tabla}
  </div>
</div>

<script>
  const correo = document.getElementById('correo');
  function conectarGrupo(atributo, clase, valorActivo) {
    const botones = document.querySelectorAll('[data-' + atributo + ']');
    for (const boton of botones) {
      boton.addEventListener('click', () => {
        for (const otro of botones) otro.setAttribute('aria-pressed', String(otro === boton));
        correo.classList.toggle(clase, boton.dataset[atributo] === valorActivo);
      });
    }
  }
  conectarGrupo('ancho', 'forzar-movil', '390');
  conectarGrupo('tema', 'forzar-oscuro', 'oscuro');
</script>
`;
}
