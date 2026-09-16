# Ideas diarias — bitácora

Memoria del agente que cada mañana propone tres cosas para construir en el
sitio. El procedimiento está en `.claude/skills/ideas-diarias/SKILL.md`; aquí
solo vive el registro.

**Para qué sirve este archivo:** sin él, el agente vuelve a proponer en
noviembre lo que dijiste que no en septiembre.

**El texto largo vive en el chat; aquí vive el índice.** Las tres ideas del día
se te entregan en la conversación. A este archivo baja un renglón por idea —
fecha, área, título y estado — y tu veredicto cuando contestas. El renglón viaja
montado en el siguiente PR que toque el repo, no en uno propio: un PR diario por
un archivo de texto es ruido.

## Estados

| Estado | Qué significa |
| --- | --- |
| `propuesta` | Sobre la mesa, esperando tu respuesta |
| `sí` | La quieres. Está en la cola de implementación |
| `no` | No la quieres. No se vuelve a proponer |
| `construida` | Ya está en producción |
| `sin respuesta` | Pasaron catorce días sin veredicto. Puede volver una vez más |

## Índice

| # | Fecha | Área | Idea | Estado |
| --- | --- | --- | --- | --- |
| 006 | 2026-09-13 | Móvil | Fotos reales de la lámpara encendida, en una casa | `propuesta` |
| 005 | 2026-09-13 | Móvil | Saber cuánta gente entra y dónde se cae | `propuesta` |
| 004 | 2026-09-13 | Móvil | Botones del configurador que se dejan tocar en el celular | `construida` |
| 003 | 2026-09-13 | Después de la compra | Seguimiento del pedido por correo y página pública | `sí` |
| 002 | 2026-09-13 | Captación | El botón "Avísame" guarda el correo de verdad | `propuesta` |
| 001 | 2026-09-13 | Cómo se comparte | Imagen de vista previa al compartir el sitio | `sí` |

---

## Edición 1 — 2026-09-13

Área del día: cómo se comparte y se encuentra el sitio. Primera edición, así
que la auditoría fue del sitio completo en vez de un área sola.

### 1. Imagen de vista previa al compartir el sitio

**Qué es.** Cuando alguien manda formamx.com por WhatsApp, Instagram o
Telegram, hoy sale un enlace pelón, sin foto. Con esto sale una imagen de la
pieza y el título, como cualquier enlace de una tienda seria.

**Por qué.** `BaseLayout.astro` declara `og:image` y `twitter:image` apuntando a
`/images/og-default.jpg`, pero en `public/` no existe ni ese archivo ni la
carpeta `images/`. Todas las páginas del sitio apuntan a un 404. Es el único
hueco del sitio que le pega a cada visita que llega por recomendación, que hoy
son casi todas.

**Tamaño.** Chico.

**Qué toca.** Solo el sitio: una imagen en `public/` y una por página en las
que valga la pena distinguirse (la lámpara con su render, la banca con su foto).

**Qué no incluye.** Generar las imágenes al vuelo por configuración de lámpara.
Eso es otra idea, más grande.

**Qué necesito de ti.** Una foto o render bueno para la imagen por defecto, en
1200 × 630. Si no tienes una a la mano, la armo recortando la foto de la banca
que ya está en el repo y me dices si pasa.

**Veredicto (2026-09-13).** Sí. Primero se probó con la foto de la banca
recortada, pero al verla Salva pidió el logo: una pieza suelta no representa el
enlace de la marca. Quedó el logo sobre tinta: en burbuja de chat el fondo oscuro se separa del globo en vez de fundirse con él. Tres ajustes que salieron de esa
misma revisión: el sufijo del título es la marca (`| forma`) y no el dominio
(`| formamx`), la portada no lleva sufijo porque ya se llama forma, y su
descripción perdió la frase de la bitácora.

### 2. El botón "Avísame" guarda el correo de verdad

**Qué es.** El formulario de correo de `/mas` y de la portada es decorado: el
botón no hace nada. Que al dejar el correo se guarde, salga un acuse y esa
persona entre a tu lista de Reach.

**Por qué.** El botón es `type="button"` sin handler y no hay ningún endpoint
de suscripción en el Worker. Ya lo tienes documentado como pendiente en
`docs/MARKETING.md`, y ya montaste todo el sistema para escribir ediciones del
newsletter: lo que falta es la puerta de entrada. Hoy alguien que quiere que le
avises no tiene cómo decírtelo. Y la API de Reach sí deja crear contactos
(`reach_createNewContactsV1`), así que el camino está abierto.

**Tamaño.** Medio.

**Qué toca.** Sitio (el formulario), Worker (una ruta nueva que guarda el correo
y llama a Reach, para no exponer el token en el navegador), D1 (una tabla de
suscriptores, que además te deja tener la lista aunque Reach falle).

**Qué no incluye.** Mandar el newsletter. Eso sigue siendo manual desde la web
de Reach por el límite de su API, y no cambia con esto.

**Qué necesito de ti.** Nada para empezar. Al final, confirmar en Reach que los
contactos llegaron.

### 3. Página pública de seguimiento del pedido

**Qué es.** Un enlace único por pedido donde el cliente ve en qué va lo suyo:
pagado, en cola, imprimiendo, lista, enviada. Sin contraseña, sin cuenta: el
enlace es la llave y va en el correo de confirmación.

**Por qué.** `/gracias` le promete al cliente "te escribo cuando tu pieza salga
de la impresora", y hoy ese aviso no existe: no hay página pública de
seguimiento, y `/taller` es tuyo y está detrás de tu token. O sea que la única
forma de cumplir esa promesa eres tú acordándote de escribir. Con lámparas que
tardan horas en imprimirse, ese es el momento en que la gente se pone nerviosa y
te escribe preguntando. Es lo que tiene cualquier tienda que vende hecho a mano
y aquí falta entero.

**Tamaño.** Grande.

**Qué toca.** Sitio (una página nueva), Worker (ruta pública que lee el pedido
por token), D1 (un token por pedido).

**Qué no incluye.** Mandar el correo con el enlace. Eso depende del sistema de
avisos que hoy está roto (ntfy bloquea a los Workers) y va en su propia fase.
Esta idea llega hasta "la página existe y funciona"; el enlace se lo pasas a
mano mientras tanto.

**Qué necesito de ti.** Decidir qué tanto le muestras al cliente. Mi propuesta:
el estado y nada más — ni fotos del avance, ni tiempos estimados que luego no se
cumplan.

**Veredicto (2026-09-13).** Sí, y creció: Salva pidió que el seguimiento fuera
**por correo**, no solo una página, y conectado con el newsletter. El plan
completo está en `docs/SEGUIMIENTO_PEDIDO.md`; las maquetas de los cuatro
correos, en el lienzo "Correos de pedido" de Claude Design. El hallazgo que
cambió el diseño: Reach no puede mandar correo transaccional, así que son dos
canales y no uno.

---

## Edición 2 — 2026-09-13 · móvil y accesibilidad

Ideas 004 a 006, con el detalle entregado en el chat. Medido con el sitio
corriendo a 390, 375 y 360 px.

Lo que salió bien, y por eso no generó idea: cero scroll horizontal en cualquier
ancho, los quince controles del configurador tienen nombre accesible, y el foco
de teclado se ve. Dos sospechas se cayeron al medirlas: los controles no se
cortan en pantallas chicas, y la lámpara no se ve chica (ocupa el 78 % del alto;
lo que parece aire es el margen transparente del PNG).
