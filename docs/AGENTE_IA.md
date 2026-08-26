# Servidor de IA local — plan por fases (Mac mini M6 + Hermes Agent)

Plan de referencia para incorporar un asistente de IA local propio a forma:
avisos por Telegram, consultas del negocio, métricas, priorización de la cola
de impresión y, en paralelo, un asistente personal (resúmenes, notas,
recordatorios) sobre la misma máquina. Léelo completo antes de implementar
cualquier fase.

**Estado: ninguna fase está implementada.** Es un plan futuro aprobado con
Salva en agosto de 2026. No comprar hardware, cambiar el flujo de GitHub ni
implementar una fase hasta que Salva lo pida. Cada fase debe ser pequeña,
verificable y mergearse por separado.

## La visión, en corto

Una Mac mini dedicada funcionará como el pequeño servidor de IA del taller.
No será fuente de verdad ni controlará directamente la producción:

1. Ejecutará el agente actual de la Bambu A1 y guardará los 3MF, para que la
   PC Windows no tenga que permanecer encendida.
2. Enviará avisos por Telegram y responderá preguntas usando datos del
   negocio (ventas, pedidos, cola de impresión).
3. Propondrá y explicará prioridades de impresión mediante reglas
   comprobables; el LLM explica, no decide.
4. Más adelante podrá ayudar a monitorear la impresora con su cámara,
   gestionar inventario de bobinas y otras tareas operativas.
5. En paralelo, la misma máquina sirve como asistente personal de Salva
   (resumir correos, notas de voz, artículos; recordatorios) — mismo
   framework, mismo modelo, sin pagar dos suscripciones.

La meta es no depender de una suscripción ni de una API de IA de pago para
estas funciones. La compra del equipo y la electricidad son los únicos
costos necesarios.

**Fuera de alcance deliberadamente:** revisión local de pull requests. Se
evaluó como fase (comparar un revisor local contra Codex) y se descartó:
no aporta lo suficiente para el volumen de PR de un taller de una persona y
obligaba a una Mac de gama más alta (64 GB) solo para alojar un modelo de
código grande. Codex sigue siendo el revisor de PR.

## Por qué una Mac mini M6

Es la escala correcta para un taller de una persona: un bot privado, una
cola de impresión chica y un asistente personal. La memoria unificada
permite ejecutar modelos mayores que los que caben en la GPU de 8 GB de la
PC actual, con poco ruido, consumo y mantenimiento.

Referencia de compra a agosto de 2026, no pedido inmediato:

- **Mac mini M6, 32 GB de memoria unificada, SSD de 1 TB.** (~$19,999 MXN
  la config base de 16 GB/256 GB; sumar memoria y disco al comprar.)
- No se necesita el M5 Pro ni sus 64 GB: ese salto de precio (~+$20,000 MXN)
  solo se justificaba por alojar un modelo de código de ~24B para revisión
  de PR, que ya se descartó. Con el alcance actual, un modelo general MoE de
  ~30B (activos ~3B por token) cabe holgado en 32 GB.
- Aviso sobre el marketing del M6: el "hasta 4x más IA" de Apple se refiere
  sobre todo al Neural Engine (Apple Intelligence on-device), no
  necesariamente al motor que usa Ollama/MLX para inferencia de LLM, que
  corre sobre los 12 núcleos GPU. No esperar ese multiplicador en
  tokens/segundo — sigue siendo más que suficiente para este volumen.
- Ethernet por cable; UPS recomendable si operará todo el día.
- La Mac reemplazará a la PC Windows como ejecutor de impresión después de
  una prueba FTPS/MQTT real y supervisada. La PC sólo se encenderá cuando
  Salva quiera trabajar en ella o preparar archivos.

La Mac es un único punto de servicio. Si está apagada, no arrancan nuevas
impresiones y Telegram/las tareas locales esperan. Una impresión ya iniciada
continúa dentro de la A1, pero el agente deja de reportar hasta recuperarse;
por eso la recuperación tras reinicio forma parte del corte.

## Qué corre dónde

```text
┌──────────────────┐      /api/admin/*       ┌────────────────────────┐
│ Sitio /taller    │ ◄─────────────────────► │ Worker (Hono) + D1     │
│ Astro/Hostinger  │                          │ FUENTE DE VERDAD        │
└──────────────────┘                          │ · pedidos y trabajos    │
                                              │ · eventos y métricas    │
                                              └───────────▲────────────┘
                                                │ /api/agent/* + /api/ai/*
                                    ┌───────────┴───────────┐
                                    │ Mac mini M6            │
                                    │ · Ollama (Qwen3-30B-A3B)│
                                    │ · Hermes Agent (daemon) │
                                    │ · bot de Telegram       │
                                    │ · métricas/scheduler    │
                                    │ · agente Bambu + 3MF    │
Telegram ◄────────────────────────►│                         │
                                    └───────────┬────────────┘
                                                │ FTPS/MQTT por LAN
                                    ┌───────────▼────────────┐
                                    │ Bambu A1 + AMS         │
                                    └────────────────────────┘
```

- **Worker/D1:** única fuente de verdad del negocio. La Mac sólo lee, propone
  acciones por endpoints autorizados y conserva cachés reconstruibles.
- **Mac mini:** sirve el modelo (Ollama), corre Hermes Agent como orquestador
  (memoria entre sesiones, cron, conector de Telegram), conserva los 3MF y
  ejecuta el agente actual de impresión por FTPS/MQTT. Sus servicios de IA
  sólo hacen conexiones salientes; nada se publica en Internet.
- **PC Windows:** estación de trabajo opcional, no servidor.
- **Bambu A1:** sigue ejecutando cada impresión de forma autónoma una vez
  iniciada. La Mac la monitorea y reporta el resultado.
- **GitHub:** conserva CI determinista y Codex como revisor de PR; esta Mac
  no participa en ese flujo.
- **/taller:** gana métricas y la bitácora de decisiones en sus fases.

## Principios que no se negocian

- **Sencillez:** una máquina, servicios pequeños y configuraciones legibles.
  Sin Kubernetes, LangChain ni una plataforma de agentes propia — se adopta
  un framework existente (ver más abajo) en vez de escribir el orquestador
  desde cero.
- **Sin mensualidad obligatoria:** modelos locales con licencia compatible y
  sin fallback cloud activado por defecto.
- **Mínimo privilegio para el agente:** las skills que Hermes Agent puede
  usar empiezan siendo sólo de lectura contra `/api/ai/*`. Ninguna acción
  que escriba en el negocio (pedidos, pagos, impresión) se le da al agente
  sin una fase separada, validaciones explícitas y bitácora.
- **Aislamiento estructural:** Hermes Agent corre bajo el usuario dedicado
  `formamx-ai`, sin acceso a los secretos del Worker/Stripe/impresora más
  allá del token de sólo lectura `AI_TOKEN`, y sin exponer su daemon o
  WebSocket fuera de `localhost`/Tailscale. No se le da acceso a shell del
  sistema ni a navegador salvo que una fase futura lo justifique y evalúe el
  riesgo explícitamente.
- **Por qué Hermes Agent y no OpenClaw:** ambos son frameworks de agente
  personal autohospedado con memoria, cron y conectores de mensajería.
  OpenClaw acumula varios CVE serios en 2026 (inyección de comandos, SSRF,
  path traversal, RCE por WebSocket sin validar origen) precisamente por dar
  acceso amplio a shell/sistema de archivos/navegador por defecto — riesgo
  alto para una máquina que va a estar cerca del token del Worker y de la
  LAN de la impresora. Hermes Agent no tiene ese historial y cubre lo mismo
  que necesita este plan. Se puede reevaluar OpenClaw más adelante si su
  postura de seguridad mejora y hay una razón concreta para el cambio.
- **Revisión proporcional al riesgo:** aplica igual a las skills del agente:
  una consulta de sólo lectura no necesita aprobación previa; cualquier
  acción que escriba datos sí.
- **Pruebas antes que opiniones:** lint, tipos, tests y build siguen siendo
  los gates principales del sitio y el Worker. Un LLM no declara correcto un
  cambio que rompe CI ni participa en ese gate.
- **Prioridad de producción:** el agente de impresión es un servicio
  separado y ligero. Una consulta de IA nunca debe detenerlo ni consumir
  toda la memoria disponible.
- **Privacidad estructural:** los endpoints de IA no entregan nombre, correo,
  teléfono ni dirección. No basta con pedirle al prompt que ignore la PII.
- **Auditoría:** cada decisión operativa de IA se guarda con entrada,
  resultado y explicación; siempre existe una regla determinista de
  respaldo.
- **Actualización prudente:** las versiones de modelo y del framework se
  fijan. Una versión nueva pasa una evaluación antes de reemplazar a la
  anterior.

## Modelo y framework de agente

**Framework: Hermes Agent** (Nous Research) — daemon persistente,
autohospedado, con memoria entre sesiones, tareas cron, conector de
Telegram y compatible con cualquier backend de inferencia incluido Ollama
local. Se prefiere sobre construir un `ai-server/` a medida porque ya
resuelve memoria, scheduler y conectores de mensajería; sólo se le agregan
las skills propias contra `/api/ai/*`.

**Modelo baseline: Qwen3-30B-A3B** (MoE, ~30B parámetros totales, ~3B
activos por token) servido por Ollama. Se eligió porque:

- cabe holgado en 32 GB cuantizado, dejando memoria para el sistema, Hermes
  Agent y el agente de impresión corriendo a la vez;
- al ser MoE con pocos parámetros activos, es rápido incluso con el ancho
  de banda de memoria más modesto del M6 (170 GB/s) frente a un modelo denso
  del mismo tamaño;
- tiene licencia permisiva y funciona de forma estable con Ollama.

Modelos como **Kimi K2/K2.7** o **GLM-5.2** quedan descartados: son MoE de
~1 billón de parámetros; que sean MoE reduce el cálculo por token, no la
memoria necesaria para alojar todos los pesos, y no caben ni en 32 ni en
64 GB. No son candidatos residentes para esta Mac salvo que aparezca una
versión pequeña oficial que cumpla los criterios de abajo.

Criterios para evaluar cualquier modelo antes de fijarlo:

- quepa en un máximo aproximado de **20 GB** cuantizado, dejando memoria
  para el sistema, Hermes Agent y el agente de impresión;
- licencia permisiva para este uso;
- funcione de forma estable con Ollama;
- acepte el contexto necesario para las skills de negocio;
- responda consultas típicas de Telegram/negocio en segundos, no minutos.

Ollama es la primera opción por sencillez, API compatible y porque ya usa
MLX de fondo en Apple Silicon. La API escucha en `localhost`, donde no
requiere ni debe asumir autenticación.

## Fase 0 — preparación de la Mac mini y migración de la impresora

**Corre en: Mac + una transición supervisada desde Windows.** Objetivo: un
solo equipo encendido para IA y producción, recuperable y administrable.

- Crear usuario dedicado `formamx-ai`, configurar actualizaciones de
  seguridad y registrar inventario/receta de instalación en
  `docs/mac-mini.md`. Decidir FileVault conscientemente: protege el disco,
  pero un arranque en frío requiere que Salva lo desbloquee físicamente
  antes de que inicien los servicios.
- Instalar Tailscale sólo para administración remota, sin abrir puertos en
  el router. Ollama y el daemon de Hermes Agent permanecen ligados a
  localhost.
- Instalar runtime de Python/Node según lo pida Hermes Agent, Ollama y
  supervisión como servicios que reinicien automáticamente (`launchd`).
- Guardar configuración y tokens fuera del repo, con permisos sólo para el
  usuario de servicio. Respaldar únicamente configuración; los modelos se
  pueden volver a descargar.
- Registrar espacio libre, memoria, temperatura, salud de servicios, tiempos
  de inferencia y tamaño de las colas. Alertar por Telegram si un servicio
  falla.
- Ejecutar el `agent/` existente en macOS: su código es portable; las rutas
  de Windows y el Programador de tareas se sustituyen por rutas POSIX y un
  servicio `launchd`. No reescribir FTPS/MQTT sin que una prueba lo
  justifique.
- Mover los 3MF a una carpeta fuera del repo en la Mac, por ejemplo
  `/Users/formamx-ai/formamx/3mf/`, compartida sólo en la LAN/Tailscale.
- Antes del corte, añadir y probar recuperación de trabajo activo tras
  reinicio: persistir localmente el `job_id` en curso, consultar el estado
  de la A1 y reconciliar `printing → done/failed` sin duplicar una
  impresión.
- Probar primero `dry_run`, luego lectura real del AMS, subida FTPS y
  finalmente una impresión completa supervisada con el candado de cama.
- Para el corte, detener el agente de Windows, iniciar el de la Mac y
  confirmar que sólo existe un ejecutor activo. Después deshabilitar la
  tarea programada de Windows; conservar su configuración temporalmente
  como rollback.
- Ejecutar una inferencia pesada durante una prueba de monitoreo y confirmar
  que MQTT, progreso y keepalive no se retrasan. Limitar
  concurrencia/memoria del servidor de modelos si compiten.

**Verifica:** reiniciar la Mac, confirmar que los servicios vuelven solos,
que la inferencia responde por localhost, que nada escucha públicamente y
que el agente se reconcilia con una impresión en curso. La migración sólo
se considera terminada después de una impresión real completa y un reinicio
controlado. Un UPS es altamente recomendable antes de dejar la Mac como
único ejecutor.

## Fase 1 — Worker: token IA + outbox de eventos

**Corre en: Worker/D1.** Objetivo: puerta segura para el asistente y avisos
persistentes aunque la Mac esté apagada.

- Crear migración para `agent_events` con cursor creciente, fecha, tipo,
  `order_id`, `job_id` y `payload_json` sin PII.
- Agregar `AI_TOKEN` y una sub-app propia `/api/ai/*`; nunca compartir rutas
  ni token con `/api/admin/*` o `/api/agent/*`.
- Sustituir el aviso roto de ntfy por escrituras al outbox sólo cuando
  ocurre un evento real.
- Exponer `GET /api/ai/events?after=<id>` y `GET /api/ai/estado`, ambos sin
  PII.
- Mantener D1 como fuente de verdad; el cursor local de la Mac sólo es
  caché.

**Verifica:** migración local, typecheck, auth cruzada con los tres tokens y
pruebas del Worker. **Deploy:** migración remota → secreto → Worker.

## Fase 2 — Hermes Agent + Telegram

**Corre en: Mac.** Objetivo: avisos y consultas del negocio por Telegram,
usando Hermes Agent como runtime en vez de un bot a medida.

- Instalar Hermes Agent con Ollama como backend local (`Qwen3-30B-A3B`).
- Configurar el conector de Telegram de Hermes Agent con allowlist de
  `chat_id` (sólo Salva). No requiere webhook público.
- Escribir las skills propias, todas de sólo lectura al inicio: leer el
  outbox del Worker (`/api/ai/events`), `get_estado`, `get_cola`,
  `get_pedidos_hoy`. El router de Hermes decide cuándo usarlas; el modelo
  nunca recibe PII ni secretos, sólo agregados e IDs.
- Configurar las tareas cron de Hermes Agent para avisos proactivos
  (eventos nuevos del outbox) y, si se quiere, un resumen periódico.
- Los tokens reales viven sólo en la Mac. Reintentar con backoff, no perder
  eventos durante un reinicio y evitar duplicados dentro de lo razonable.

Esta fase también deja lista la base para que Salva use el mismo agente
como asistente personal (resumir correos/notas, recordatorios) agregando
skills de uso propio, sin exponerlas al negocio.

## Fase 3 — métricas del negocio

**Corre en: Worker + `/taller` + Mac.** Objetivo: una sola lógica de
métricas sirve al panel y al asistente.

- Implementar funciones de métricas en `workers/api/src/lib/metricas.ts`.
- Exponerlas por `/api/admin/metricas/*` y `/api/ai/metricas/*`; la segunda
  forma nunca devuelve columnas `customer_*`.
- Añadir el módulo Métricas a `/taller` siguiendo
  `docs/ROADMAP_ARQUITECTURA.md`.
- Agregar skills de Hermes Agent sobre ventas, pedidos y producción usando
  esos endpoints, no SQL duplicado en la Mac.

## Fase 4 — priorización inteligente de la cola

**Corre en: Worker + Mac + `/taller`.** Objetivo: dejar FIFO ciego sin
entregar el control final a una respuesta impredecible.

- Agregar `print_jobs.priority` y `agent_decisions`; el claim del Worker
  ordena por `priority DESC, created_at`.
- La Mac calcula la prioridad con un scorer determinista y probado: terminar
  pedidos empezados, respetar antigüedad y reducir cambios de color del AMS.
- Hermes Agent explica la decisión (skill de sólo lectura sobre el
  resultado del scorer) y puede proponer un ajuste acotado; no inventa el
  estado ni ejecuta directamente la impresión.
- `/taller` muestra la bitácora y el motivo de cada reordenamiento.
- El agente de impresión en la Mac no cambia: recibe el siguiente trabajo ya
  ordenado por el Worker.

**Deploy:** migración remota → Worker → sitio → Mac.

## Fases futuras, todavía sin diseño comprometido

Negocio:

1. **Inventario de bobinas:** consumo estimado y aviso de nivel bajo.
2. **Cámara de la A1:** capturar frames desde el actor que tenga acceso LAN,
   evaluar modelos de visión locales chicos (clase 7B) y avisar ante
   spaghetti/despegue. Primero sólo observar; pausar exige una fase separada
   y pruebas contra falsos positivos.
3. **Pausa remota:** flag en D1 que el agente de la Mac lee y ejecuta por
   MQTT; nunca acceso directo del LLM a la impresora.
4. **WhatsApp:** orientado a clientes, con borradores que Salva aprueba;
   Telegram sigue siendo la interfaz operativa privada.
5. **Auto-dispatch:** políticas explícitas y apagadas por defecto, reusando
   la lógica existente de trabajos.
6. **Extracción de facturas de proveedores** (madera, filamento, resina)
   para llevar gastos sin capturar a mano.
7. **Resumen de reseñas/feedback de clientes** en tendencias, no mensaje por
   mensaje.

Personal (mismo daemon, skills propias, sin tocar datos del negocio):

8. **Resumen de correos, notas de voz y artículos/videos guardados.**
9. **"Segundo cerebro":** RAG local sobre notas y documentos propios de
   Salva, consultable desde Telegram.
10. **Recordatorios y agenda** vía el mismo bot.

Separación de arquitectura, sólo si hace falta más adelante:

11. **Separar nuevamente el ejecutor:** sólo si las cargas de IA afectan de
    forma medible la confiabilidad de impresión; no mantener dos equipos
    por defecto.

## Verificación y operación por fase

- Ejecutar únicamente los checks aplicables definidos en `AGENTS.md`.
- Probar migraciones en D1 local antes de cualquier migración remota.
- Nunca usar pedidos reales, PII, secretos ni archivos 3MF en pruebas.
- Medir calidad y latencia; no asumir que un benchmark público representa
  las consultas reales de forma.
- Documentar instalación, rollback y recuperación antes de dejar un
  servicio como obligatorio.
- Desplegar en orden: migración remota → Worker → sitio → Mac.
- Una fase por PR, squash a `master`; `master` sigue siendo producción.

## Señales para cambiar de arquitectura

Mantener una sola Mac mientras atienda cómodamente el volumen. Reevaluar
Linux con GPU, una segunda máquina o una cola más compleja sólo si ocurre
alguno:

- varias tareas compiten diariamente por memoria y tardan más de lo
  razonable de forma habitual;
- la indisponibilidad de una sola máquina afecta ventas u operación
  crítica;
- los modelos necesarios dejan de caber en memoria;
- se incorporan más repositorios, usuarios o impresoras;
- monitoreo de video continuo exige aceleración independiente.

Si la IA crece pero la impresión sigue siendo ligera, la primera separación
razonable sería mover sólo la inferencia pesada a otra máquina y conservar
el agente Bambu en la Mac estable, no volver a depender de la PC de
trabajo.

Hasta entonces, la Mac mini M6 dedicada es la solución deliberadamente
sencilla y proporcionada para forma.

## Referencias de implementación

- [Hermes Agent — documentación](https://hermes-agent.nousresearch.com/)
- [Hermes Agent — releases](https://github.com/NousResearch/hermes-agent/releases)
- [Ollama: API compatible con OpenAI](https://docs.ollama.com/api/openai-compatibility)
- [Apple: agentes locales con MLX](https://developer.apple.com/videos/play/wwdc2026/232/)
- [Bambu Studio: versiones oficiales para macOS](https://github.com/bambulab/BambuStudio/releases)
- Análisis de seguridad de OpenClaw (contexto de la decisión de framework):
  ["Four OpenClaw Flaws Enable Data Theft, Privilege Escalation, and Persistence"](https://thehackernews.com/2026/05/four-openclaw-flaws-enable-data-theft.html)
