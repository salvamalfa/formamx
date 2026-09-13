---
name: ideas-diarias
description: Auditar el sitio completo y proponer tres ideas concretas para mejorarlo, con evidencia del código y comparación contra sitios parecidos. Úsala cuando Salva pida ideas para la página, cuando corra la rutina diaria de las 8 de la mañana, o cuando pregunte qué le falta al sitio. No es para implementar: aquí solo se proponen ideas y se registra su veredicto.
user-invocable: true
---

# Ideas diarias para el sitio

Cada mañana entregas **tres ideas** de cosas que hoy no existen en formamx.com
y que valdría la pena construir. Salva contesta "implementa la 2" o "esa no", y
tú registras el veredicto. Nada más.

La bitácora de todo lo propuesto vive en `docs/IDEAS_DIARIAS.md`. Ese archivo
es la memoria del sistema: sin él vuelves a proponer lo mismo cada semana.

## La regla que hace o rompe esto

**Cada idea se verifica contra el código antes de proponerla.** Nada de "podrías
agregar reseñas" sin haber abierto `src/pages/` para confirmar que no hay. Si no
pudiste comprobar que algo falta, no es idea: es ruido, y Salva deja de leer.

La evidencia va en la idea, corta y concreta: "el `og:image` de
`BaseLayout.astro` apunta a `/images/og-default.jpg` y esa carpeta no existe en
`public/`". Eso se puede verificar en diez segundos. "Mejorar el SEO" no.

## Cómo corre una edición

### 1. Lee la memoria

Abre `docs/IDEAS_DIARIAS.md` completo. Te dice qué ya propusiste, qué dijo
Salva y qué está construido. Reglas de repetición:

- Una idea con veredicto `no` **no se vuelve a proponer**, salvo que haya
  cambiado algo real (llegó un cliente que la pidió, cambió el negocio). Si la
  repites, di en una línea qué cambió.
- Una idea `sí` que sigue sin construirse tampoco se repropone: ya está
  aprobada, va en la cola. Si Salva pregunta qué sigue, esa es la respuesta.
- Una idea `propuesta` sin respuesta después de catorce días pasa a
  `sin respuesta` y puede volver, una sola vez más.

### 2. Elige el área del día

Rota. Si tres días seguidos hablas del configurador, el sitio se desbalancea.
El ciclo, en orden, saltándote lo que ya no tenga hueco que valga la pena:

| Día | Área | Qué mirar |
| --- | --- | --- |
| 1 | Portada y páginas públicas | `/`, `/forma`, `/trabajos`, `/mas`, `/banca` |
| 2 | Configurador de lámparas | `/lampara`, `LampConfigurator.tsx`, `config/lamps.ts` |
| 3 | Móvil y accesibilidad | anchos chicos, foco, contraste, áreas de toque, `aria-*` |
| 4 | Pagos y checkout | `lib/checkout.ts`, `workers/api/src/routes/checkout.ts`, `/gracias` |
| 5 | Captación y newsletter | el formulario de `/mas`, `newsletter/`, `docs/MARKETING.md` |
| 6 | Después de la compra | seguimiento del pedido, correos, envíos, devoluciones |
| 7 | Cómo se comparte y se encuentra | metadatos, `og:image`, sitemap, datos estructurados |
| 8 | Confianza | quién está detrás, garantía, tiempos reales, páginas legales |
| 9 | Rendimiento y peso | imágenes, fuentes, JS que se manda de más |
| 10 | /taller | el panel de Salva: lo que le ahorra pasos al día |

Un área por edición, pero **las tres ideas no tienen que ser todas de ahí**: dos
del área del día y una de donde encuentres el hueco más grande funciona bien.

### 3. Mira el sitio de verdad

No basta con leer código. Levanta el sitio y ábrelo:

```sh
npm run dev
```

Para el área de móvil, míralo a 390 px de ancho, que es donde lo ve la mayoría
de la gente que llega de Instagram. Captura lo que esté roto.

### 4. Compara contra afuera

Busca cómo lo resuelven talleres y marcas de una persona parecidas: muebles de
autor, iluminación, cerámica, impresión 3D por encargo, tiendas Shopify chicas
con producto hecho a mano. Busca lo que **ellos tienen y aquí no**, y quédate
solo con lo que le sirva a un taller de una persona.

Filtro duro: forma es una bitácora que vende, no una tienda. Una idea que
convierta el sitio en catálogo genérico se descarta aunque la use todo el
mundo. La voz y el criterio de marca están en `ds-bundle/readme.md`.

### 5. Escribe las tres

Cada idea, en este formato y en este orden:

```markdown
### N. Título en una frase

**Qué es.** Dos o tres frases. Qué vería el visitante, o qué le ahorra a Salva.

**Por qué.** La evidencia: qué falta hoy, dónde lo comprobaste, y qué se gana.
Si vino de comparar con otro sitio, di cuál.

**Tamaño.** Chico (una tarde) · Medio (un par de días) · Grande (una semana o más).

**Qué toca.** Las piezas: sitio, Worker, D1, agente, un servicio externo.

**Qué no incluye.** El límite, para que no crezca solo.

**Qué necesito de ti.** Un archivo, una cuenta, una decisión. O "nada".
```

Orden de presentación: primero la de mayor impacto por esfuerzo, no la más
vistosa.

Mezcla tamaños. Tres ideas grandes el mismo día no se implementan ninguna; tres
chicas seguidas no mueven el negocio. Un chico, un medio y uno grande es la
mezcla que funciona.

### 6. Registra y cierra

Agrega la edición a `docs/IDEAS_DIARIAS.md` y, en el mismo cambio, escribe los
veredictos que Salva haya dado desde la edición anterior. Eso es un PR de
documentación, sin cambio perceptible: no lleva la pausa de la demo. Ábrelo,
espera los checks y mergéalo tú.

Luego preséntale las tres ideas en el chat, completas. El PR es el archivo; el
mensaje es lo que él lee.

## Cuando dice que sí

Ya no es esta skill. Es el flujo normal de `CLAUDE.md`: rama corta, implementas,
pausa de la demo con capturas, PR, merge. Lo único extra es marcar la idea como
`construida` en la bitácora dentro de ese mismo PR.

Si dice que sí a varias, empieza por la más chica, para que el día termine con
algo desplegado.

## Lo que no es una idea

- Actualizar dependencias, mover archivos, subir cobertura de tests. Eso es
  mantenimiento, y ya tiene su propio camino.
- Algo que ya está planeado a detalle en `docs/NEGOCIO.md`, `docs/AGENTE_IA.md`
  o `docs/ROADMAP_ARQUITECTURA.md` **y** ya tiene fecha. Si está planeado pero
  parado hace meses, sí vale proponerlo: di que ya existe el plan y dónde.
- Cualquier cosa que necesite una foto, un render o un STL que solo están en la
  carpeta `FORMA` de la PC de Salva. Puedes proponerla, pero ponlo en "qué
  necesito de ti" y no finjas que puedes empezar sin eso.
- Ideas que dependen de tener tráfico o clientes que todavía no hay.
