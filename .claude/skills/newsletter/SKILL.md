---
name: newsletter
description: Escribir, revisar y construir una edición del newsletter de clientes de forma. Úsala cuando Salva pida armar un newsletter, redactar una edición, agregar un bloque nuevo al catálogo, o preparar el HTML para subirlo a Hostinger Reach. No es para el newsletter interno (ese es un agente de Cowork aparte, sin relación con este repo).
user-invocable: true
---

# Newsletter de clientes

Convierte una edición escrita en texto en HTML de correo con la marca de forma.
El sistema vive en `newsletter/`; el contexto de negocio y de la cuenta de Reach
está en `docs/MARKETING.md`.

## Lo primero que hay que saber

**El envío es manual y no hay forma de evitarlo.** La API de Reach es solo
lectura para campañas: no existe endpoint para crear ni mandar. Este sistema
llega hasta "HTML listo"; subirlo y mandarlo lo hace Salva en la web de Reach.
No prometas automatizar el envío.

**Reach toca el HTML que subes.** Lo valida y ajusta al guardar, y él pone el
enlace de baja. Por eso la plantilla no maqueta uno propio. La razón social y
el domicilio sí van en nuestro pie: esos no los pone Reach.

## Escribir una edición

Un archivo en `newsletter/ediciones/AAAA-MM-DD-nombre.md`. Frontmatter plano y
luego secciones `## tipo`. Los `clave: valor` van pegados al `##`, antes de la
prosa; en cuanto empieza el texto, un `clave: valor` ya se lee como texto.

```markdown
---
edicion: 2
fecha: 2026-10-20
asunto: Un asunto corto y concreto
preheader: La frase que se ve junto al asunto en la bandeja.
---

## entrada
titulo: El titular de la edición

Primer párrafo.

Segundo párrafo, con [un enlace](https://formamx.com/lampara) si hace falta.
```

Los bloques y lo que pide cada uno:

| Bloque | Atributos | Prosa |
| --- | --- | --- |
| `entrada` | `titulo` | sí, el cuerpo |
| `pieza` | `imagen`, `alt`, `meta` | no |
| `accion` | `boton`, `url` | sí, la frase que lo antecede |
| `galeria` | `titulo`, `item` (repetible, `imagen \| alt \| pie`), `enlace` opcional (`texto \| url`) | no |
| `nota` | `titulo` | sí. Sale sobre banda hueso; es el bloque de "lo que no salió" |
| `afuera` | `etiqueta`, `titulo` | sí. Etiqueta verde bosque, para lo que vive afuera |

Reglas duras: **un solo bloque `accion` por edición** (la marca permite un botón
primario por vista) y **todas las URL absolutas**.

## La voz

Es la de la bitácora, la misma de `ds-bundle/readme.md`:

- Español, siempre de **tú**. Primera persona: "hice", "se me quemó", "aprendí".
- Frases cortas y detalles concretos: material, medida, número de intento.
  "Bajé la capa a 0.16 mm" vale más que "optimicé los parámetros".
- Honesto con el proceso, incluido lo que se quemó. El error es parte.
- Humor seco. Sin exclamaciones.
- **Nunca emoji.** Sentence case. Solo `·` como separador y `→` en enlaces.
- Nada de jerga de marketing, urgencia de venta ni "no te lo pierdas".

El lint atrapa emoji, guiones largos, exclamaciones, jerga y huecos sin llenar,
pero no atrapa que un texto sea aburrido o genérico. Eso es criterio.

## Las imágenes

Van en `public/newsletter/AAAA-MM-DD/` y se referencian con esa ruta relativa
(`2026-10-20/hero.jpg`); el build las convierte a URL absoluta de formamx.com.
Se despliegan con el sitio.

**JPEG, no WebP**: Outlook de escritorio no pinta WebP. Los renders de las
lámparas salen de `FORMA/05-Proyectos/Lamparas-3D/Renders/` componiendo pantalla
sobre cuerpo (como el configurador) sobre campo hueso `#F7F7F5`. Apunta a menos
de 70 KB por imagen.

## Construir

```sh
npm run newsletter:check    # solo revisa
npm run newsletter:build    # revisa y escribe newsletter/dist/*.html
npm test                    # los tests del sistema
```

Los errores del lint detienen el build; los avisos solo se imprimen. El HTML
sale en `newsletter/dist/` (fuera de git).

Luego, y esto lo hace Salva: subir el HTML en Reach (Campañas → Subir HTML,
necesita plan Reach 500 o superior) y **mandarse una prueba antes del envío
real**. Alan Sans no llega a Gmail, así que la prueba es la única forma de ver
cómo se lee en Arial y en modo oscuro.

## Tocar el diseño

Los colores salen de `ds-bundle/tokens/colors.css` a través de
`newsletter/tokens.ts`; no escribas un hex a mano en un bloque, agrega el token.
Si el bloque que necesitas no existe, primero decide si de verdad hace falta uno
nuevo o si `nota` alcanza; un catálogo que crece sin freno es justo lo que este
sistema evita. Si hace falta, va en `newsletter/bloques.ts` con su tipo en
`edicion.ts`, su render y su test.

`newsletter/render.test.ts` guarda las invariantes que hacen que el correo
funcione (nada de flex ni grid, imágenes con alt y width, URL absolutas, un solo
botón naranja, peso bajo el recorte de Gmail). Si un cambio las rompe, el
problema casi siempre es el cambio.
