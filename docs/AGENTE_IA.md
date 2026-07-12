# Agente de IA local — plan por fases (Raspberry Pi + LLM híbrido)

Plan de referencia para convertir la capa operativa del taller en un agente
de IA real. Léelo completo antes de implementar cualquier fase. **Estado:
ninguna fase está implementada; este documento es el plan aprobado con
Salva (julio 2026).** Las fases se ejecutan una por una, cuando Salva lo
pida, y cada una se mergea sola.

## La visión, en corto

Hoy el "agente" (`agent/`, la PC Windows junto a la Bambu A1) es un ejecutor:
imprime lo que sigue en la fila y ya. El plan lo complementa con un asistente
de verdad — una Raspberry Pi siempre prendida que:

1. Te avisa por Telegram de lo que importa (pago recibido, pieza terminada,
   impresión fallida) — y de paso revive los avisos que ntfy dejó muertos.
2. Responde preguntas del negocio con datos reales ("¿cómo van las ventas
   contra el mes pasado?").
3. Ordena la cola de impresión con criterio (terminar pedidos empezados,
   agrupar por color del AMS, respetar antigüedad) y explica cada decisión.

La meta larga: que la capa operativa y de datos la administre la IA para que
Salva se dedique a desarrollar productos. Inventario de filamento, monitoreo
con cámara y despacho automático quedan esbozados como fases futuras.

## Qué corre dónde

```
┌────────────────┐  /api/admin/* ADMIN   ┌──────────────────────┐
│ Sitio /taller  │ ◄───────────────────► │ Worker (Hono) + D1   │
│ Astro/Hostinger│                       │ FUENTE DE VERDAD     │
└────────────────┘                       │  · pedidos/trabajos  │
                                         │  · outbox de eventos │
┌────────────────┐  /api/agent/* AGENT   │  · métricas          │
│ PC Windows     │ ◄───────────────────► │  · prioridad/claim   │
│ (impresora A1) │   SIN CAMBIOS         └──────────▲───────────┘
└────────────────┘                                  │ /api/ai/* AI
                                         ┌──────────┴───────────┐
              Telegram (long polling) ◄─►│ Raspberry Pi         │
              Claude API (sin PII)    ◄─►│  · bot + router LLM  │
              Ollama/Gemma (local)    ◄─►│  · scorer de cola    │
                                         │  · cursor local      │
                                         └──────────────────────┘
```

- **Worker/D1**: única fuente de verdad. Tokens, outbox `agent_events`,
  métricas, `print_jobs.priority`, `agent_decisions`, claim.
- **Raspberry Pi**: orquesta y conversa. Nunca guarda estado canónico; solo
  cachea (su cursor de eventos es un archivo local — perderlo solo re-manda
  avisos).
- **Cloud (Claude API)**: solo inferencia, con agregados sin PII.
- **PC Windows (impresora)**: sin cambios en las fases 0-5. Su protocolo
  (`/api/agent/*`) queda congelado.
- **/taller**: gana el módulo Métricas (fase 3) y el módulo Agente con la
  bitácora de decisiones (fase 5).

## Costos y reparto de trabajo

| Qué | Cuánto |
| --- | --- |
| Raspberry Pi 5 8 GB + fuente 27 W + SSD | ~$2,500–3,500 MXN, una sola vez |
| Electricidad | la Pi consume 5-10 W, unos pesos al mes |
| Claude API (`claude-haiku-4-5`) | a este volumen, <$50 MXN/mes, prepagado |
| Telegram | gratis |

Claude hace todo el código, pruebas, PRs, merges y deploys. A Salva le toca
solo lo físico, siempre con pasos exactos: comprar y encender la Pi (fase 0),
crear el bot con BotFather y pegar dos tokens en la Pi (fase 2), sacar una
API key de Anthropic con saldo (fase 4).

## Decisiones de diseño

| Decisión | Elección | Por qué |
| --- | --- | --- |
| Auth del agente IA | Tercer token estático `AI_TOKEN` + sub-app propia `/api/ai/*` | Ampliar la unión de `bearer()` (`workers/api/src/lib/auth.ts`) cuesta una línea; `api_tokens` con scopes sigue diferida (`ROADMAP_ARQUITECTURA.md` §9). Regla existente: nunca compartir sub-app entre tokens. |
| Avisos (ntfy murió) | Tabla outbox `agent_events` en D1; la Pi la lee por cursor y manda Telegram | El Worker no alcanza ntfy.sh y no debe cargar el token de Telegram. Escrituras solo por evento real (~unidades/día, irrelevante para el presupuesto D1). Lectura por cursor = cero escrituras de polling. |
| Prioridad de cola | Columna `print_jobs.priority`; el claim ordena `priority DESC, created_at` en el Worker | El agente de la PC no cambia nada: el orden es server-side. Solo cambia el `ORDER BY` del claim atómico (`workers/api/src/routes/agent.ts`). |
| ¿El LLM decide cada orden? | No. Un scorer determinista en Python calcula prioridades; el LLM explica y propone ajustes acotados | El claim corre cada 20 s: un LLM ahí es lento, caro y no testeable. El scorer cubre el 95 % y se prueba con pytest; la explicación legible se guarda en `agent_decisions`. |
| Métricas | Lógica en `workers/api/src/lib/metricas.ts`, expuesta dos veces: `/api/admin/metricas/*` (panel) y `/api/ai/metricas/*` (LLM) | Una sola implementación sirve al humano y a la IA; sigue "rutas delgadas, lógica en lib". |
| PII hacia el LLM cloud | Garantía estructural: `/api/ai/*` JAMÁS devuelve `customer_name/email/phone/shipping_json` — solo agregados, IDs de pedido y montos | Si el endpoint no lo devuelve, no puede filtrarse por un bug de prompt. Más robusto que anonimizar en la Pi. |
| Framework en la Pi | Paquete propio `pi/` calcando `agent/`: loop simple + `python-telegram-bot` + SDK `anthropic` (tool runner) + `ollama`. Sin LangChain ni frameworks de agentes | Proyecto de una persona: pocas dependencias bien documentadas y el patrón `TallerApi` (`agent/formamx_agent/api.py`) ya probado. El router local/cloud son ~30 líneas. |
| Modelos | Local: Gemma 3 4B QAT (`ollama pull gemma3:4b-it-qat`, ~3.3 GB) para intención y plantillas. Cloud: `claude-haiku-4-5` por default, configurable | El modelo es un campo de config (`pi/config.toml`), fácil de subir cuando salga algo mejor que quepa en la Pi. |

### Telegram sí, WhatsApp después

- **Telegram**: crear el bot toma 2 minutos, el long polling desde la Pi no
  necesita endpoint público ni secretos en el Worker, y es gratis. Es la
  interfaz operativa de Salva.
- **WhatsApp (Meta Cloud API)**: viable pero con fricción — cuenta Meta
  Business con verificación de negocio, número dedicado, webhook HTTPS
  público, ventana de 24 h y plantillas aprobadas para salientes. Cuando se
  haga, será *orientado a clientes*: webhook en el Worker
  (`POST /api/webhook/whatsapp`, idempotencia estilo `webhook_events`) →
  tabla `messages` (Inbox, `ROADMAP_ARQUITECTURA.md` §7) → la Pi lee y el
  LLM redacta borradores que Salva aprueba por Telegram. Caso de uso
  distinto, fase futura.

## Fase 0 — setup de la Raspberry Pi (sin código en el repo)

**Corre en: Pi.** Objetivo: hardware listo con Ollama sirviendo el modelo
local.

- Hardware: Raspberry Pi 5 **8 GB** (16 GB solo si se quiere holgura para
  modelos 7-8B), SSD por USB o HAT NVMe (mejor que microSD), fuente oficial
  de 27 W, disipador activo.
- Software: Raspberry Pi OS Lite 64-bit, Ollama
  (`curl -fsSL https://ollama.com/install.sh | sh`),
  `ollama pull gemma3:4b-it-qat`. Opcional: Tailscale para SSH remoto —
  cero puertos abiertos.
- Entregable en el repo: `docs/pi.md` con la receta paso a paso (entra con
  el PR de la fase 2).
- **Verifica**: `ollama run gemma3:4b-it-qat "hola"` responde;
  `curl localhost:11434/api/tags` lista el modelo.

## Fase 1 — Worker: token IA + outbox de eventos

**Corre en: Worker/D1.** Objetivo: la puerta segura para la Pi y los avisos
registrados. Útil sola: deja los eventos guardados aunque la Pi no exista
todavía.

- Migración `workers/api/migrations/0011_agent_events.sql`:

  ```sql
  CREATE TABLE agent_events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,  -- cursor natural para la Pi
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    kind         TEXT NOT NULL,   -- pago_recibido|pieza_terminada|pedido_completo|impresion_fallida|... (sin CHECK, lección 0004)
    order_id     TEXT,
    job_id       TEXT,
    payload_json TEXT
  );
  ```

- `workers/api/src/env.ts`: agregar `AI_TOKEN`; quitar `NTFY_TOPIC`.
- `workers/api/src/lib/auth.ts`: la unión de `bearer()` pasa a
  `'ADMIN_TOKEN' | 'AGENT_TOKEN' | 'AI_TOKEN'`.
- `workers/api/src/lib/eventos.ts` (nuevo):
  `publishEvent(db, kind, { orderId, jobId, payload })`.
- Sustituir las 4 llamadas a `notify()` en `workers/api/src/routes/agent.ts`
  y la de `workers/api/src/routes/webhook.ts` por `publishEvent`; borrar
  `workers/api/src/lib/ntfy.ts` (código muerto desde que ntfy bloqueó a
  Workers).
- `workers/api/src/routes/ai/index.ts` (nuevo): sub-app con
  `bearer('AI_TOKEN')`, montada como `app.route('/api/ai', ai)` en
  `workers/api/src/index.ts`. Endpoints:
  - `GET /api/ai/events?after=<id>&limit=50` — lectura pura por cursor, sin
    ack en D1.
  - `GET /api/ai/estado` — snapshot sin PII: cola (jobs queued/printing con
    part y colores), `printer_flags`, `spool_slots`, conteo de pedidos por
    status.
- Documentar en `workers/api/README.md`.
- **Verifica**: `migrate:local` + `wrangler dev` + curl con los tres tokens
  (el AI ve `/api/ai/*` y recibe 401 en `/api/admin/*`); typecheck del
  worker; e2e existentes en verde.
- **Deploy**: migración remota → `wrangler secret put AI_TOKEN` → worker.

## Fase 2 — Pi: bot de Telegram + notificaciones (sin LLM todavía)

**Corre en: Pi.** Objetivo: Salva recupera los avisos al teléfono y gana
comandos de consulta. Útil sola.

Estructura nueva en el repo (calca de `agent/`):

```
pi/
  README.md  config.example.toml  requirements.txt
  deploy/formamx-pi.service        # systemd
  formamx_pi/
    __main__.py   # loop principal
    api.py        # cliente del Worker (patrón agent/formamx_agent/api.py, token AI)
    events.py     # cursor local (~/.formamx/cursor) + fetch de /api/ai/events
    bot.py        # python-telegram-bot, long polling, allowlist de chat_id
    format.py     # evento -> mensaje legible en español
  tests/          # pytest: format, cursor, api con requests mockeado
```

- `config.example.toml`: `api_base`, `ai_token`, `telegram_bot_token`,
  `allowed_chat_ids`, `poll_seconds = 45`. La copia real vive SOLO en la Pi
  (mismo patrón que `agent/config.example.toml`; el repo es público).
- Comandos: `/estado` (impresora + candado + AMS), `/cola`, `/pedidos` —
  todos contra `/api/ai/estado`.
- Loop: cada 45 s lee eventos nuevos → manda mensajes → avanza el cursor.
- **Verifica**: `pytest pi/tests`; corrida manual contra `wrangler dev`;
  prueba real: pago de prueba en Stripe → aviso en Telegram.
- **Deploy**: merge (no toca sitio ni worker) → `git pull` + restart del
  systemd en la Pi.

## Fase 3 — Worker + /taller: métricas del negocio

**Corre en: Worker + navegador.** Objetivo: agregados de ventas consultables
por el panel y (fase 4) por el LLM. Es el "preparar la página".

- `workers/api/src/lib/metricas.ts` (nuevo): funciones puras —
  `resumenVentas(db, desde, hasta)` → total_mxn, número de pedidos, ticket
  promedio, por producto, por `payment_method`, embudo de estados;
  `serieVentas(db, granularidad)` → por día/semana/mes sobre `paid_at`.
  Solo lee `orders`/`products`; JAMÁS columnas `customer_*`.
- `workers/api/src/routes/admin/metricas.ts` → montar
  `admin.route('/metricas', metricas)` en `routes/admin/index.ts`.
- `workers/api/src/routes/ai/metricas.ts` → las mismas funciones de lib
  bajo `/api/ai/metricas/*`.
- Frontend (receta de `ROADMAP_ARQUITECTURA.md` §8):
  `src/lib/taller/metricas.ts` (+ re-export en `index.ts`),
  `src/components/taller/metricas/MetricasPanel.tsx`, entrada
  `{ id: 'metricas', label: 'Métricas' }` en
  `src/components/taller/registry.ts`.
- Specs en `tests/e2e/taller.spec.ts` con la API mockeada (`page.route`).
- **Verifica**: curl contra `wrangler dev` con seed local; Playwright;
  `npx astro check`.
- **Deploy**: worker → sitio (sin migración; el frontend nuevo llega después
  del worker, regla §8.7).

## Fase 4 — Pi: LLM conectado (preguntas de negocio por Telegram)

**Corre en: Pi (orquestación + modelo local) y cloud (análisis).** Objetivo:
"¿cómo van las ventas este mes contra el pasado?" respondido en Telegram.

- `pi/formamx_pi/llm.py`: el router — mensajes que matchean comandos o
  plantillas → local (Ollama, Gemma) o respuesta directa; pregunta libre →
  cloud vía SDK `anthropic` con su tool runner (`@beta_tool` +
  `client.beta.messages.tool_runner`), modelo default `claude-haiku-4-5`
  configurable en `config.toml` (`anthropic_api_key`, `cloud_model`).
- `pi/formamx_pi/tools.py`: herramientas delgadas sobre `api.py`:
  `get_metricas(desde, hasta)`, `get_serie(granularidad)`, `get_estado()`,
  `get_cola()`. La PII no puede llegar al prompt porque los endpoints no la
  devuelven.
- `pi/formamx_pi/prompts.py`: system prompt del negocio (qué vende forma,
  estados de pedido, montos en centavos MXN).
- `bot.py`: los mensajes libres pasan a `llm.answer(text)`.
- **Verifica**: pytest del router y del shaping de herramientas (API
  mockeada); E2E manual por Telegram con datos de prueba.
- **Deploy**: solo la Pi (los endpoints ya existen desde las fases 1 y 3).

## Fase 5 — priorización inteligente de la cola

**Corre en: Worker (claim + registro), Pi (decisión) y /taller
(visibilidad).** Objetivo: la cola deja de ser FIFO ciego y cada
reordenamiento queda explicado y auditable.

- Migración `workers/api/migrations/0012_prioridad_agente.sql`:

  ```sql
  ALTER TABLE print_jobs ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;
  CREATE INDEX idx_jobs_claim ON print_jobs(status, priority, created_at);
  CREATE TABLE agent_decisions (          -- boceto §7 del roadmap, tal cual
    id         TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    action     TEXT NOT NULL,
    order_id   TEXT,
    job_id     TEXT,
    reason     TEXT NOT NULL
  );
  ```

- `workers/api/src/routes/agent.ts`: el claim pasa a
  `ORDER BY priority DESC, created_at LIMIT 1` — único cambio que ve la
  impresora; la PC Windows no se modifica.
- `workers/api/src/routes/ai/cola.ts`: `GET /api/ai/cola` (jobs queued con
  colores/part + edad del pedido, sin PII) y
  `POST /api/ai/cola/prioridades` `{ items: [{job_id, priority}], reason }`
  → batch UPDATE + INSERT en `agent_decisions`. Validación (solo jobs
  `queued`) en `workers/api/src/lib/jobs.ts`.
- `workers/api/src/routes/admin/agente.ts`:
  `GET /api/admin/agente/decisiones` + módulo `agente` en /taller
  (`src/components/taller/agente/AgentePanel.tsx`, cliente
  `src/lib/taller/agente.ts`, entrada en `registry.ts`): la lista de
  decisiones con su porqué.
- Pi `pi/formamx_pi/scheduler.py`: se dispara con eventos del outbox (pago
  nuevo, job done/failed) y como red de seguridad cada 15 min. El scorer
  determinista ordena por: (1) piezas de pedidos ya empezados primero,
  (2) antigüedad del pago, (3) agrupar por color montado en el AMS para
  minimizar cambios de bobina. El LLM produce la explicación (y puede
  proponer un ajuste acotado); POST al Worker; aviso por Telegram
  "Reordené la cola: …".
- Actualizar `ROADMAP_ARQUITECTURA.md` §7 (la decisión corre en la Pi, no
  en un cron del Worker) y `docs/IMPRESION_3D.md` con el nuevo actor.
- **Verifica**: pytest del scorer (función pura: pedido viejo contra
  agrupación de color, pedido a medias); curl contra `wrangler dev`
  comprobando que el claim respeta `priority`; Playwright del panel.
  Escrituras D1 solo por evento, no por intervalo.
- **Deploy**: migración remota → worker → sitio → Pi.

## Fases futuras (esbozo, sin comprometer diseño)

1. **Inventario de bobinas**: tablas `bobinas`/`piezas` del roadmap §7 +
   `spool_slots.bobina_id`; el descuento de gramos por trabajo necesita una
   tabla estática gramos-por-pieza en código (`lib/`). La Pi avisaría
   "bobina roja al 15 %".
2. **Cámara de la A1**: 720p por protocolo propietario LAN (puerto 6000,
   access code); hay librerías comunitarias que extraen frames JPEG. Diseño
   natural: capturar frame → visión con Claude para detectar spaghetti o
   despegue → evento + pausa. Evaluar la estabilidad de las librerías antes
   de comprometer.
3. **Pausa remota**: el comando MQTT `print pause` existe. Ruta: flag
   `printer_flags.pause_requested` en D1 que el agente de la PC lee en su
   loop de reporte y ejecuta — cambio pequeño y único en
   `agent/formamx_agent/printer.py`.
4. **WhatsApp**: ver "Telegram sí, WhatsApp después" arriba.
5. **Auto-dispatch**: `agent_policies` (roadmap §7) + endpoint
   `/api/ai/pedidos/:id/dispatch` reusando `createJobsForOrder`
   (`workers/api/src/lib/jobs.ts`), con el gate `auto_dispatch` apagado por
   default.

## Verificación global por fase

pytest (`agent/` y `pi/`), `npx astro check`, typecheck del worker,
`wrangler dev` local con `migrate:local`, Playwright
(`PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test`).
Orden de deploy siempre: migración remota → worker → sitio → Pi. Cada fase
se mergea sola (squash a `master`) con el flujo de GitHub que Claude ejecuta
completo.
