# formamx-api

Backend serverless de formamx.com: checkout con Stripe, webhook de pagos y
registro de pedidos. Corre en Cloudflare Workers (capa gratuita) con D1.
El sitio sigue siendo estático en Hostinger; esto se despliega aparte.

## Rutas

| Ruta | Auth | Qué hace |
| --- | --- | --- |
| `POST /api/checkout` | — | Crea la sesión de pago. Body: `{"product":"lampara","config":{"model","pantalla","tapa"}}` o `{"product":"banca-001"}`. Devuelve `{"url"}` de Stripe. |
| `GET /api/products/:id` | — | `{"id","available","price_mxn"}` — /banca lo consulta al cargar. |
| `POST /api/webhook/stripe` | firma Stripe | Registra pedidos. Tarjeta → `pagada`; OXXO → `pendiente` hasta que la tienda reporte el pago. |
| `GET /api/admin/resumen` | `Bearer ADMIN_TOKEN` | Agregados de la vista Resumen: ventas por mes (serie de 6, centavos, `paid_at`), pedidos activos/sin empezar, mensajes sin responder y bobinas bajo umbral. |
| `GET /api/admin/orders` | `Bearer ADMIN_TOKEN` | Pedidos en curso para el dashboard `/taller`. `?status=` filtra, `?limit=`. |
| `GET /api/admin/orders/:id` | `Bearer ADMIN_TOKEN` | Detalle de un pedido + sus trabajos de impresión (incluye terminados/cancelados); 404 si no existe. |
| `PATCH /api/admin/orders/:id` | `Bearer ADMIN_TOKEN` | Avanza el estado siguiendo el grafo permitido (salto ilegal → 409). |
| `GET /api/admin/spools` | `Bearer ADMIN_TOKEN` | Estado de las 4 ranuras del AMS (solo lectura: el AMS de la impresora dicta el estado). |
| `POST /api/agent/ams` | `Bearer AGENT_TOKEN` | El agente sube lo que la impresora reporta en el AMS; el color hex se empareja con el catálogo. |
| `POST /api/admin/orders/:id/dispatch` | `Bearer ADMIN_TOKEN` | Manda un pedido `en_cola` a imprimir: crea 3 trabajos (pantalla, cuerpo y tapa). |
| `POST /api/admin/jobs/:id/requeue` | `Bearer ADMIN_TOKEN` | Reencola un trabajo fallido. |
| `GET/POST /api/admin/printer[/bed-clear]` | `Bearer ADMIN_TOKEN` | Candado de cama: estado y confirmación de que se retiró la pieza. |
| `GET /api/admin/clientes` | `Bearer ADMIN_TOKEN` | CRM: lista de clientes con nº de pedidos, fecha del último, `active_order_count` (pedidos en curso) y `city` (del envío del último pedido, puede ser null). `?limit=`. |
| `GET /api/admin/clientes/:id` | `Bearer ADMIN_TOKEN` | Detalle del cliente + su historial de pedidos (máx. 50). |
| `PATCH /api/admin/clientes/:id` | `Bearer ADMIN_TOKEN` | Guarda las notas del cliente. Body `{"notes":"..."}`; cadena vacía las borra. |
| `GET /api/admin/envios` | `Bearer ADMIN_TOKEN` | Guías de envío con resumen del pedido; por defecto las no entregadas. `?status=`, `?order_id=`, `?limit=`. |
| `POST /api/admin/envios` | `Bearer ADMIN_TOKEN` | Registra una guía (nace `creada`). Body `{"order_id","carrier?","service?","tracking_number?","label_url?","cost_mxn?"}`. |
| `PATCH /api/admin/envios/:id` | `Bearer ADMIN_TOKEN` | Avanza el estado de la guía (`creada → en_transito → entregada`, con `incidencia`); salto ilegal → 409. Sin edición de tracking: guía equivocada = crear otra. |
| `GET/POST /api/admin/inventario/bobinas` | `Bearer ADMIN_TOKEN` | Almacén de filamento; por defecto las no agotadas (`?status=`). POST da de alta (nace `nueva` con `weight_left_g = weight_g`, 1000 g por defecto). |
| `PATCH /api/admin/inventario/bobinas/:id` | `Bearer ADMIN_TOKEN` | Edita el peso restante (`{"weight_left_g"}`) y/o avanza `nueva → en_uso → agotada`; llegar a 0 g no agota solo. Salto ilegal → 409. |
| `GET/POST /api/admin/inventario/piezas` | `Bearer ADMIN_TOKEN` | Piezas terminadas; por defecto las vivas (ni vendidas ni merma, `?status=`). POST da de alta (`{"product_id","config?","location?","order_id?"}`). |
| `PATCH /api/admin/inventario/piezas/:id` | `Bearer ADMIN_TOKEN` | Avanza `en_stock ⇄ reservada → vendida\|merma`, edita `location` y el veredicto manual `qc_status` (`ok\|rechazada`); salto ilegal → 409. |
| `GET /api/admin/inbox` | `Bearer ADMIN_TOKEN` | Mensajes con clientes (con `customer_name` por JOIN), más recientes primero; por defecto los no archivados. `?status=`, `?customer_id=`, `?limit=`. |
| `POST /api/admin/inbox` | `Bearer ADMIN_TOKEN` | Registra un mensaje. Body `{"channel","body","direction?","subject?","customer_id?","order_id?"}`; uno enviado (`out`) nace `respondido`, uno recibido (`in`, default) nace `nuevo`. Convención de la UI de Clientes: para un contacto sin ficha (`customer_id` null), `subject` = nombre del contacto (agrupa el hilo). |
| `PATCH /api/admin/inbox/:id` | `Bearer ADMIN_TOKEN` | Avanza el estado del mensaje (`nuevo → leido → respondido → archivado`, saltos del grafo permitidos); salto ilegal → 409. |
| `GET /api/agent/jobs/next` | `Bearer AGENT_TOKEN` | Claim atómico del siguiente trabajo + bobinas actuales; 204 si no hay nada o la cama sigue ocupada. |
| `POST /api/agent/jobs/:id/status` | `Bearer AGENT_TOKEN` | El agente reporta `printing` (con progreso), `done` o `failed`; con `bed_dirty` activa el candado de cama. |

Estados de pedido: `pendiente → pagada → en_cola → imprimiendo → lista → enviada` (+ `cancelada`).

El dashboard `/taller` del sitio guarda el `ADMIN_TOKEN` en `localStorage` y lo
manda como bearer. Genera uno con `openssl rand -hex 24` y ponlo con
`npx wrangler secret put ADMIN_TOKEN`; pégalo una vez en `/taller`.

El agente de impresión (fase 3b, la PC junto a la Bambu) usa su propio
`AGENT_TOKEN` (mismo mecanismo, secreto distinto): el flujo es
dispatch desde /taller → el agente reclama el trabajo → sube el 3MF a la
impresora → reporta progreso. El pedido pasa a `imprimiendo` cuando arranca
la primera pieza; marcarlo `lista` sigue siendo decisión humana tras revisar
las piezas.

## Puesta en marcha (una sola vez)

Requiere una cuenta de Cloudflare (gratis) y una de Stripe activada para México.

```sh
cd workers/api
npm install
npx wrangler login

# 1. Base de datos
npx wrangler d1 create formamx        # pega el database_id que devuelve en wrangler.toml
npm run migrate:remote

# 2. Secretos (Stripe → Developers → API keys; tokens con `openssl rand -hex 24`)
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put ADMIN_TOKEN   # el que pegas una vez en /taller
npx wrangler secret put AGENT_TOKEN   # el del agente de la impresora

# 3. Primer deploy (anota la URL *.workers.dev que imprime)
npm run deploy

# 4. Webhook: Stripe → Developers → Webhooks → Add endpoint
#    URL: https://formamx-api.<tu-subdominio>.workers.dev/api/webhook/stripe
#    Eventos: checkout.session.completed, checkout.session.async_payment_succeeded,
#             checkout.session.async_payment_failed, checkout.session.expired
#    Copia el signing secret:
npx wrangler secret put STRIPE_WEBHOOK_SECRET

# 5. Vuelve a desplegar para tomar los secretos
npm run deploy
```

Después:

- En Stripe: habilita **OXXO** (Settings → Payment methods) y los **recibos por
  email** de pagos exitosos (Settings → Emails).
- Pega la URL real del Worker en `src/config/api.ts` del sitio.

Avisos: el secreto `NTFY_TOPIC` es legado y está **roto** (ntfy.sh bloquea a
Workers); los avisos de pago llegan por la app de Stripe. El reemplazo
(outbox en D1 + bot de Telegram) está planeado en `docs/AGENTE_IA.md`.

## Desarrollo local

```sh
npm run migrate:local
npm run dev            # http://localhost:8787 con D1 local

# Secretos de prueba para dev: crea workers/api/.dev.vars (ignorado por git):
#   STRIPE_SECRET_KEY=sk_test_...
#   STRIPE_WEBHOOK_SECRET=whsec_...
#   ADMIN_TOKEN=... AGENT_TOKEN=...
#   NTFY_TOPIC=formamx-dev-loquesea   # legado, ntfy está roto

# Webhooks locales con la CLI de Stripe:
stripe listen --forward-to localhost:8787/api/webhook/stripe
```

Consultar pedidos: `npx wrangler d1 execute formamx --remote --command "SELECT id, status, product_id, amount_mxn FROM orders ORDER BY created_at DESC LIMIT 20"`
