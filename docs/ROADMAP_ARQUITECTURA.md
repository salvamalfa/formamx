# Roadmap de arquitectura — /taller como ERP/MES del taller

## 1. Por qué este documento

`/taller` va a crecer de "cola de pedidos + impresora" a un panel de administración
completo del taller: CRM, envíos, inventario, inbox, control de calidad y un agente
autónomo que decide qué imprimir. Este documento fija las **costuras** — carpetas,
convenciones, contratos y bocetos de datos — para que cada módulo se enchufe
después **sin refactorizar el núcleo**. Los módulos futuros aquí descritos son
bocetos, no compromisos: se detallan al activarlos.

## 2. Principios

- **Una isla Preact, cero routers.** El sitio es estático; `/taller` es una sola
  isla `client:only`. Los módulos son paneles conmutados por `location.hash`
  (`#pedidos`, `#clientes`) — deep-link gratis, sin dependencias nuevas.
- **Contratos congelados.** Las rutas existentes (`/api/admin/orders`, `/spools`,
  `/printer`, `/jobs`) y el protocolo del agente Python no cambian. Lo nuevo se
  agrega al lado, nunca encima.
- **Snapshot + referencia.** Lo denormalizado en `orders` (customer_*,
  shipping_json) se queda como foto histórica del pedido; la normalización
  (p. ej. `customers`) se agrega como FK opcional al lado.
- **Español en el dominio.** Estados, errores, módulos y APIs nuevas en español
  (las tablas siguen la convención inglesa ya establecida por `orders`/`products`).
- **La capa gratuita de Cloudflare es una restricción de diseño** (ver §5).

## 3. Mapa actual

```
┌────────────────┐   checkout/webhook    ┌──────────────────────┐
│ Sitio estático │ ────────────────────► │ Worker (Hono) + D1   │
│ Astro/Hostinger│   /api/admin/* ADMIN  │ Cloudflare (gratis)  │
│  · tienda      │ ◄──────────────────── │  · pagos (Stripe)    │
│  · /taller     │                       │  · pedidos/trabajos  │
└────────────────┘                       └─────────▲────────────┘
                                                   │ /api/agent/* AGENT
                                         ┌─────────┴────────────┐
                                         │ Agente Python (PC)   │
                                         │  · FTPS/MQTT → A1    │
                                         │  · sincroniza AMS    │
                                         └──────────────────────┘
```

Tablas: `products` (con `production`), `orders` (con `customer_id`), `customers`,
`webhook_events`, `print_jobs`, `spool_slots`, `printer_flags`.

## 4. Arquitectura del dashboard

```
src/components/taller/
  TallerShell.tsx      gate de token, header, tabs por hash, módulo activo
  registry.ts          MODULES: [{id, label, Panel}] — módulo nuevo = 1 entrada
  coreData.tsx         TallerCoreData: pedidos + impresora (compartido)
  ui/                  primitivas de marca (format.ts, colores.ts, …)
  hooks/               useSession (token/401→gate); usePolling cuando haga falta
  pedidos/             PedidosPanel, OrderCard, JobsStrip, LampPreview,
                       FilamentNeeds, labels.ts
  impresora/           ImpresoraPanel (AMS solo lectura), BedAlert (candado)
  clientes/  envios/  inventario/  inbox/   (activados 2026-07)
  # futuros: agente/
```

**Contrato shell → panel:** cada `Panel` recibe `{ manifest }` y es dueño de sus
propios datos (fetch + polling propios). **Excepción deliberada:** pedidos e
impresora comparten `TallerCoreData` (una tarjeta necesita las bobinas; el
candado de cama es global). Los módulos futuros **no** entran a ese contexto —
así el core nunca se vuelve un almacén-dios.

**Cliente API** (`src/lib/taller/`): `http.ts` es el único transporte (bearer +
manejo uniforme de 401); un archivo por módulo (`pedidos.ts`, `impresora.ts`)
con sus tipos al lado; `index.ts` re-exporta.

**Estilo:** tokens del brand kit vía `src/styles/brand.css` (`ds-bundle/`).
Ningún módulo escribe colores/radios a mano: clases de marca y primitivas de `ui/`.

## 5. Convenciones del Worker

- **Una sub-app Hono por módulo** en `routes/admin/<modulo>.ts`. El bearer se
  aplica UNA vez en `routes/admin/index.ts` — ningún módulo puede olvidar el
  auth. Las rutas históricas están montadas en `/` (URLs congeladas); los
  módulos nuevos se montan con prefijo: `admin.route('/clientes', clientes)`.
- **Rutas delgadas, lógica en `lib/<modulo>.ts`** (funciones puras o que reciben
  `D1Database`). `lib/*` jamás importa de `routes/*`. Precedentes: el grafo de
  estados en `lib/orders.ts`, `createJobsForOrder` en `lib/jobs.ts`.
- **Tokens:** `ADMIN_TOKEN` (dashboard) y `AGENT_TOKEN` (PC de la impresora),
  separados y comparados en tiempo constante (`lib/auth.ts`). Lo que use el
  dashboard vive bajo `/api/admin/*`; lo del agente bajo `/api/agent/*`; nunca
  se comparte sub-app. Si algún día hay más usuarios/roles: (a) ampliar la
  unión de `bearer()` cuesta una línea; (b) multiusuario real = tabla
  `api_tokens(hash, scope_json)` y `bearer()` consulta D1.
- **Migraciones:** numeración secuencial de 4 dígitos, cabecera
  `-- Migration number: NNNN <tab> descripción`, un tema por migración, jamás
  editar una aplicada, `migrate:local` antes que `migrate:remote`.
  **Lección de la 0004:** SQLite no altera CHECKs — los enums que van a crecer
  (estados de envío, canales de inbox) NO llevan CHECK; se validan en `lib/`.
- **Presupuesto D1 (capa gratuita: 5 GB, ~100k escrituras/día):** el riesgo son
  las **escrituras por polling**, no el tamaño. Reglas: progreso de impresión
  reportado por hitos (≥5%), nada de audit-log por request, bitácoras acotadas
  a decisiones, purga manual (endpoint admin) de `webhook_events`/mensajes
  archivados cuando haga falta. Las lecturas del dashboard cada 30 s son
  irrelevantes para el límite.

## 6. Cimientos de datos ya puestos (migración 0008)

- **`customers`** (email UNIQUE NOCASE) + `orders.customer_id` + backfill por
  email. El webhook upsertea al cliente en cada pedido: el CRM nace con
  historial completo. Los `customer_*` de `orders` se quedan (snapshot).
- **`products.production`** (`impresion_3d` | `manual`, sin CHECK): separa lo
  que pasa por la impresora de lo manual; llave del despacho automático y de
  la calidad por tipo de pieza.
- **Qué NO se tocó a propósito:** `spool_slots` (cuando exista inventario de
  bobinas, `ADD COLUMN bobina_id` es trivial y no rompe al agente);
  `shipments` no necesita preparación (referencia `orders(id)`).

## 7. Módulos futuros (bocetos, no compromisos)

**Actualización (2026-07): clientes, envíos, inventario, calidad e inbox ya
están IMPLEMENTADOS** siguiendo estos bocetos y la receta §8 (migraciones
0011-0014; rutas en la tabla de `workers/api/README.md`). Los bocetos se
conservan abajo como registro del diseño; el único módulo pendiente es el
agente autónomo (plan en `docs/AGENTE_IA.md`).

### CRM — clientes — implementado (sin migración; tabla de 0008)
Tabla ya creada. Historial = `SELECT * FROM orders WHERE customer_id = ?`.
Panel: lista + detalle con pedidos y notas. Opcional después: `tags_json`.

### Envíos — implementado (migración 0011)
```
shipments(id 'shp_' PK, order_id FK NOT NULL, carrier, service,
          tracking_number, label_url, cost_mxn, raw_json,
          status: creada|en_transito|entregada|incidencia (sin CHECK),
          created_at, shipped_at, delivered_at)
```
1 pedido → N guías (reenvíos). `orders.enviada` no cambia; el detalle vive aquí.

### Inventario de bodega — implementado (migración 0012)
```
bobinas(id 'bob_' PK, color_id, material, brand, weight_g, weight_left_g,
        cost_mxn, status: nueva|en_uso|agotada, created_at, updated_at)
piezas(id 'pza_' PK, product_id FK, config_json, print_job_id NULL FK,
       order_id NULL FK, qc_status NULL,
       status: en_stock|reservada|vendida|merma, location, created_at)
```
`spool_slots` sigue siendo "qué está montado en el AMS" (estado físico);
`bobinas` es el almacén. Se unen con `spool_slots.bobina_id` (diferido).

### Inbox — implementado (migración 0014)
```
messages(id 'msg_' PK, channel: email|whatsapp|web|manual, direction: in|out,
         external_id UNIQUE NULL,  -- idempotencia, patrón webhook_events
         customer_id NULL FK, order_id NULL FK,
         subject, body, status: nuevo|leido|respondido|archivado, created_at)
```
Sin tabla de hilos: `customer_id` + orden cronológico ES el hilo.

### Control de calidad — dado de baja en 2026-07 (migración 0013 → DROP en 0015)
Boceto conservado como registro del diseño; el módulo se dio de baja por
decisión del dueño (Fase 1 del rediseño de /taller, 2026-07) — sin lector
ni escritor en el worker, tabla `qc_registros` eliminada en la migración
0015.
```
qc_registros(id 'qc_' PK, order_id FK NOT NULL, print_job_id NULL FK,
             part NULL, checklist_json NOT NULL, passed NOT NULL,
             notes, created_at)
```
Las **definiciones** de checklist viven en código (`lib/calidad.ts`, por
`products.production`) — fuente de verdad en código, resultados en D1, igual
que el catálogo vive en `lamps.ts`. Nota de la implementación: NO se enganchó
al gate `imprimiendo → lista` (marcar Lista sigue siendo decisión humana en
Pedidos); el panel solo sugiere qué falta por revisar. Registros inmutables.

### Agente autónomo
```
agent_policies(id=1 CHECK(id=1), auto_dispatch INTEGER DEFAULT 0,
               max_cola, hora_inicio, hora_fin, updated_at)   -- patrón printer_flags
agent_decisions(id PK, created_at, action, order_id NULL, job_id NULL, reason)
```
No rehace nada: reutiliza `print_jobs`/`spool_slots`/`printer_flags` +
`createJobsForOrder` (`lib/jobs.ts`).

**Actualización (2026-07):** el diseño detallado y aprobado vive en
`docs/AGENTE_IA.md` — supersede este boceto. La decisión "qué imprimir" NO
corre en un cron del Worker: la propone la futura Mac mini (servidor de IA
local con Telegram y modelos abiertos) que escribe `print_jobs.priority` vía `/api/ai/*`;
el Worker sigue siendo la fuente de verdad y el claim solo cambia su
`ORDER BY`. `agent_decisions` se mantiene tal cual; `agent_policies` queda
para la fase de auto-dispatch.

## 8. Receta para activar un módulo `<m>` (ej. `envios`)

1. **Migración** `workers/api/migrations/NNNN_<m>.sql` (siguiente número;
   cabecera estándar; enums sin CHECK; índices por status).
2. **Lógica** `workers/api/src/lib/<m>.ts` — tipos de fila, shape*, validaciones
   y grafo de estados. Sin imports de `routes/`.
3. **Rutas** `workers/api/src/routes/admin/<m>.ts` — sub-app Hono; montar en
   `admin/index.ts` con `.route('/<m>', <m>)`. Si el agente participa,
   endpoints aparte en `routes/agent.ts`. Documentar en `workers/api/README.md`.
4. **Cliente** `src/lib/taller/<m>.ts` — funciones sobre `call()` + tipos;
   re-exportar en `index.ts`.
5. **UI** `src/components/taller/<m>/<M>Panel.tsx` con primitivas de `ui/`;
   registrar en `registry.ts` (el tab y el hash `#<m>` aparecen solos).
6. **Pruebas** — specs en `tests/e2e/taller.spec.ts` con la API mockeada
   (`page.route`, patrón existente); rutas verificadas contra `wrangler dev`
   + `migrate:local`.
7. **Desplegar en orden:** migración remota → deploy del worker → merge del
   sitio. El frontend nuevo nunca debe requerir un worker que aún no existe;
   el worker nuevo debe tolerar el frontend viejo (patrón: normalización en
   `src/lib/taller/pedidos.ts#getOrders`).

## 9. Decisiones diferidas (cuándo reevaluar)

| Decisión | Reevaluar cuando… |
|---|---|
| Router real / páginas por módulo | haya más de ~8 módulos o URLs anidadas |
| Tabla `api_tokens` con scopes | exista un segundo usuario humano |
| `inventory_moves` (auditoría) | los cambios de status de piezas no basten |
| Purga automática de tablas | `webhook_events`/`messages` crezcan de verdad |
| Estado global compartido (store) | dos módulos NO-core necesiten los mismos datos |
