# formamx — contexto para Claude Code

Taller de proyectos de una persona (Salva): bancas de madera, lámparas
impresas en 3D, videos, música. El sitio es una **bitácora** que documenta el
proceso y vende piezas únicas — la venta es consecuencia de la historia,
nunca al revés. La impresión 3D es UN proyecto dentro de forma, no el todo.

## Documentos por área — léelos según el tema

- **Configurador de lámparas, dashboard /taller (sección Impresión 3D),
  agente local, Bambu A1, AMS, trabajos de impresión** →
  lee `docs/IMPRESION_3D.md` ANTES de tocar cualquiera de esas piezas.
- **STL de clientes (importar en /taller, rebanado automático con el CLI de
  Bambu Studio, R2)** → lee `docs/STL_CLIENTES.md` (implementado y validado de
  punta a punta en producción, incluida una impresión real).
- **Agregar módulos al dashboard** (Resumen, Proyectos con sub-tabs
  —Pedidos/Impresora/Inventario/Envíos—, Clientes con chat que fusionó el
  inbox, agente autónomo) o tocar la estructura de /taller →
  lee `docs/ROADMAP_ARQUITECTURA.md` (convenciones y receta de activación).
- **Servidor de IA (Mac mini, revisión local de PR, Telegram, modelos abiertos,
  métricas, prioridad de cola y avisos)** → lee `docs/AGENTE_IA.md` (plan por
  fases aprobado, aún sin implementar) ANTES de implementar cualquier fase.
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
cd workers/api && npm test          # tests del worker (node --test, sin deps)
cd workers/api && npm run dev       # worker local (D1 local + .dev.vars)
cd workers/api && npm run migrate:local|migrate:remote
cd agent && python3 -m pytest tests/
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test   # e2e
```

Migraciones D1: numeración 4 dígitos, un tema por archivo, NUNCA editar una
aplicada, enums sin CHECK. Orden de deploy: migración remota → worker →
merge del sitio.

### Quién despliega (aplica a Claude, local y nube)

El sitio se despliega solo al mergear a `master`. El Worker **no**: es un
paso aparte y es trabajo de Claude, no de Salva. Tras mergear algo de
`workers/api`, desplegarlo con `npm run deploy`. Dos condiciones:

1. **Decir siempre qué se desplegó.** Nunca en silencio.
2. **Preguntar antes si el cambio toca cobros de verdad** — lógica de
   Stripe, precios, webhook de pagos. Subir la versión de la librería de
   Stripe no cuenta; cambiar cómo se cobra, sí.

Auth de wrangler: `CLOUDFLARE_API_TOKEN` por variable de entorno. En las
sesiones de nube ya está puesta con "Edit environment" de la app. En local
es una variable de usuario de Windows; como los procesos ya arrancados no
ven una variable recién creada, se lee del registro dentro del mismo
comando, sin imprimirla:

```powershell
$env:CLOUDFLARE_API_TOKEN = [Environment]::GetEnvironmentVariable('CLOUDFLARE_API_TOKEN','User'); npm run deploy
```

El token JAMÁS va en `.claude/settings.json` — ese archivo sí se commitea
(ver `.gitignore`). Tampoco en ningún otro archivo.

## Secretos y cuentas (nada de secretos ni STL/3MF en git)

El repo es **privado** desde julio 2026 (fue público). Eso NO relaja las
reglas: los secretos jamás se commitean (viven en `wrangler secret`, en
`.dev.vars` o en configs locales de las máquinas de Salva) y los STL/3MF
siguen fuera del repo (binarios pesados; viven en
`C:\Users\salva\Desktop\FORMA\06-Web\formamx\3mf\`).

- Worker (`wrangler secret put`): `STRIPE_SECRET_KEY` (test),
  `STRIPE_WEBHOOK_SECRET`, `ADMIN_TOKEN`, `AGENT_TOKEN`, `NTFY_TOPIC`
  (legado, roto: ntfy.sh bloquea a Workers; los avisos de pago llegan por la
  app de Stripe; el reemplazo está en las fases B1-B2 de
  `docs/AGENTE_IA.md`).
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
- Avisos custom muertos desde Workers (ntfy); el reemplazo (outbox en D1 +
  bot de Telegram en la futura Mac mini) está planeado en
  `docs/AGENTE_IA.md`, fases B1-B2.
- Falta lo legal y operativo para vender de verdad (aviso de privacidad,
  términos, CFDI, envíos, respaldos, CI, analytics): plan completo ordenado
  por importancia en `docs/NEGOCIO.md`.

## Cómo escribirle a Salva

Salva ya conoce las reglas de esta casa: no se las recites. Nada de explicarle
el flujo de ramas, la pausa de la demo antes del PR, el orden de deploy ni que
"lo manda CLAUDE.md". Haz el trabajo y ya.

Respuestas cortas por defecto: qué cambió, qué falta, qué necesitas de él. Sin
bitácora paso a paso de lo que acabas de hacer, sin repetir lo que ya está en
el PR, sin narrar comandos ni verificaciones que salieron bien. Lo que sí va
siempre: los hallazgos que cambian una decisión, lo que se rompió y las
preguntas reales.

Salva suele dejarte correr sin leer el output. Escribe para eso: si algo
importa, que esté en las primeras líneas.

## Flujo de trabajo con Salva

Fases pequeñas y desplegables; cada PR lleva auto-merge con método squash hacia
`master` y GitHub espera los checks requeridos. Salva opera desde su teléfono
(/taller) y su PC Windows (agente actual; futura estación de trabajo); dale
pasos manuales con comandos exactos de PowerShell o del shell de la Mac, según
la máquina.

Al iniciar cada sesión, antes del trabajo nuevo, revisa si Codex dejó
conversaciones o comentarios pendientes en PR anteriores, incluidos los ya
mergeados. Si la sesión genera más de un PR, repite la revisión antes de crear
el siguiente. Atiende primero los hallazgos aplicables en una rama nueva y
resuelve la conversación después de corregir. Si un hallazgo no aplica, deja
una explicación breve y resuélvelo. Haz esta comprobación por iniciativa
propia: Salva no tiene que recordártela ni estar pendiente de GitHub.

Para cualquier cambio de producto perceptible por Salva o por un visitante
(diseño o UX, páginas, módulos, funciones, integraciones o comportamiento),
crea una rama corta e implementa, pero no abras todavía el PR. Ejecuta una
vista o flujo local y muéstrale una demostración clara con capturas; itera en
esa misma rama hasta que confirme el resultado. Si depende de un servicio
externo, prueba en modo local o de prueba todo lo posible y explica qué
activación externa quedaría para después. Esa confirmación es sobre el producto
y autoriza abrir el PR, activar auto-merge con método squash y continuar con
los checks sin pedirle otra aprobación de GitHub. No añadas esta pausa a
mantenimiento interno sin cambios perceptibles, como dependencias, CI, tests,
documentación o refactors puramente técnicos.

Claude hace el trabajo operativo de GitHub: crea la rama, implementa, abre el
PR cuando corresponda, activa auto-merge con método squash y corrige los
hallazgos de CI y de Codex. GitHub hace el merge cuando los checks requeridos
están verdes y todas las conversaciones están resueltas. El merge a `master`
dispara el deploy a Hostinger.

Ramas: `master` es la única de larga vida (= producción). Cada cambio va en
una rama corta desde `master`, se squash-mergea y muere; nunca se apilan
commits sobre una rama ya mergeada (se reinicia desde `master`). Sin
worktrees ni ramas de entorno.

## Organización del repo

Toda la documentación por área vive en `docs/`. En la raíz solo quedan
`README.md` (presentación) y `CLAUDE.md` (este archivo). `ds-bundle/` no se
reorganiza: su layout lo dicta el sync con Claude Design (`.design-sync/`).
