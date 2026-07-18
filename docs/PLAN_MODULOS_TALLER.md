# Plan operativo — activación de los 5 módulos de /taller

Documento de trabajo TEMPORAL: guía la implementación de los módulos
bocetados en `docs/ROADMAP_ARQUITECTURA.md` §7 y se elimina en el PR de
cierre cuando todo esté mergeado (su historia queda en git). Si una sesión
de Claude se corta a medias, la siguiente retoma leyendo este doc y viendo
qué tabs existen ya en `src/components/taller/registry.ts`.

Alcance decidido con Salva: **los 5 módulos completos** — clientes, envios,
inventario, calidad, inbox. El "agente autónomo" NO entra aquí (tiene plan
propio en `docs/AGENTE_IA.md`). Un PR por módulo, squash-merge, rama corta
reiniciada desde master cada vez. **Deploy del worker al final, coordinado**:
los paneles nuevos toleran el worker viejo (su fetch falla → "No se pudo
cargar. Reintenta.", sin crashes), porque el sitio se auto-despliega en cada
merge y el worker no.

## Estado

| # | Módulo | Migración | Estado |
| --- | --- | --- | --- |
| 1 | clientes | ninguna (customers existe, 0008) | mergeado |
| 2 | envios | 0011_envios.sql | pendiente |
| 3 | inventario | 0012_inventario.sql | pendiente |
| 4 | calidad | 0013_calidad.sql | pendiente |
| 5 | inbox | 0014_inbox.sql | pendiente |
| — | cierre (ROADMAP + borrar este doc) | — | pendiente |

Cada PR de módulo actualiza su fila a "mergeado". La numeración de
migraciones se confirma con `ls workers/api/migrations/` al implementar;
0015 queda libre (candidato futuro: `spool_slots.bobina_id`, diferido a
propósito — NO se agrega en este plan).

## Convenciones comunes (se aplican, no se rediscuten)

- Receta §8 del roadmap completa por módulo, incluyendo actualizar la tabla
  de rutas de `workers/api/README.md` EN EL MISMO PR.
- Migración: cabecera `-- Migration number: NNNN <TAB> descripción` +
  comentarios del porqué; enums SIN CHECK; índices por status.
- IDs: `'<pfx>_' + crypto.randomUUID()` generado en la ruta (shp_, bob_,
  pza_, qc_, msg_).
- `lib/<m>.ts`: `interface XxxRow`, `shapeXxx` (omite columnas internas),
  grafo `Record<Status, Status[]>` + `canTransition` (patrón
  `lib/orders.ts`); jamás importa de `routes/`.
- Rutas: errores `{error:'snake_case'}` con 400/404/409; transiciones con
  UPDATE guardado `WHERE id = ? AND status = ?` → sin cambios = 409
  `transicion_concurrente` (patrón `routes/admin/pedidos.ts`).
- Cliente (`src/lib/taller/<m>.ts`): flechas sobre `call<T>()`;
  normalización defensiva `?? default` (patrón `getOrders`); re-export en
  `index.ts`.
- Panel (Preact, `class=`): contrato `Panel({manifest})`; fetch propio +
  `setInterval` 30 s con cleanup (patrón `coreData.load`); estados
  loading / error ("No se pudo cargar. Reintenta.") / vacío; mutaciones
  optimistas con rollback; botón "Actualizar" (`btn btn-ghost btn-sm`) —
  los e2e lo usan para re-poll; NO tocar `coreData.tsx`; tarjetas
  `rounded-[var(--radius-m)] border border-[var(--border-soft)]
  bg-[var(--surface-card)] p-5 shadow-[var(--shadow-card)]`; `meta-caps`,
  `input-brand`, chips; botones grandes (Salva opera del teléfono); labels
  del módulo en `<m>/labels.ts`.
- e2e en `tests/e2e/taller.spec.ts`: fixtures `const` arriba,
  `page.route('**/api/admin/<ruta>', …)`, `goto('/taller#<m>')` + login por
  UI (placeholder 'token' + botón Entrar), flags booleanos para asserts de
  mutación.
- Registry: orden final de tabs Pedidos, Clientes, Envíos, Inventario,
  Calidad, Inbox; actualizar el comentario `// futuros:`.

Archivos de referencia por capa: `workers/api/src/routes/admin/pedidos.ts`
(rutas/grafo/errores), `workers/api/src/lib/jobs.ts` (shape), `src/lib/
taller/pedidos.ts` (cliente), `src/components/taller/pedidos/
PedidosPanel.tsx` e `impresora/ImpresoraPanel.tsx` (paneles),
`tests/e2e/taller.spec.ts` (mocks).

## Módulo 1 — clientes (CRM)

Sin migración: `customers` existe (0008) y el webhook la puebla.

- `workers/api/src/lib/clientes.ts`: `CustomerRow` (+ agregados
  `order_count`, `last_order_at` del JOIN) y `shapeCustomer`
  (`order_count ?? 0`, `last_order_at ?? null`). Sin grafo.
- `workers/api/src/routes/admin/clientes.ts`
  (`admin.route('/clientes', clientes)`):
  - `GET /` → `{clientes}` — `SELECT c.*, COUNT(o.id) AS order_count,
    MAX(o.created_at) AS last_order_at FROM customers c LEFT JOIN orders o
    ON o.customer_id = c.id GROUP BY c.id` ordenado por último pedido
    desc; `?limit=` def 100 max 200.
  - `GET /:id` → `{cliente, pedidos}` — pedidos con `shapeOrder` de
    `_shape.ts` (sin jobs), limit 50; 404 `no_existe`.
  - `PATCH /:id` body `{notes: string}` (vacío = borrar) → cliente shaped;
    400 `notes_requerido` si no es string; 404 `no_existe`.
  - Sin POST/DELETE ni edición de nombre/email (nacen del webhook; son
    snapshot).
- Cliente: `getClientes`, `getCliente`, `patchClienteNotes`.
- Panel `clientes/ClientesPanel.tsx`: lista + detalle en el mismo panel
  (estado `selectedId`). Lista: búsqueda EN MEMORIA (nombre/email/teléfono,
  case-insensitive) con `input-brand`; tarjeta con nombre (o email),
  `meta-caps` con nº de pedidos y fecha del último. Detalle: botón
  "← Clientes", enlaces `tel:`/`mailto:`, historial de pedidos (chip
  `STATUS_LABEL` de `pedidos/labels`, `money`, `formatSync`), textarea de
  notas + "Guardar" optimista. Polling solo en vista lista. SIN labels.ts
  propio (reutiliza el de pedidos).
- e2e (2): lista + filtro oculta no-coincidentes; detalle + PATCH de notas
  (flag).
- OJO: este PR hace aparecer el tab bar (`MODULES.length > 1`) — verificar
  que los specs existentes sigan verdes.

## Módulo 2 — envios

Migración `0011_envios.sql` — tabla `shipments` según boceto §7:
`id` ('shp_'), `order_id` FK NOT NULL, `carrier`, `service`,
`tracking_number`, `label_url`, `cost_mxn`, `raw_json`, `status` def
'creada' (creada|en_transito|entregada|incidencia, sin CHECK),
`created_at` def now, `shipped_at`, `delivered_at`; índices por `order_id`
y `status`.

- Grafo: creada→[en_transito, incidencia]; en_transito→[entregada,
  incidencia]; incidencia→[en_transito, entregada]; entregada→[].
  `shapeShipment` OMITE `raw_json`. La transición a en_transito setea
  `shipped_at` con COALESCE; a entregada, `delivered_at`.
- Rutas `/api/admin/envios`:
  - `GET /` (`?status=`, `?order_id=`, `?limit=` def 100) → `{envios}`;
    default `status != 'entregada'`; JOIN a orders para incluir
    `pedido: {id, customer_name, shipping}` (shipping con `parseJson`).
  - `POST /` body `{order_id, carrier?, service?, tracking_number?,
    label_url?, cost_mxn?}` → envío 'creada'; 400 `order_id_requerido` /
    `pedido_no_existe`.
  - `PATCH /:id` body `{status}` → 400/404/409 estándar. Sin PATCH de
    tracking en v1: guía equivocada = crear otra (comentario en la ruta).
- Cliente: `getEnvios`, `createEnvio`, `patchEnvio` (`pedido ?? null`).
- Panel `envios/EnviosPanel.tsx`: botón "Nueva guía" despliega form —
  select de pedido (via `getOrders` filtrado a `status === 'lista'`;
  permitido: lo prohibido es coreData), carrier con `<datalist>` de
  CARRIERS, tracking, costo. Lista de guías activas: cliente, ciudad (de
  `pedido.shipping`), carrier + tracking (link si `label_url`), chip de
  estado, acciones según `NEXT_STEP_ENVIO` + "Incidencia" ghost. Entregada
  sale de la lista.
- labels: `ENVIO_STATUS_LABEL`, `NEXT_STEP_ENVIO`, `CARRIERS` = [Estafeta,
  DHL, FedEx, Correos de México, 99minutos, Entrega en mano].
- e2e (2): crear guía (flag POST `**/api/admin/envios`); avanzar estado
  (flag PATCH `**/api/admin/envios/*`). Mockear `**/api/admin/orders`.

## Módulo 3 — inventario

Migración `0012_inventario.sql` — dos tablas, un tema:
`bobinas`: `id` ('bob_'), `color_id`, `material` def 'PLA', `brand`,
`weight_g` def 1000, `weight_left_g` NOT NULL, `cost_mxn`, `status` def
'nueva' (nueva|en_uso|agotada), `created_at`/`updated_at` def now; índice
por status. `piezas`: `id` ('pza_'), `product_id` FK NOT NULL,
`config_json`, `print_job_id` FK NULL, `order_id` FK NULL, `qc_status`
NULL, `status` def 'en_stock' (en_stock|reservada|vendida|merma),
`location`, `created_at`; índices por status y order_id.

- Grafos: bobina nueva→[en_uso, agotada], en_uso→[agotada], agotada→[];
  pieza en_stock→[reservada, vendida, merma], reservada→[en_stock,
  vendida, merma], vendida→[], merma→[]. `QC_VALUES = ['ok','rechazada']`.
  Sin auto-agotar al llegar a 0 (siempre explícito).
- Rutas `/api/admin/inventario`:
  - `GET /bobinas` (`?status=`, def `!= 'agotada'`) / `POST /bobinas`
    (`{color_id?, material?, brand?, weight_g?, cost_mxn?}`;
    `weight_left_g = weight_g`; 400 `peso_invalido`) /
    `PATCH /bobinas/:id` (`{weight_left_g?, status?}`; peso entero ≥ 0;
    400/404/409).
  - `GET /piezas` (def `NOT IN ('vendida','merma')`) / `POST /piezas`
    (`{product_id, config?, location?, order_id?}`; valida product_id
    contra products y order_id si viene; 400 `product_id_requerido` /
    `producto_no_existe` / `pedido_no_existe`) / `PATCH /piezas/:id`
    (`{status?, location?, qc_status?}`; 400 `estado_desconocido` /
    `qc_invalido`).
- Cliente: `getBobinas`, `createBobina`, `patchBobina`, `getPiezas`,
  `createPieza`, `patchPieza`.
- Panel `inventario/InventarioPanel.tsx`: control segmentado
  "Bobinas | Piezas" (chips, default Bobinas). Bobinas: swatch
  (`colorSwatch`) + `colorLabel`, marca/material `meta-caps`,
  "650 g / 1000 g", editar peso inline (input numérico + Guardar), botones
  de grafo; form "Nueva bobina" (color de `SPOOL_COLORS`, material datalist
  MATERIALS, marca, peso def 1000, costo). Piezas: `PRODUCT_LABEL`, config
  resumida (lámpara: modelo + colores vía `colorLabel`; selects de alta
  reutilizan `src/config/lamps`), location inline, chips estado + QC,
  botones de grafo.
- labels: `BOBINA_STATUS_LABEL`, `PIEZA_STATUS_LABEL`, `QC_LABEL`,
  `PRODUCT_LABEL` {lampara: 'Lámpara', 'banca-001': 'Banca'},
  `MATERIALS` = [PLA, PETG].
- e2e (2): alta de bobina + editar peso (flags POST/PATCH sobre
  `**/api/admin/inventario/bobinas*`); sección Piezas + transición.

## Módulo 4 — calidad

Migración `0013_calidad.sql` — tabla `qc_registros`: `id` ('qc_'),
`order_id` FK NOT NULL, `print_job_id` FK NULL, `part` NULL,
`checklist_json` NOT NULL, `passed` INTEGER NOT NULL, `notes`,
`created_at` def now; índice por order_id. Registros INMUTABLES: sin
PATCH; repetir la revisión = fila nueva.

- `workers/api/src/lib/calidad.ts`:
  - `CHECKLISTS: Record<'impresion_3d' | 'manual', ChecklistItem[]>` —
    impresion_3d: capas ("Capas uniformes, sin saltos ni hilos"), warping
    ("Sin warping ni esquinas levantadas"), encaje ("Pantalla, cuerpo y
    tapa encajan sin forzar"), colores ("Colores según el pedido"),
    electrico ("Socket y cable probados, enciende"); manual: acabado
    ("Lijado y acabado uniformes"), estructura ("Estable, sin juego en las
    uniones"), medidas ("Medidas según la ficha").
  - `validateChecklist(production, checklist)` → null si falta un item o
    hay valor no booleano; `passed` = todos true. `passed` SIEMPRE se
    calcula en el worker (se ignora el del cliente). `shapeQc`.
- Rutas `/api/admin/calidad`:
  - `GET /checklists` → `{checklists: CHECKLISTS}` (el panel renderiza las
    definiciones del worker; nunca divergen).
  - `GET /` (`?order_id=`, `?limit=` def 50) → `{registros}` con
    `pedido: {id, product_id, customer_name}` por JOIN.
  - `POST /` body `{order_id, checklist, part?, print_job_id?, notes?}` →
    registro con `passed` calculado; production por JOIN a products
    `?? 'manual'`; 400 `order_id_requerido` / `pedido_no_existe` /
    `checklist_incompleta`.
- DECISIÓN: NO se engancha al gate imprimiendo→lista (contrato congelado;
  "marcar Lista es decisión humana"). Enganche blando: el panel lista los
  pedidos en `imprimiendo|lista` sin registro aprobado.
- Panel `calidad/CalidadPanel.tsx`: "Por revisar" (cruza `getOrders` con
  registros) → tap abre formulario: checkboxes táctiles grandes (label
  completo tocable), chips de parte (Pantalla/Cuerpo/Tapa/Completa→null),
  notas, "Registrar" deshabilitado hasta responder todo; el veredicto
  (Aprobada/Rechazada) lo dicta la respuesta del worker. Historial con
  chip, parte, fecha, notas.
- labels: `passedLabel(bool)` → 'Aprobada' | 'Rechazada';
  `PART_CHOICE_LABEL` (reutiliza `PART_LABEL` de pedidos + completa).
- e2e (2): pendientes calculados del mock; llenar checklist y enviar (flag
  POST + assert de que el body trae todos los items). Mockear
  `**/api/admin/calidad/checklists`.

## Módulo 5 — inbox

Migración `0014_inbox.sql` — tabla `messages`: `id` ('msg_'), `channel`
(email|whatsapp|web|manual), `direction` (in|out), `external_id` UNIQUE
NULL (idempotencia futura, patrón webhook_events), `customer_id` FK NULL,
`order_id` FK NULL, `subject`, `body` NOT NULL, `status` def 'nuevo'
(nuevo|leido|respondido|archivado), `created_at` def now; índices por
status y customer_id.

- `lib/inbox.ts`: `CHANNELS`, `DIRECTIONS`; grafo nuevo→[leido,
  respondido, archivado], leido→[respondido, archivado],
  respondido→[archivado], archivado→[]. `shapeMessage` omite external_id.
- Rutas `/api/admin/inbox`:
  - `GET /` (`?status=`, `?customer_id=`, `?limit=` def 100) → `{mensajes}`;
    def `status != 'archivado'`; `customer_name` por LEFT JOIN.
  - `POST /` body `{channel, body, direction? = 'in', subject?,
    customer_id?, order_id?}` → status inicial `out → 'respondido'`, `in →
    'nuevo'`; 400 `canal_invalido` / `direccion_invalida` /
    `body_requerido` / `cliente_no_existe` / `pedido_no_existe`.
  - `PATCH /:id` body `{status}` → estándar 400/404/409.
- Panel `inbox/InboxPanel.tsx`: chips "Activos | Archivados" (archivados =
  fetch `?status=archivado`); tarjeta con chip de canal, dirección
  (`meta-caps` Recibido/Enviado), cliente, subject en negrita, body clamp 3
  líneas (tap expande), fecha, chip de estado, acciones según grafo. Form
  "Registrar mensaje": canal, toggle Recibido/Enviado, subject opcional,
  body requerido, select opcional de cliente (via `getClientes`).
  `order_id` solo en la API en v1.
- labels: `CHANNEL_LABEL`, `MSG_STATUS_LABEL`, `DIRECTION_LABEL`,
  `MSG_ACTIONS: Record<string, {status, label}[]>` derivado del grafo.
- e2e (2): registrar mensaje (flag POST); archivar (flag PATCH). Mockear
  `**/api/admin/clientes`.

## Verificación por módulo (la corre el orquestador, no el implementador)

1. `cd workers/api && npm run typecheck` y `npm run migrate:local`.
2. `wrangler dev` en background + curls con el ADMIN_TOKEN de `.dev.vars`
   local: GET 200 con la forma esperada, POST feliz, PATCH válido, PATCH
   ilegal → 409, sin bearer → 401. Matar el dev al terminar.
3. Raíz: `npx astro check`, `npm run build`,
   `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test`.
4. Revisión del diff: README del worker actualizado; `coreData.tsx`
   intacto; migraciones previas intactas; sin CHECK en enums; voz de marca.

## Cierre y deploy

PR final: en `docs/ROADMAP_ARQUITECTURA.md` §7 nota "Actualización: 
implementado — migración NNNN" por boceto y en §4 limpiar `# futuros:`
dejando `agente/`; eliminar este documento.

Deploy (Salva o Claude con token nuevo; el sitio ya estará desplegado por
los merges):

```sh
cd workers/api
npm run migrate:remote     # aplica 0011→0014 en orden
npm run deploy
# smoke: curl con ADMIN_TOKEN a /api/admin/{clientes,envios,
# inventario/bobinas,inventario/piezas,calidad,inbox} → seis 200
# y en el teléfono: abrir /taller y recorrer los 6 tabs
```
