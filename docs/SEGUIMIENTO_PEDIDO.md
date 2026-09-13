# Seguimiento del pedido — plan por correo

**Estado: plan aprobado en concepto, sin implementar.** Nada de lo que está aquí
existe todavía. Los correos están diseñados y aprobados como maqueta (lienzo
"Correos de pedido" en Claude Design); el código, la cuenta de envío y los
registros de DNS no.

Idea 003 de `docs/IDEAS_DIARIAS.md`. Este documento es el plan; la bitácora solo
guarda el veredicto.

## 1. El hueco

`/gracias` le promete al cliente "te escribo cuando tu pieza salga de la
impresora". Hoy eso solo pasa si Salva se acuerda de escribir a mano: no hay
correos del pedido, no hay página pública de seguimiento y `/taller` está detrás
del `ADMIN_TOKEN`. Lo único que recibe el cliente es el recibo de Stripe, que
habla del cobro y no de la pieza.

Con lámparas que tardan horas en imprimirse, el silencio es justo donde la gente
se pone nerviosa y escribe preguntando. Cada uno de esos mensajes es trabajo
manual que este plan elimina.

## 2. La restricción que manda sobre todo lo demás

**Hostinger Reach no puede mandar estos correos, y no es cuestión de
configurarlo mejor.** Su API es de solo lectura para campañas: no hay endpoint
para crear una campaña ni para mandarla (`docs/MARKETING.md`). Reach es una
herramienta de correo masivo con una lista detrás; un correo de pedido es lo
contrario — un destinatario, disparado por un evento, sin lista.

Así que hacen falta **dos canales**, no uno:

| | Newsletter | Correos del pedido |
| --- | --- | --- |
| Qué es | Campaña a una lista | Transaccional, uno a uno |
| Quién lo manda | Hostinger Reach, a mano desde su web | El Worker, solo |
| Consentimiento | Suscripción explícita | No hace falta: es parte de la compra |
| Baja | La pone Reach | No lleva: no es marketing |

Confundirlos es el error caro: meter al comprador en la lista de marketing sin
que lo pida es exactamente lo que no se hace.

## 3. Qué sí comparten con el newsletter

Tres cosas concretas, y las tres valen la pena:

1. **El mismo motor de plantillas.** `newsletter/` ya construye correo de verdad
   con la marca aplicada: tablas, estilos en línea, modo oscuro, ancho de 600 px,
   Alan Sans con Arial de respaldo, y los colores leídos de
   `ds-bundle/tokens/colors.css` en vez de copiados. Los correos del pedido usan
   ese mismo motor. Un cambio de marca se hace una vez y aterriza en los dos.
2. **La invitación a la lista**, una sola vez, al final. Va en el último correo
   (el de "va en camino"), ya cumplido el pedido, con un botón secundario. No en
   el checkout, no en el de confirmación.
3. **El mismo endpoint de suscripción** que necesita el botón "Avísame" de `/mas`
   (idea 002). Se construye una vez y lo usan los dos.

### Lo que hay que separar para que eso funcione

`newsletter/tokens.ts` lee `ds-bundle/tokens/colors.css` con `readFileSync`. Eso
en el Worker no corre: no hay sistema de archivos. Pero el resto del motor ya
recibe la paleta como parámetro (`envolver(edicion, filas, paleta)`), así que el
corte es limpio:

- `layout.ts`, `bloques.ts` y `marca.ts` se quedan como están y se comparten.
- La paleta se hornea en una constante generada, que el Worker importa.
- Un test comprueba que esa constante no se haya separado de
  `ds-bundle/tokens/colors.css`, igual que `tokens.test.ts` ya vigila que
  `src/styles/brand.css` no se separe del design system.

## 4. Con qué se mandan

**Resend, desde el Worker, por HTTP.** Ya estaba nombrado como la opción futura
en `docs/NEGOCIO.md` §4a. Las razones: un Worker no puede hablar SMTP de forma
razonable, y Resend es API HTTP pura; su capa gratuita son 3,000 correos al mes y
100 al día, que con tres correos por pedido da más de treinta pedidos diarios —
muy por encima del volumen real.

### El DNS: ir por un subdominio, no por la raíz

Esta es la decisión con más riesgo del plan y conviene tomarla bien.

El DNS de `formamx.com` sostiene el sitio, el correo de `hola@formamx.com` y los
registros de envío de Reach (SPF, DKIM, DMARC, ya válidos). **Solo puede existir
un registro SPF por dominio**, así que verificar la raíz con Resend obliga a
*editar* el SPF que hoy usan Reach y Hostinger Mail. Editar ese registro es
justo lo que puede tumbar el correo del negocio.

Verificar `pedidos.formamx.com` en cambio **agrega** registros nuevos y no toca
ninguno existente. Es además lo que recomienda el propio Resend, porque aísla la
reputación de envío. La dirección queda así:

- **De:** `forma <hola@pedidos.formamx.com>`
- **Responder a:** `hola@formamx.com`, para que las respuestas caigan en el
  buzón real de Salva. Los correos invitan a contestar: es parte del tono.

## 5. Cómo funciona por dentro

### La bandeja de salida en D1

Una tabla `correos`: `id`, `order_id`, `tipo`, `destinatario`, `estado`
(`pendiente` · `enviado` · `fallido`), `intentos`, `ultimo_error`, `creado_at`,
`enviado_at`, `proveedor_id`.

La llave está en un **índice único sobre (`order_id`, `tipo`)**: cada pedido
recibe cada correo una sola vez, por más veces que se reintente el webhook de
Stripe o se toque el estado a mano. Es el mismo truco que ya usa
`webhook_events` para no duplicar pedidos.

### Quién escribe en ella

Los estados cambian desde tres lugares distintos (el webhook de Stripe, las
rutas de `/taller` y las del agente), así que el apunte **no** va en cada ruta:
va en `lib/orders.ts`, donde vive el grafo de estados. Una transición aceptada
escribe su fila y ya. Un solo sitio que tocar.

### Quién los manda

Un **Cron Trigger** del Worker, cada minuto: toma las filas pendientes, arma el
HTML, llama a Resend, marca el resultado. Si Resend falla, la fila se queda
pendiente con un intento más y se reintenta; no se pierde nada. Los Cron
Triggers están en la capa gratuita.

Mandarlos en línea con `ctx.waitUntil` sería menos código, pero un fallo de
Resend se tragaría el correo en silencio. Con la bandeja de salida ya escrita, la
decisión es reversible.

## 6. Los correos

Diseñados y aprobados en maqueta. Tres por pedido, uno por cada momento en que al
cliente le importa algo, más un caso aparte.

| # | Cuándo sale | Qué dice |
| --- | --- | --- |
| 1 | El pedido pasa a `pagada` | Ya está en el taller, qué pediste, a dónde va, cuánto tarda. No repite el recibo de Stripe |
| 2 | El pedido pasa a `imprimiendo` | Arrancó la impresión, el estado de las tres piezas, y que a veces se echa a perder |
| 3 | El pedido pasa a `enviada` | Paquetería y guía, cómo viene empacada, y la invitación a la lista |
| — | Pedido OXXO recién creado (`pendiente`) | La ficha está lista, la tienda tarda en reportar, qué pasa si no se paga |

Deliberadamente **no** hay correo en `en_cola` ni en `lista`: son estados del
taller, no del cliente. Cuatro correos en vez de tres se sienten distinto.

El pie de estos correos dice "te llega porque hiciste un pedido" y **no lleva
enlace de baja**: no es marketing y no hay lista de la que salir. Sí lleva razón
social y domicilio, igual que el newsletter.

## 7. La página de seguimiento

`/pedido?t=<token>`. Sin contraseña y sin cuenta: el enlace es la llave, y va en
los tres correos.

- El token es aleatorio y se guarda en el pedido. **No es el `order_id`**, que es
  corto y adivinable.
- `GET /api/pedido/:token`, ruta pública, devuelve **solo** el estado, el avance
  de las tres piezas, la fecha y la guía. Ni nombre, ni dirección, ni correo,
  ni teléfono: quien tenga el enlace no debe poder sacar datos personales de él.
- El sitio es estático en Hostinger, así que no puede generar una página por
  pedido: `/pedido` es una sola página que lee el token de la URL y consulta.
  Por eso el token va en la query y no en la ruta (las maquetas dibujan
  `formamx.com/pedido/4f2a` porque se lee mejor; la forma real es la query).

## 8. Fases

Cada una se despliega sola y deja algo servible.

**Fase A — la página de seguimiento.** Migración del token, ruta pública en el
Worker, página `/pedido` en el sitio. Todavía sin correos: el enlace se manda a
mano y ya resuelve la pregunta de "¿dónde va lo mío?".
*Salva: nada.*

**Fase B — la bandeja de salida y el primer correo.** Tabla `correos`, el apunte
en `lib/orders.ts`, el Cron Trigger, el motor compartido con `newsletter/`, y el
correo 1. Aquí entran la cuenta de Resend y el subdominio.
*Salva: crear la cuenta de Resend y los registros del subdominio.*

**Fase C — los otros correos.** El 2, el 3 y el de OXXO. Sin piezas nuevas: la
maquinaria ya está.
*Salva: nada.*

**Fase D — la invitación a la lista.** El endpoint de suscripción (compartido con
el botón "Avísame" de la idea 002), la tabla de suscriptores y el alta en Reach
por `reach_createNewContactsV1`.
*Salva: confirmar en Reach que los contactos llegaron.*

## 9. Lo que hay que resolver antes de arrancar

- **El aviso de privacidad no existe** (`docs/NEGOCIO.md` §2a). Para las fases A
  a C no bloquea: un correo transaccional es parte de cumplir la compra. Para la
  fase D sí importa, porque ahí se recaba un correo para una finalidad distinta
  de la venta. La fase D va después de §2a, no antes.
- **El domicilio fiscal está sin confirmar contra el SAT.** El pie de estos
  correos usa el mismo `EMPRESA` que el newsletter, así que hereda el pendiente
  que ya está anotado en `docs/MARKETING.md`.
- **Los registros de DNS los toca Salva o los tocamos con su visto bueno.** Son
  registros nuevos en un subdominio, no ediciones a los que sostienen el correo,
  que es el caso seguro — pero sigue siendo DNS de `formamx.com`.
