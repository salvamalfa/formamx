# forma — Design System

**forma** es el taller de proyectos de una persona (y sus amigos): una bitácora donde cada pieza se hace una vez — bancas de madera hechas a mano, lámparas impresas en 3D, videos de naturaleza, música, energía renovable, edge AI. No es una tienda ni un portafolio: es documentación honesta del proceso. La venta existe, pero es consecuencia de la historia, nunca al revés.

**Fuentes:** logo original del usuario (`uploads/Untitled.svg`, corregido ópticamente en `assets/logo/`), foto real de producto (`assets/imagenes/silla-jardin-01.jpeg`). No hay codebase ni Figma previos; la identidad se definió en este proyecto (ver `Logo forma.dc.html`, opciones 3c + verde de 3b, tipografía 4a aligerada).

---

## CONTENT FUNDAMENTALS — cómo escribe forma

- **Idioma:** español. Siempre de **tú**, nunca de usted.
- **Persona:** primera persona («hice», «se me quemó», «aprendí»). Tono de quien **documenta**, no de quien se promociona.
- **Frases cortas. Detalles concretos.** Material, fecha, número de intento. «Pino, barniz que sobró de otra vida» > «materiales premium».
- **Honesto con el proceso:** lo que sale bien Y lo que se quema. El error es parte de la historia.
- **Humor seco, sin exclamaciones.** Íntimo sin ser cursi.
- **Prohibido:** jerga de marketing («¡no te lo pierdas!», «calidad premium», «edición limitada» como gancho), urgencia de venta, hashtags en masa, emoji (no se usan, nunca).
- **Casing:** sentence case en todo. MAYÚSCULAS solo para etiquetas cortas de metadata («PIEZA ÚNICA», «PROYECTO 003»).
- **Ejemplos reales del tono:**
  - «La primera capa quedó chueca. La segunda, mejor.»
  - «Hicimos una silla para leer al sol.»
  - «Se vende, si quieres. Pero primero la historia.»

## VISUAL FOUNDATIONS

- **Vibe:** sobrio y artesanal, con un fondo blanco limpio que deja hablar al objeto. Cálido en los acentos, nunca decorativo.
- **Color — tres colores con un trabajo cada uno.** Ver `tokens/colors.css`.
  - **Azul taller `#2E6DA4` — PRINCIPAL.** Todo lo accionable e informativo: botones primarios, enlaces, metadata, filtro activo, foco. Es el color con el que se reconoce la marca. Sobre tinta usa `--azul-noche #5B95C7`.
  - **Naranja `#D06A2C` — TALLER.** Solo materiales y oficio: madera, barro, metal, barniz. Nunca como botón ni enlace. Tags con `--taller-soft` de fondo y `--taller-ink` de texto.
  - **Verde bosque `#3E5A40` — AFUERA.** Lo que vive fuera del taller: exterior, naturaleza, energía renovable, jardín.
  - **Base:** fondo `#FFFFFF`, bandas de sección `--hueso #F7F7F5`, texto `--tinta #1A1A18` (nunca #000), texto secundario `--gris #6E6E68`, bordes `--borde #E8E8E4`.
  - Fuera de la paleta: el mostaza y el crema de versiones anteriores. No los uses.
- **Tipografía: Alan Sans en TODO** (una sola familia, sin monoespaciada). Títulos Bold 700 (800 solo para una cifra o una palabra); textos 400/500. **Metadata** (fecha · material · nº pieza) = Alan Sans 700, MAYÚSCULAS, `letter-spacing: 0.12em`, en azul taller — es el hilo conductor de la bitácora. El logo NUNCA se usa como fuente de títulos: es la marca.
- **Fondos:** blanco por defecto, `--hueso` para separar una banda de sección; bloques de color pleno (azul, tinta) para destacar. **Sin gradientes.** Fotos a sangre cuando la pieza es protagonista.
- **Imágenes:** fotos reales con luz natural cálida (sol de tarde), exteriores, sin filtros fríos. La pieza en uso, no en estudio.
- **Bordes y radios:** todo redondeado (`--radius-m: 16px` en tarjetas, `--radius-pill` en botones y tags). Nunca esquinas duras.
- **Sombras:** cálidas y suaves (tinta 5–10%), ver `--shadow-card`. Nada de sombras negras duras.
- **Tarjetas:** blanco sobre blanco, separadas por sombra `--shadow-card` (no por color de fondo); borde `--border-soft` opcional, radio 16px. En modo noche, tarjeta `--tinta` y texto `--blanco`.
- **Hover:** botones oscurecen (`--accent-hover`); tarjetas suben la sombra (`--shadow-raised`) y nada más. **Press:** oscurecer un paso, sin encoger.
- **Animación:** discreta — fades y desplazamientos cortos con `--ease-out`, 150–300ms. Sin rebotes.
- **Transparencia/blur:** no se usan. Superficies sólidas.
- **Layout:** contenidos a máx ~1100px, mucho aire (`--space-7/8` entre secciones). Metadata mono en mayúsculas como hilo conductor.

## ICONOGRAPHY

- **Marca:** wordmark + 3 iconos derivados del logo en `assets/logo/` (la «f», la «f» en contenedor app, la «o»). El icono de app oficial es `icono-app-f.svg`.
- **Iconos UI:** no existía un set. **Sustitución flagged:** usar [Lucide](https://lucide.dev) vía CDN (`https://unpkg.com/lucide@latest`), trazo 2px, redondeado — combina con lo blando de la marca. Usar POCOS iconos; forma prefiere texto y metadata mono.
- **Emoji:** nunca. **Unicode como icono:** solo «·» como separador de metadata y «→» en enlaces.

## Intentional additions

- Set estándar de componentes UI (no había fuente previa): Button, Tag, Input, Checkbox, Switch + ProjectCard, Meta — dimensionado a las necesidades reales (web bitácora + posts).

## Índice

- `styles.css` — punto de entrada (importa todos los tokens)
- `tokens/` — `fonts.css`, `colors.css`, `typography.css`, `spacing.css`
- `assets/logo/` — wordmark negro/blanco, iconos f/app/o · `assets/imagenes/` — fotos
- `guidelines/` — specimen cards (color, tipo, espaciado, marca, voz)
- `components/core/` — Button, Tag, Input, Checkbox, Switch
- `components/content/` — ProjectCard, Meta
- `ui_kits/web/` — home de la bitácora (starting point)
- `ui_kits/posts/` — plantillas de posts 1080×1350 (starting points)
- `Logo forma.dc.html` — historial de decisiones de identidad
- `SKILL.md` — uso como Agent Skill

**Caveat:** las fuentes se sirven desde Google Fonts (no hay binarios locales).
