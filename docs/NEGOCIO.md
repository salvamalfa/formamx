# Negocio — plan por fases (cobrar, legal, producto, operación)

Plan de referencia para cerrar los puntos ciegos del negocio: cobrar de
verdad, cumplir lo legal mínimo, afinar producto y precio, y operar sin
sustos. **Estado: la fase 6b (CI) está implementada; las demás siguen
pendientes.** Las fases pendientes se ejecutan una por una cuando Salva lo
pida y cada una se mergea sola.

**Aviso importante:** los textos legales de este plan son borradores
redactados sin ser abogados, a partir de fuentes públicas (citadas al final).
Un abogado debe revisar el aviso de privacidad y los términos; un contador,
todo lo fiscal (CFDI, régimen de la SAS). Donde quedó ambigüedad, el doc dice
"confirmar con abogado/contador" en lugar de inventar.

## Orden por importancia y por qué

1. **Cobrar (Stripe live + SAS)** — sin esto no hay negocio; además es el
   trámite más lento (SAS → RFC → banco), hay que arrancarlo ya aunque se
   termine al final.
2. **Legal** — no es solo riesgo propio: **bloquea al 1**. Stripe revisa el
   sitio al activar la cuenta y exige política de devoluciones, términos y
   contacto visibles; y la LFPC (art. 76 bis) obliga a publicar términos
   antes de vender en línea.
3. **Producto y precio** — el precio nuevo debe estar en la BD **antes** del
   primer cobro real; si no, los primeros pagos live salen a $499 perdiendo
   el costo de envío.
4. **Post-venta y envíos** — importa en cuanto haya ventas reales; sin
   proceso de envío el punto 1 solo genera pedidos que no llegan.
5. **Respaldos** — protege contra pérdida de datos (riesgo pasivo, pero con
   dinero de por medio conviene no dejarlo para el final).
6. **Monitoreo y CI** — evita regresiones y caídas silenciosas cuando ya hay
   dinero de por medio.
7. **Analytics** — útil, pero lo último: primero cobrar, cumplir y entregar.

### Mapa de dependencias

```
§2a legal (páginas) ──┐
§3b precio nuevo ─────┼──► §1c Stripe live (smoke test con dinero real)
§1a trámites SAS ─────┘          │
   (Salva, semanas)              ▼
§2b CFDI (necesita RFC + CSD)  §4 post-venta
§5, §6, §7: sin dependencias entre sí, después del live
```

---

## §1 — Cobrar de verdad: SAS + Stripe live

**Por qué importa.** Stripe está en modo prueba: el sitio simula vender. Todo
lo demás es decorado si no entra dinero.

### Fase 1a — trámites de la SAS (los hace Salva; Claude solo documenta)

1. **SAS constituida** — "FORMA STUDIO S.A.S." (razón social en aprobación,
   portal gob.mx/tuempresa). Al constituirse por el sistema electrónico, la
   SAS queda inscrita en el RFC en el mismo trámite.
2. **RFC + e.firma de la sociedad** — la e.firma de la persona moral requiere
   cita en el SAT (llevar acta constitutiva e identificación del representante
   legal). Sin e.firma no hay CSD ni facturación (§2b).
3. **Constancia de Situación Fiscal (CSF)** de la SAS en PDF — se descarga del
   portal del SAT; Stripe la exige tal cual (lee el QR, no acepta otro
   documento).
4. **Cuenta bancaria empresarial** a nombre de la SAS con CLABE. Nota honesta:
   no todos los ejecutivos bancarios conocen bien la figura SAS; preguntar
   antes de agendar (BBVA, Banorte y Santander la manejan). Llevar acta o
   boleta de inscripción, CSF e identificación del representante.
5. **Contador** — la SAS presenta declaraciones mensuales desde el primer mes;
   conseguir contador es parte de esta fase, no un opcional. Él decide el
   régimen (evaluar RESICO de personas morales) y la periodicidad de la
   factura global (§2b).

**Claude:** este checklist y nada más (no puede hacer trámites). **Salva:**
todo. **Verificación:** CSF de la SAS descargada + CLABE activa.
**Dependencias:** ninguna; arranca ya, tarda semanas.

### Fase 1b — perfil de negocio en Stripe

**Decisión: se activa la cuenta ACTUAL, no se crea una nueva.** La cuenta
nunca se ha activado — el perfil de negocio (tipo de entidad, datos fiscales)
se captura precisamente al activarla, así que no hay nada de "persona física"
que corregir; conservarla mantiene el código, los webhooks y el historial de
prueba. Se activa como **empresa (persona moral)** con los datos de la SAS.

Lo que Stripe México pide para activar: razón social y RFC de la SAS, **CSF
en PDF** subida al dashboard, domicilio, representante legal con
identificación oficial, datos de accionistas relevantes, **CLABE a nombre de
la SAS**, y un **sitio web público** que describa el negocio con precios,
contacto y política de devoluciones visible — por eso §2a va antes. Revisar
que **OXXO quede habilitado en live** (Settings → Payment methods; puede
requerir solicitud aparte).

**Claude:** deja el sitio listo (§2a, §3). **Salva:** captura en el dashboard
de Stripe. **Verificación:** cuenta "activada", métodos card y OXXO en live.
**Dependencias:** 1a completa y §2a mergeada.

### Fase 1c — llaves live + prueba de humo

1. En el dashboard (modo live): copiar `sk_live_…` y crear el webhook live
   apuntando a `https://formamx-api.formamx.workers.dev/api/webhook/stripe`
   (misma ruta que hoy en test; confirmar el path exacto en
   `workers/api/src/index.ts` al implementar) con los mismos eventos que el de
   test → `whsec_…`.
2. `cd workers/api && npx wrangler secret put STRIPE_SECRET_KEY` y
   `npx wrangler secret put STRIPE_WEBHOOK_SECRET` (los 2 únicos secretos; no
   hay publishable key en el frontend porque Checkout es hosted y la sesión se
   crea server-side en `checkout.ts`).
3. **Prueba de humo con dinero real:** Salva compra una lámpara con su propia
   tarjeta al precio ya nuevo (§3b). Verificar: pago en el dashboard live →
   webhook 200 → pedido `pagada` en /taller → monto correcto en
   `orders.amount_mxn`.
4. **Reembolso** desde el dashboard de Stripe → verificar qué hace el webhook
   con el evento de refund. Si no lo maneja, el pedido se cancela a mano en
   /taller (documentarlo al implementar).
5. Nota que va también en los términos (§2a): **los pagos OXXO no se pueden
   reembolsar vía Stripe**; un reembolso de OXXO es una transferencia manual
   al cliente. Tampoco generan contracargos.
6. Actualizar `CLAUDE.md`: quitar "AÚN EN MODO PRUEBA" y el pendiente.

**Claude:** pasos, verificación del webhook, PR del CLAUDE.md. **Salva:**
pegar los secretos (o pasárselos a Claude por canal seguro, **nunca por
chat**) y hacer la compra y el reembolso.
**Verificación:** el ciclo completo compra → pedido → reembolso con dinero
real. **Dependencias:** 1b, §2a, §3b.

---

## §2 — Páginas legales y facturación

**Por qué importa.** Hoy el sitio recaba nombre, correo, teléfono y dirección
(vía Stripe Checkout, guardados en D1 como `customer_*` y `shipping_json`)
**sin aviso de privacidad**, y vende **sin términos** — ambos obligatorios y
prerequisito de Stripe.

### Fase 2a — aviso de privacidad + términos + footer (corre en: sitio)

Contexto legal verificado (resumido; todo es borrador):

- **LFPDPPP nueva**: publicada en el DOF el 20 de marzo de 2025, vigente desde
  el 21; desapareció el INAI (la autoridad ahora depende de la Secretaría
  Anticorrupción y Buen Gobierno). Elementos mínimos del aviso de privacidad:
  (1) identidad y domicilio del responsable (la SAS cuando exista; mientras,
  Salva como persona física — el aviso se actualiza al constituirse);
  (2) datos personales tratados, señalando si hay sensibles (no los hay);
  (3) finalidades, distinguiendo las que requieren consentimiento
  (necesarias: procesar el pedido y el envío; voluntarias: avisarte de piezas
  nuevas — el formulario de correo del footer); (4) medios para limitar uso o
  divulgación; (5) mecanismo para ejercer derechos ARCO (un correo basta a
  esta escala); (6) procedimiento para comunicar cambios al aviso. Por
  transparencia el borrador menciona a los encargados: Stripe (pago),
  Cloudflare (base de datos) y la paquetería (envío).
- **LFPC art. 76 bis**: los términos de venta en línea deben especificar
  costos adicionales, formas de pago, plazos de entrega, garantías,
  restricciones geográficas y políticas de cambios, devoluciones y
  cancelación.
- **LFPC art. 56 (dato incómodo, se dice tal cual):** en ventas por internet
  el contrato se perfecciona a los **5 días hábiles** de la entrega; en ese
  plazo el cliente puede **revocar sin responsabilidad** y el proveedor
  devuelve el precio (el envío de retorno corre por cuenta del cliente). **No
  se encontró en la LFPC una excepción para productos personalizados o hechos
  bajo pedido** (a diferencia de la UE): el borrador de términos acepta la
  devolución de 5 días hábiles incluso para lámparas configuradas, marcado
  como "confirmar con abogado si se puede acotar".
- **Garantía (LFPC art. 77):** si se ofrece, mínimo **90 días** desde la
  entrega. Lo simple: ofrecer exactamente 90 días contra defectos de
  fabricación (no cubre mal uso, p. ej. foco incandescente — enlaza con §3a).

Trabajo técnico:

- `src/pages/privacidad.astro` y `src/pages/terminos.astro` — nuevas, con
  `BaseLayout` y la estructura de `gracias.astro` como molde de página de
  texto (header con logo, columna angosta, tokens de marca). Estas SÍ se
  indexan (no llevan `noindex`).
- `src/components/SiteFooter.astro` — nuevo: enlaces a /privacidad, /terminos
  y correo de contacto. En `index.astro` se integra con el footer local
  existente (conservar el formulario de correo, añadir la fila de enlaces
  legales); en `lampara.astro`, `banca.astro` y `gracias.astro` se inserta el
  componente (hoy no tienen footer).
- Los textos: Claude los redacta como **BORRADOR**, con fecha de última
  revisión visible en cada página.

**Claude:** todo (textos borrador + código + PR). **Salva:** leer los
borradores, aportar domicilio y correo de contacto, y —cuando pueda— pasarlos
por un abogado. **Verificación:** `npx astro check`, build, un spec Playwright
nuevo (footer presente en las páginas; /privacidad y /terminos responden con
su h1), revisión visual en móvil. **Dependencias:** ninguna técnica; el texto
se actualiza con la razón social cuando la SAS exista.

### Fase 2b — proceso CFDI (mundo real + un párrafo en el sitio)

La SAS emitirá CFDI 4.0. Datos a pedir al cliente que solicite factura: **RFC,
nombre o razón social exactos, código postal fiscal, régimen fiscal y uso del
CFDI** — lo práctico es pedirle su **Constancia de Situación Fiscal** y
capturar tal cual. Herramienta: empezar con el **servicio de facturación
gratuito del SAT** ("Genera tu factura", personas físicas y morales); requiere
e.firma y generar el **CSD** de la SAS. Un PAC comercial queda como upgrade si
el volumen lo pide. Ventas sin RFC del cliente → **factura global al público
en general** con la periodicidad que defina el contador (confirmar con él:
periodicidad y régimen).

Proceso operativo (checklist en el doc al implementar): el cliente escribe al
correo de contacto pidiendo factura, con su CSF, **dentro del mismo mes de la
compra** (regla práctica; confirmar el plazo exacto con el contador) → Salva
emite en el portal del SAT → envía XML + PDF por correo. Técnica mínima
opcional: una línea en `gracias.astro` y en /terminos: "¿Necesitas factura?
Escríbeme con tu constancia de situación fiscal en el mismo mes de tu compra."

**Claude:** checklist, plantilla de correo de respuesta, línea en
gracias/términos. **Salva:** CSD, altas en el portal del SAT, emitir.
**Verificación:** emitir una factura real de la compra del smoke test (1c) —
mata dos pájaros. **Dependencias:** RFC + e.firma (1a).

---

## §3 — Producto y precio

### Fase 3a — decir lo que incluye la lámpara (y el tema NOM, con honestidad)

- `src/pages/lampara.astro`: añadir "incluye kit eléctrico completo: socket,
  cable con apagador y foco LED" + advertencia visible: **"úsala solo con foco
  LED"** — el PLA se deforma desde ~60 °C; un incandescente la arruina y anula
  la garantía (enlaza con los términos, §2a).
- **NOM, párrafo honesto:** la **NOM-003-SCFI-2014** (productos eléctricos,
  especificaciones de seguridad) aplica en lectura estricta a fabricantes y
  comercializadores de productos eléctricos conectados a la red — una lámpara
  con socket, cable y clavija lo es. La certificación es por modelo, ante
  organismos acreditados (ANCE/NYCE), con costos de decenas de miles de pesos:
  **impracticable a escala de taller de una persona**. Riesgo práctico a este
  volumen: bajo (la verificación se concentra en importación y retail), pero
  no cero, y el doc no lo esconde. Mitigación práctica: (1) armar el kit **solo
  con componentes que ya traen su propia certificación** (socket, cable con
  clavija marcada NOM, foco LED — que además cae bajo NOM-030-ENER, cubierta
  por su fabricante) y guardar las facturas de compra; (2) especificar foco LED
  de baja potencia e instrucciones de uso; (3) consultar a un especialista en
  NOMs si el volumen crece o si se quiere vender a retail/mayoreo. La
  NOM-031-ENER es de luminarios de vialidades y exteriores: no aplica.

### Fase 3b — precio nuevo con envío incluido

Decisión de Salva: subir el precio y anunciar "envío incluido" (no tarifa
aparte). Ventaja técnica: `orders.amount_mxn` se guarda desde
`session.amount_total` en el webhook, así que con el envío dentro del precio
**no cambia la contabilidad** (a diferencia de `shipping_options`, que
mezclaría producto y envío en el total).

Cálculo (Salva rellena los costos reales de §4a):

```
precio ≥ (costos + margen) / (1 − 0.036 × 1.16)   ← comisión Stripe 3.6% + $3 + IVA sobre la comisión

Ejemplo con supuestos a validar:
  paquetería nacional        $200   (cotizar: rango 150–250)
  filamento (~200 g)          $70
  kit eléctrico              $120
  empaque                     $40
  comisión Stripe (a $699)    $33
  neto a $699 ≈ $236 antes de luz / máquina / tiempo
  neto a $749 ≈ $284
```

Con $699 el margen se parece al actual de $499 sin envío solo si la paquetería
sale ≤ $200. **Recomendación: $749** para tener colchón (o $699 si las
cotizaciones reales salen baratas). Decisión final: Salva, con 2-3
cotizaciones en mano.

Dónde se cambia (el precio SIEMPRE sale de la BD — `checkout.ts` valida y usa
`product.price_mxn`):

- **Migración de datos** `workers/api/migrations/NNNN_precio_lampara.sql` con
  `UPDATE products SET price_mxn = 74900 WHERE id = 'lampara';` — en migración
  y no en `d1 execute` suelto, para que quede en git. La numeración de 4
  dígitos se asigna **al implementar**, según el orden real de merge (el plan
  del agente reservó conceptualmente 0011-0012, pero el número lo da el merge,
  no los planes).
- `src/components/LampConfigurator.tsx` — hoy el "$499 MXN" está
  **hardcodeado**; se actualiza el literal ahora, y en la fase 4b el
  configurador pasa a leer `GET /api/products/lampara` (que ya devuelve
  `price_mxn`), matando el bug de doble fuente.
- Textos "envío incluido": /lampara (nuevo) y `banca.astro` (ya dice "envío
  CDMX incluido" — se conserva; la banca no cambia de precio).

**Verificación:** `migrate:local` + `wrangler dev` + crear una sesión de
checkout local y ver el monto; ajustar el spec de checkout si mockea precios.
**Dependencias:** cotizaciones de §4a; **debe mergearse antes de 1c**.

### Fase 3c — promesa de entrega publicada

Producción bajo pedido con una impresora: prometer holgado. Fórmula: "tu
lámpara sale de mi taller en ≤ N días hábiles; la paquetería tarda 2-6 más".
Salva fija N midiendo horas de impresión por lámpara × cola típica + armado
del kit (propuesta inicial: N = 5). Se publica en /lampara, /gracias y
términos (el art. 76 bis exige plazos de entrega). **Claude:** textos.
**Salva:** el número N. **Verificación:** revisión de textos + que la promesa
se cumpla en el primer pedido real.

### Fase 3d — unit economics simples

Empezar con una **tabla en el apéndice de este doc** por pieza: filamento
(g × $/g), kit, empaque, paquetería, comisión, horas-máquina, tiempo de Salva
→ costo total y margen a precio actual. Salva la rellena una vez y la revisa
al cambiar de proveedor. Enganche futuro: cuando exista el inventario de
bobinas (`docs/AGENTE_IA.md` fases futuras / `docs/ROADMAP_ARQUITECTURA.md`
§7, `bobinas.cost_mxn`), el costo de filamento por trabajo saldrá solo; la
tabla manual es el puente. Sin código en esta fase.

---

## §4 — Post-venta y envíos

### Fase 4a — proceso operativo manual (sin código)

Checklist (al implementar): (1) Salva cotiza y elige paquetería default (2-3
cotizaciones reales: Estafeta / DHL / Paquetexpress, directo o vía broker tipo
Envia.com o Mienvío, sin casarse; el resultado alimenta 3b); (2) receta de
empaque para pieza 3D frágil: caja con relleno, el kit eléctrico embolsado
aparte, prueba de sacudida; (3) quién imprime la guía: Salva desde el portal
del broker en su PC; (4) **aviso al cliente**: plantilla de correo (la redacta
Claude) que Salva manda a mano al marcar `enviada` en /taller, con número de
guía y liga de rastreo — hoy el cliente solo recibe el recibo de Stripe.
Automatizar después (el Worker no manda correos; opciones futuras: Resend
desde el Worker, o el módulo de envíos + el bot de Telegram).
**Verificación:** primer envío real con la plantilla.

### Fase 4b — pausar ventas + disponibilidad en el configurador (worker + sitio)

Hoy no hay `UPDATE products` en rutas admin: pausar es SQL a mano. Y
`LampConfigurator.tsx` **no consulta** `/api/products` (BuyBanca sí), así que
un producto pausado se descubriría al fallar el checkout.

- Worker: `PATCH /api/admin/productos/:id` con body `{active?, stock?}` —
  sub-app nueva `workers/api/src/routes/admin/productos.ts` montada con prefijo
  (`admin.route('/productos', …)` en `routes/admin/index.ts`), validación en
  `workers/api/src/lib/productos.ts` (rutas delgadas, lib sin imports de
  routes). Sin migración: `active` y `stock` ya existen.
- Cliente: `src/lib/taller/productos.ts` + re-export en `index.ts`.
- UI: control de pausa en /taller (módulo mínimo según la receta §8 del
  roadmap, o un control en el panel de pedidos si un módulo entero es
  demasiado — empezar por lo pequeño).
- Configurador: `LampConfigurator.tsx` consulta `GET /api/products/lampara` al
  montar (`{id, available, price_mxn}` ya existe): muestra el precio desde la
  BD (cierra el hardcode de 3b) y, si `!available`, aviso "pausado
  temporalmente" + botón deshabilitado, patrón de `BuyBanca.tsx`.

**Claude:** todo. **Salva:** nada (gana el control). **Verificación:**
typecheck del worker, curl contra `wrangler dev` (PATCH con y sin token),
specs nuevos en `tests/e2e/taller.spec.ts` y `checkout.spec.ts` con
`page.route`; orden de deploy worker → sitio (§8.7 del roadmap: el frontend
nuevo nunca exige un worker que no existe).

### Fase 4c — módulo de envíos formal (futuro, boceto)

Cuando el volumen lo pida: tabla `shipments` tal cual el boceto de
`docs/ROADMAP_ARQUITECTURA.md` §7 + la receta §8 completa (migración, lib,
rutas, cliente, panel, specs). Este doc solo lo referencia. **Disparador:**
más de 2-3 envíos por semana, o un reenvío perdido.

---

## §5 — Respaldos

### Fase 5a — export de D1

**Recomendación: GitHub Actions con cron semanal.** La PC de Salva no está
siempre encendida y la futura Mac mini tampoco; Actions corre solo y el repo
ya es privado. Workflow `.github/workflows/backup-d1.yml`: cron semanal →
`npx wrangler d1 export formamx --remote --output=backup.sql` → subir como
**artifact** con retención de 90 días. **NO commitear el dump:** contiene PII
de clientes y el historial de git es para siempre. Secreto
`CLOUDFLARE_API_TOKEN` en GitHub (un token de Cloudflare con permiso D1,
idealmente uno aparte solo-D1).
Rutina de Salva: descargar un artifact al mes a su disco.

**Verificación:** correr el workflow a mano (`workflow_dispatch`), descargar
el artifact e importarlo en un D1 local (`migrate:local` + import),
comprobando que hay filas en `orders`.

### Fase 5b — 3MF + perfiles de Bambu Studio (PC de Salva)

Viven SOLO en `C:\formamx\3mf\` y en los presets de Bambu Studio. Pasos
PowerShell (Salva los pega una vez):

```powershell
# Tarea diaria 21:00: espeja los 3MF a OneDrive (cambiar el destino a un disco
# externo si se prefiere).
$dest = "$env:OneDrive\formamx-respaldo"
$action = New-ScheduledTaskAction -Execute "robocopy.exe" `
  -Argument "C:\formamx\3mf $dest\3mf /MIR /R:2 /W:5 /LOG:$dest\3mf.log"
$trigger = New-ScheduledTaskTrigger -Daily -At 21:00
Register-ScheduledTask -TaskName "formamx respaldo 3mf" -Action $action -Trigger $trigger

# Segunda tarea igual para los perfiles de Bambu Studio:
#   origen:  $env:APPDATA\BambuStudio\user
#   destino: $dest\bambu-perfiles
```

Nota que va en el doc: `/MIR` **borra en el destino lo que se borró en el
origen** — es espejo, no historial. Si Salva quiere historial, cambiar `/MIR`
por `/E`. **Verificación:** borrar un archivo de prueba del espejo y ver que
reaparece tras la tarea; revisar el `.log`. **Claude:** comandos y doc.
**Salva:** pegarlos y verificar.

---

## §6 — Monitoreo y CI

### Fase 6a — uptime

**Recomendación: UptimeRobot gratis ya, y NO moverlo a la Mac después.** La Mac
(`docs/AGENTE_IA.md` fase B2) avisará de eventos de negocio, pero un monitor
de uptime debe mirar desde FUERA de tu red y no morir con tu luz — son roles
distintos, no duplicados. Monitores: `https://formamx.com` y un endpoint del
Worker que toque D1 (empezar con `/api/products/lampara`; un `/health` trivial
después si molesta). Alertas al correo de Salva; cuando el bot exista,
UptimeRobot puede además llamar un webhook — fase futura.

### Fase 6b — CI en GitHub Actions (implementada)

`.github/workflows/ci.yml` corre en cada PR y push a `master`. El ruleset
`Protect master` exige sus 4 jobs:

1. **sitio**: `npm ci` + `npm run check` + `npm run build`.
2. **worker**: `cd workers/api && npm ci && npm run typecheck`.
3. **agente**: instalar `agent/requirements.txt` + `python -m pytest
   agent/tests`.
4. **e2e**: `npx playwright install chromium --with-deps` +
   `npx playwright test` — `playwright.config.ts` ya contempla `CI` y el
   `webServer`; en CI no se usa `PW_CHROMIUM_PATH` (eso es del sandbox local).

Cada PR lleva auto-merge con método squash: GitHub espera estos cuatro checks
y que todas las conversaciones estén resueltas antes de mergear a `master`.
**Verificación:** CI bloquea el merge cuando un check falla y auto-merge lo
completa al volver a verde. **Claude:** todo. **Salva:** nada.
**Dependencias:** ninguna (independiente del deploy a Hostinger, que no se
toca).

---

## §7 — Analytics

**Cloudflare Web Analytics** (gratis, sin cookies — al no usar cookies ni
identificadores no complica el aviso de privacidad de §2a; aun así el aviso lo
menciona en una línea por transparencia).

- Salva (2 min): crear el sitio en el dashboard de CF → copiar el token del
  beacon.
- Claude: snippet en `src/layouts/BaseLayout.astro` (head):
  `<script is:inline defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"…"}'></script>`
  — script externo con `defer`, sin inline, compatible con la CSP de hashes.
- CSP en `astro.config.mjs`: añadir `https://static.cloudflareinsights.com` a
  `scriptDirective.resources` y `https://cloudflareinsights.com` a
  `connect-src`. El hook `cspLenientStyleSrc` solo reescribe `style-src`: no
  interfiere.
- **Embudo del configurador, versión simple:** NO añadir eventos custom
  todavía. Métrica proxy: pageviews de /lampara (CF Analytics) vs pedidos en
  D1 (módulo de métricas de `docs/AGENTE_IA.md` fase B3). Si algún día hace
  falta el paso "abrió el configurador", la opción barata es un
  `navigator.sendBeacon` a un endpoint del Worker con contador diario
  agregado — se difiere con criterio de reevaluación.

**Verificación:** deploy → datos en el dashboard de CF a las 24 h; consola del
navegador sin errores de CSP en las páginas. **Dependencias:** ninguna (ideal
después de §2a para que el aviso ya lo mencione).

---

## Resumen

| Fase | Esfuerzo | Quién | Bloquea a |
| --- | --- | --- | --- |
| §1a trámites SAS | alto (semanas) | Salva | 1b, 1c, 2b |
| §1b perfil Stripe | medio | Salva | 1c |
| §1c live + smoke test | bajo | Claude + Salva | — |
| §2a legal + footer | medio | Claude | 1b |
| §2b CFDI | medio | Salva | — |
| §3a kit + NOM | bajo | Claude | — |
| §3b precio nuevo | bajo | Claude (Salva decide $) | 1c |
| §3c promesa de entrega | bajo | Claude (Salva fija N) | — |
| §3d unit economics | bajo | Salva | — |
| §4a envío manual | bajo | Salva (Claude plantilla) | 3b (cotización) |
| §4b pausar ventas | medio | Claude | — |
| §5a backup D1 | bajo | Claude | — |
| §5b backup 3MF | bajo | Salva guiado | — |
| §6a uptime | bajo | Salva (2 min) | — |
| §6b CI | medio | Claude | — |
| §7 analytics | bajo | Claude + Salva | — |

**Verificación global por fase con código:** `npx astro check`, typecheck del
worker, `wrangler dev` + `migrate:local`, Playwright
(`PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test`), pytest del
agente. Orden de deploy siempre: migración remota → worker → sitio.

**Recordatorio legal.** Los textos de §2 son borradores: un abogado revisa
privacidad y términos; un contador revisa CFDI y régimen. Puntos abiertos
marcados "confirmar": excepción de retracto en personalizados (§2a), plazo de
emisión del CFDI y periodicidad de la factura global (§2b), alcance real de la
NOM-003 para el ensamble (§3a).

## Fuentes

- Stripe — [información requerida para abrir cuenta en México](https://support.stripe.com/questions/required-information-to-open-your-stripe-account-in-mexico)
  y [Constancia de Situación Fiscal obligatoria](https://support.stripe.com/questions/accounts-from-mexico-update-your-tax-information)
- Stripe docs — [pagos OXXO: sin reembolsos ni contracargos](https://docs.stripe.com/payments/oxxo)
- Nueva LFPDPPP 2025 — [Garrigues](https://www.garrigues.com/es_ES/noticia/mexico-nueva-ley-federal-proteccion-datos-personales-posesion-particulares-introduce)
  y [KPMG](https://kpmg.com/mx/es/tendencias/2025/04/flash-nueva-ley-federal-de-proteccion-de-datos-personales-en-posesion-de-los-particulares.html)
- PROFECO — [compra en línea sin problemas](https://www.gob.mx/profeco/articulos/compra-en-linea-sin-problemas)
- LFPC — [art. 56 (revocación 5 días hábiles)](https://leyes-mx.com/ley_federal_de_proteccion_al_consumidor/56.htm)
  y [texto vigente, arts. 76 bis y 77](http://www.diputados.gob.mx/LeyesBiblio/pdf/LFPC.pdf)
- DOF — [NOM-003-SCFI-2014](https://www.dof.gob.mx/nota_detalle.php?codigo=5394047&fecha=28%2F05%2F2015)
- SAT — [servicio de facturación CFDI 4.0 gratuito](https://www.sat.gob.mx/aplicacion/75169/servicio-de-facturacion-cfdi-version-4.0-(vigente-a-partir-del-1-de-enero-de-2022))
  e [inscripción de SAS en el RFC](https://wwwmat.sat.gob.mx/consultas/27517/consulta-los-requisitos-para-realizar-tu-inscripiocon-de-sociedades-por-acciones-simplificadas.)
