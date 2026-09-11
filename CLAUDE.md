# formamx — contexto para Claude Code

Taller de proyectos de una persona (Salva): bancas de madera, lámparas
impresas en 3D, videos, música. El sitio es una **bitácora** que documenta el
proceso y vende piezas únicas — la venta es consecuencia de la historia,
nunca al revés. La impresión 3D es UN proyecto dentro de forma, no el todo.

## Dónde está cada cosa

Cómo encaja todo el sistema hoy (las tres piezas, el viaje de un pedido, el
esquema de D1, el mapa de carpetas): **`docs/ARQUITECTURA.md`**. Es la fuente
de verdad del retrato; no lo dupliques aquí.

| Tema | Documento |
| --- | --- |
| Configurador de lámparas, /taller (Impresión 3D), agente local, Bambu A1, AMS, trabajos de impresión | `docs/IMPRESION_3D.md` — léelo ANTES de tocar esas piezas |
| STL de clientes: importar en /taller, rebanado con el CLI de Bambu Studio, R2 | `docs/STL_CLIENTES.md` — implementado y validado en producción |
| Agregar módulos al dashboard o tocar la estructura de /taller | `docs/ROADMAP_ARQUITECTURA.md` — convenciones y receta de activación |
| Servidor de IA (Mac mini, revisión local de PR, Telegram, modelos abiertos, métricas) | `docs/AGENTE_IA.md` — plan aprobado, SIN implementar; léelo antes de cualquier fase |
| Negocio: Stripe live, SAS/RFC, páginas legales, envíos, CFDI, respaldos, CI, analytics | `docs/NEGOCIO.md` — plan por fases, sin implementar. Los textos legales son borradores: abogado/contador antes de confiar en ellos |
| Newsletter de clientes: escribir o construir una edición | `.claude/skills/newsletter/SKILL.md` y el código en `newsletter/`. El envío se queda manual: la API de Reach no crea campañas |
| Newsletter: decisiones de canal, cuenta de Reach, datos legales del pie | `docs/MARKETING.md`. No confundir con el newsletter interno (agente de Cowork aparte, sin relación con este repo) |
| Marca, voz, estilos | `ds-bundle/readme.md` |
| Sincronizar `ds-bundle/` con el proyecto de Claude Design (pull-before-push) | `.design-sync/NOTES.md` — léelo ANTES de tocar `ds-bundle/`; hay una regla que se auto-carga en `.claude/rules/design-sync.md` |

Lo que aún no existe (Stripe en prueba, avisos rotos, lo legal) está en
`docs/ARQUITECTURA.md` §6, no aquí — así no hay dos listas que se contradigan.

Voz de marca, regla corta: español de tú, primera persona, sin marketing,
SIN emoji, sentence case, tokens de `src/styles/brand.css`.

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

## Deploy — quién hace qué (aplica a Claude, local y nube)

El sitio se despliega solo al mergear a `master`. El Worker **no**: es un paso
aparte y es trabajo de Claude, no de Salva — y va **antes** del merge del
sitio, nunca después. Orden completo:

**migración remota → deploy del worker → merge del sitio.**

Si un PR toca `workers/api`, despliégalo con `cd workers/api && npm run deploy`
desde la rama antes de dejar que el merge aterrice: el frontend nuevo nunca
debe quedar en producción llamando a un worker que todavía no tiene esa ruta.
Dos condiciones:

1. **Decir siempre qué se desplegó.** Nunca en silencio.
2. **Preguntar antes si el cambio toca cobros de verdad** — lógica de Stripe,
   precios, webhook de pagos. Subir la versión de la librería de Stripe no
   cuenta; cambiar cómo se cobra, sí.

Auth de wrangler: `CLOUDFLARE_API_TOKEN` por variable de entorno. En las
sesiones de nube ya viene puesta y wrangler la toma sola (ahí wrangler también
necesita `NODE_USE_ENV_PROXY=1`). En local es una variable de usuario de
Windows; como los procesos ya arrancados no ven una variable recién creada, se
lee del registro dentro del mismo comando, sin imprimirla:

```powershell
cd workers/api; $env:CLOUDFLARE_API_TOKEN = [Environment]::GetEnvironmentVariable('CLOUDFLARE_API_TOKEN','User'); npm run deploy
```

## Secretos

El repo es **privado** desde julio 2026 (fue público). Eso NO relaja las
reglas.

- **Ningún secreto se commitea jamás.** Viven en `wrangler secret`, en
  `.dev.vars` o en configs locales de las máquinas de Salva. El
  `CLOUDFLARE_API_TOKEN` NUNCA se pide por chat ni se escribe en un archivo —
  y en particular jamás en `.claude/settings.json`, que sí se commitea.
- Secretos del Worker: `STRIPE_SECRET_KEY` (test), `STRIPE_WEBHOOK_SECRET`,
  `ADMIN_TOKEN`, `AGENT_TOKEN`, `NTFY_TOPIC` (legado y roto: ntfy.sh bloquea a
  Workers).
- **Los STL/3MF no van en git** (binarios pesados). Viven en
  `C:\Users\salva\Desktop\FORMA\06-Web\3mf\`.
- Al tocar features de Cloudflare que este repo aún no usa, o ante errores
  raros de plataforma/wrangler: consulta la guía oficial para agentes
  (https://developers.cloudflare.com/agent-setup/prompt.md y el repo
  cloudflare/skills) ANTES de improvisar. Para lo ya establecido (deploy,
  migraciones D1, secretos) mandan las convenciones de este repo.

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

Fases pequeñas y desplegables. Salva opera desde su teléfono (/taller) y su PC
Windows (agente actual; futura estación de trabajo); dale pasos manuales con
comandos exactos de PowerShell o del shell de la Mac, según la máquina.

**Ramas:** `master` es la única de larga vida (= producción). Cada cambio va en
una rama corta desde `master`, se squash-mergea y muere; nunca se apilan
commits sobre una rama ya mergeada (se reinicia desde `master`). Sin worktrees
ni ramas de entorno.

**Revisión de Codex.** Al iniciar cada sesión, antes del trabajo nuevo, revisa
si Codex dejó conversaciones o comentarios pendientes en PR anteriores,
incluidos los ya mergeados. Si la sesión genera más de un PR, repite la
revisión antes de crear el siguiente. Atiende primero los hallazgos aplicables
en una rama nueva y resuelve la conversación después de corregir. Si un
hallazgo no aplica, deja una explicación breve y resuélvelo. Hazlo por
iniciativa propia: Salva no tiene que recordártelo.

**La pausa de la demo.** Para cualquier cambio de producto perceptible por
Salva o por un visitante (diseño o UX, páginas, módulos, funciones,
integraciones o comportamiento), crea una rama corta e implementa, pero no
abras todavía el PR. Ejecuta una vista o flujo local y muéstrale una
demostración clara con capturas; itera en esa misma rama hasta que confirme el
resultado. Si depende de un servicio externo, prueba en modo local o de prueba
todo lo posible y explica qué activación externa quedaría para después. Esa
confirmación es sobre el producto y autoriza abrir el PR y llevarlo hasta el
merge sin pedirle otra aprobación de GitHub. NO añadas esta pausa a
mantenimiento interno sin cambios perceptibles: dependencias, CI, tests,
documentación o refactors puramente técnicos.

**GitHub es trabajo de Claude, merge incluido.** Claude crea la rama,
implementa, abre el PR cuando corresponda y corrige los hallazgos de CI y de
Codex. Intenta activar auto-merge con método squash, pero **cuenta con que
falle**: el repo tiene "Allow auto-merge" prendido y aun así la herramienta lo
rechaza en los dos estados — "unstable" con checks corriendo, y "already clean"
con todo verde.

Así que **cuando el auto-merge falle, por el motivo que sea, haz tú el squash
merge** en cuanto se cumplan las tres condiciones: checks verdes, sin
conversaciones abiertas y respetando el orden de deploy de arriba. No lo
reintentes esperando que cambie, y no dejes el PR parado: un PR verde nunca se
queda esperando a Salva. El merge a `master` dispara el deploy a Hostinger.

## Organización del repo

Toda la documentación por área vive en `docs/`. En la raíz solo quedan
`README.md` (presentación) y `CLAUDE.md` (este archivo). Las reglas que solo
aplican a ciertos archivos viven en `.claude/rules/` y se cargan solas cuando
Claude toca esos archivos. `ds-bundle/` no se reorganiza: su layout lo dicta el
sync con Claude Design (`.design-sync/`).
