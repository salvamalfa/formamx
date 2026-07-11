# formamx — contexto para Claude Code

Taller de proyectos de una persona (Salva): bancas de madera, lámparas
impresas en 3D, videos, música. El sitio es una **bitácora** que documenta el
proceso y vende piezas únicas — la venta es consecuencia de la historia,
nunca al revés. La impresión 3D es UN proyecto dentro de forma, no el todo.

## Documentos por área — léelos según el tema

- **Configurador de lámparas, dashboard /taller (sección Impresión 3D),
  agente local, Bambu A1, AMS, trabajos de impresión** →
  lee `docs/IMPRESION_3D.md` ANTES de tocar cualquiera de esas piezas.
- **Agregar módulos al dashboard** (CRM, envíos, inventario, inbox, calidad,
  agente autónomo) o tocar la estructura de /taller →
  lee `ROADMAP_ARQUITECTURA.md` (convenciones y receta de activación).
- **Marca, voz, estilos** → `ds-bundle/readme.md`. Regla corta: español de
  tú, primera persona, sin marketing, SIN emoji, sentence case, tokens de
  `src/styles/brand.css`.

## Arquitectura general

1. **Sitio estático** — Astro 6 + Preact islands + Tailwind 4, en `src/`.
   Hospedado en Hostinger; **merge a `master` = deploy automático** (no
   tocar ese mecanismo). Páginas: `/` (bitácora), `/banca`, `/lampara`,
   `/gracias`, `/taller` (dashboard privado del taller).
2. **Backend** — Cloudflare Worker (Hono) + D1 en `workers/api/`
   (`https://formamx-api.formamx.workers.dev`). Pagos con Stripe Checkout
   (AÚN EN MODO PRUEBA) + webhook idempotente; pedidos y clientes.
   Se despliega aparte con wrangler. Detalle: `workers/api/README.md`.
3. **Agente local** — Python en `agent/`, corre en la PC de Salva junto a la
   impresora. Detalle: `agent/README.md` y `docs/IMPRESION_3D.md`.

Pedidos: `pendiente → pagada → en_cola → imprimiendo → lista → enviada`
(+`cancelada`); OXXO entra `pendiente` (pago diferido). Grafo en
`workers/api/src/lib/orders.ts`. Los pedidos `production='manual'` (madera)
muestran "En progreso" y nunca pasan por la impresora.

## Comandos

```sh
npm run dev / build                 # sitio (raíz)
npx astro check                     # typecheck sitio
cd workers/api && npm run typecheck # typecheck worker
cd workers/api && npm run dev       # worker local (D1 local + .dev.vars)
cd workers/api && npm run migrate:local|migrate:remote
cd agent && python3 -m pytest tests/
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test   # e2e
```

Migraciones D1: numeración 4 dígitos, un tema por archivo, NUNCA editar una
aplicada, enums sin CHECK. Orden de deploy: migración remota → worker →
merge del sitio.

## Secretos y cuentas (el repo es PÚBLICO — nada de secretos ni STL/3MF)

- Worker (`wrangler secret put`): `STRIPE_SECRET_KEY` (test),
  `STRIPE_WEBHOOK_SECRET`, `ADMIN_TOKEN`, `AGENT_TOKEN`, `NTFY_TOPIC`
  (roto: ntfy.sh bloquea a Workers; los avisos de pago llegan por la app de
  Stripe).
- Cloudflare: cuenta de Salva (account id `15ac7395af783656f4131e2850e1a27b`,
  subdominio workers.dev `formamx`). Para desplegar pide a Salva el
  `CLOUDFLARE_API_TOKEN`; en sandbox, wrangler necesita `NODE_USE_ENV_PROXY=1`.

## Pendientes conocidos

- Stripe en modo prueba → pasar a live (llaves live + webhook live + 2 secretos).
- Rotar el token de Cloudflare que circuló por chat; revocar llaves R2 sin uso.
- Avisos custom muertos desde Workers (ntfy); alternativa futura: Telegram.

## Flujo de trabajo con Salva

Fases pequeñas y desplegables; verificar SIEMPRE (pytest + Playwright +
wrangler dev local con webhooks firmados) antes de mergear; squash-merge a
`master`. Salva opera desde su teléfono (/taller) y su PC Windows (agente);
dale pasos manuales con comandos exactos de PowerShell.
