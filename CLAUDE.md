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
  lee `docs/ROADMAP_ARQUITECTURA.md` (convenciones y receta de activación).
- **Agente de IA (Raspberry Pi, Telegram, LLM, métricas, prioridad de cola,
  avisos)** → lee `docs/AGENTE_IA.md` (plan por fases aprobado, aún sin
  implementar) ANTES de implementar cualquier fase.
- **Negocio (Stripe live, SAS/RFC, páginas legales, precio y envío, CFDI,
  post-venta, respaldos, monitoreo, CI, analytics)** → lee `docs/NEGOCIO.md`
  (plan por fases, ordenado por importancia, aún sin implementar). Los textos
  legales de ahí son borradores: abogado/contador antes de confiar en ellos.
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

## Secretos y cuentas (nada de secretos ni STL/3MF en git)

El repo es **privado** desde julio 2026 (fue público). Eso NO relaja las
reglas: los secretos jamás se commitean (viven en `wrangler secret`, en
`.dev.vars` o en configs locales de las máquinas de Salva) y los STL/3MF
siguen fuera del repo (binarios pesados; viven en `C:\formamx\3mf\`).

- Worker (`wrangler secret put`): `STRIPE_SECRET_KEY` (test),
  `STRIPE_WEBHOOK_SECRET`, `ADMIN_TOKEN`, `AGENT_TOKEN`, `NTFY_TOPIC`
  (legado, roto: ntfy.sh bloquea a Workers; los avisos de pago llegan por la
  app de Stripe; el reemplazo es la fase 1-2 de `docs/AGENTE_IA.md`).
- Cloudflare: cuenta de Salva (account id `15ac7395af783656f4131e2850e1a27b`,
  subdominio workers.dev `formamx`). El `CLOUDFLARE_API_TOKEN` (rotado en
  julio 2026) vive como variable de entorno del entorno de Claude Code —
  las sesiones nuevas lo traen puesto y wrangler lo toma solo; NUNCA pedirlo
  por chat ni escribirlo en archivos. En sandbox, wrangler necesita
  `NODE_USE_ENV_PROXY=1`.
- Al tocar features de Cloudflare que este repo aún no usa, o ante errores
  raros de plataforma/wrangler: consulta la guía oficial para agentes
  (https://developers.cloudflare.com/agent-setup/prompt.md y el repo
  cloudflare/skills) ANTES de improvisar. Para lo ya establecido (deploy,
  migraciones D1, secretos) mandan las convenciones de este repo.

## Pendientes conocidos

- Stripe en modo prueba → pasar a live (llaves live + webhook live + 2
  secretos). Secuencia SAS/RFC/banco → live en `docs/NEGOCIO.md` §1.
- Rotar el token de Cloudflare que circuló por chat; revocar llaves R2 sin
  uso. Pasos en `docs/NEGOCIO.md` §5 (hacerlo la semana 1).
- Avisos custom muertos desde Workers (ntfy); el reemplazo (outbox en D1 +
  bot de Telegram en la Pi) ya está planeado en `docs/AGENTE_IA.md`, fases 1-2.
- Falta lo legal y operativo para vender de verdad (aviso de privacidad,
  términos, CFDI, envíos, respaldos, CI, analytics): plan completo ordenado
  por importancia en `docs/NEGOCIO.md`.

## Flujo de trabajo con Salva

Fases pequeñas y desplegables; verificar SIEMPRE (pytest + Playwright +
wrangler dev local con webhooks firmados) antes de mergear; squash-merge a
`master`. Salva opera desde su teléfono (/taller) y su PC Windows (agente);
dale pasos manuales con comandos exactos de PowerShell.

Claude hace el trabajo operativo de GitHub: crea la rama, implementa, abre el
PR en borrador y corrige los hallazgos de CI y de Codex. Puede hacer
squash-merge cuando todos los checks requeridos estén verdes, Codex haya
terminado la revisión sin hallazgos P0/P1 pendientes y todas las conversaciones
estén resueltas. Si falta cualquiera de esas condiciones, no debe fusionar ni
desplegar. El merge a `master` dispara el deploy a Hostinger.

Después del último push, solicita siempre la revisión con `@codex review` y el
marcador `<!-- codex-review-head:SHA_COMPLETO_DE_HEAD -->`. Si haces otra
corrección, repite la solicitud con el nuevo SHA; el check requerido rechaza
revisiones de commits anteriores.

Si Codex responde después de que el gate agote sus 15 minutos, reejecuta CI
sobre la rama del PR con `gh workflow run ci.yml --ref NOMBRE_DE_RAMA -f
pr_number=NUMERO_DEL_PR`. Esta ejecución vuelve a asociar el check al mismo
`HEAD`; no hagas un commit vacío para reintentarlo.

Ramas: `master` es la única de larga vida (= producción). Cada cambio va en
una rama corta desde `master`, se squash-mergea y muere; nunca se apilan
commits sobre una rama ya mergeada (se reinicia desde `master`). Sin
worktrees ni ramas de entorno.

## Organización del repo

Toda la documentación por área vive en `docs/`. En la raíz solo quedan
`README.md` (presentación) y `CLAUDE.md` (este archivo). `ds-bundle/` no se
reorganiza: su layout lo dicta el sync con Claude Design (`.design-sync/`).
