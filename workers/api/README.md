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
| `GET /api/admin/orders` | `Bearer ADMIN_TOKEN` | Pedidos en curso para el dashboard `/taller`. `?status=` filtra, `?limit=`. |
| `PATCH /api/admin/orders/:id` | `Bearer ADMIN_TOKEN` | Avanza el estado siguiendo el grafo permitido (salto ilegal → 409). |
| `GET /api/admin/spools` | `Bearer ADMIN_TOKEN` | Estado de las 4 ranuras del AMS (solo lectura: el AMS de la impresora dicta el estado). |
| `POST /api/agent/ams` | `Bearer AGENT_TOKEN` | El agente sube lo que la impresora reporta en el AMS; el color hex se empareja con el catálogo. |
| `POST /api/admin/orders/:id/dispatch` | `Bearer ADMIN_TOKEN` | Manda un pedido `en_cola` a imprimir: crea 3 trabajos (pantalla, cuerpo y tapa). |
| `POST /api/admin/jobs/:id/requeue` | `Bearer ADMIN_TOKEN` | Reencola un trabajo fallido. |
| `GET/POST /api/admin/printer[/bed-clear]` | `Bearer ADMIN_TOKEN` | Candado de cama: estado y confirmación de que se retiró la pieza. |
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

# 2. Secretos (Stripe → Developers → API keys)
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put NTFY_TOPIC    # string aleatorio largo; el nombre del topic ES el secreto

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
- Instala la app **ntfy** en el teléfono y suscríbete al topic del paso 2:
  ahí llegan los avisos de pedido nuevo.
- Pega la URL real del Worker en `src/config/api.ts` del sitio.

## Desarrollo local

```sh
npm run migrate:local
npm run dev            # http://localhost:8787 con D1 local

# Secretos de prueba para dev: crea workers/api/.dev.vars (ignorado por git):
#   STRIPE_SECRET_KEY=sk_test_...
#   STRIPE_WEBHOOK_SECRET=whsec_...
#   NTFY_TOPIC=formamx-dev-loquesea

# Webhooks locales con la CLI de Stripe:
stripe listen --forward-to localhost:8787/api/webhook/stripe
```

Consultar pedidos: `npx wrangler d1 execute formamx --remote --command "SELECT id, status, product_id, amount_mxn FROM orders ORDER BY created_at DESC LIMIT 20"`
