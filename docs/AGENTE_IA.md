# Servidor de IA local — plan por fases (Mac mini + modelos abiertos)

Plan de referencia para incorporar agentes de IA propios a forma: revisión de
pull requests, avisos por Telegram, consultas del negocio, métricas y
priorización de la cola de impresión. Léelo completo antes de implementar
cualquier fase.

**Estado: ninguna fase está implementada.** Es un plan futuro aprobado con
Salva en julio de 2026. No comprar hardware, cambiar el flujo de GitHub ni
implementar una fase hasta que Salva lo pida. Cada fase debe ser pequeña,
verificable y mergearse por separado.

## La visión, en corto

Una Mac mini dedicada funcionará como el pequeño servidor de IA del taller. No
será fuente de verdad ni controlará directamente la producción al principio:

1. Revisará con un modelo local los PR que realmente sean sensibles; los
   cambios visuales sencillos no esperarán esa revisión.
2. Enviará avisos por Telegram y responderá preguntas usando datos del negocio.
3. Propondrá y explicará prioridades de impresión mediante reglas comprobables.
4. Ejecutará el agente actual de la Bambu A1 y guardará los 3MF, para que la PC
   Windows no tenga que permanecer encendida.
5. Más adelante podrá ayudar a monitorear la impresora con su cámara.

La meta es no depender de una suscripción ni de una API de IA para estas
funciones. La compra del equipo y la electricidad son los únicos costos
necesarios. Codex puede convivir con el revisor local mientras se valida, pero
no forma parte de la arquitectura final obligatoria.

## Por qué una Mac mini

Es la escala correcta para un taller de una persona: pocos PR, un bot privado y
una impresora. La memoria unificada permite ejecutar modelos mayores que los
que caben en la GPU de 8 GB de la PC actual, con poco ruido, consumo y
mantenimiento. Un clúster, Kubernetes o un servidor con varias GPU agregarían
complejidad sin aportar valor a este volumen.

Referencia de compra a julio de 2026, no pedido inmediato:

- Mac mini de clase Pro con **64 GB de memoria unificada** y SSD de **1 TB**.
- Ethernet por cable; UPS recomendable si operará todo el día.
- La generación exacta se vuelve a elegir al comprar: importa más contar con
  al menos 64 GB y buen ancho de banda de memoria que conservar un modelo/año
  específico.
- La Mac reemplazará a la PC Windows como ejecutor de impresión después de una
  prueba FTPS/MQTT real y supervisada. La PC sólo se encenderá cuando Salva
  quiera trabajar en ella o preparar archivos.

La Mac es un único punto de servicio. Si está apagada, no arrancan nuevas
impresiones, Telegram y las tareas locales esperan; los cambios de UI siguen su
curso y sólo los PR sensibles quedan en cola hasta que vuelva a encenderse. Una
impresión ya iniciada continúa dentro de la A1, pero el agente deja de reportar
hasta recuperarse; por eso la recuperación tras reinicio forma parte del corte.

## Qué corre dónde

```text
┌──────────────────┐      /api/admin/*       ┌────────────────────────┐
│ Sitio /taller    │ ◄─────────────────────► │ Worker (Hono) + D1     │
│ Astro/Hostinger  │                          │ FUENTE DE VERDAD        │
└──────────────────┘                          │ · pedidos y trabajos    │
                                              │ · eventos y métricas    │
                                              └───────────▲────────────┘
                                                │ /api/agent/* + /api/ai/*
┌──────────────────┐   PR/checks   ┌────────────┴───────────┐
│ GitHub           │ ◄───────────► │ Mac mini               │
│ PR + Actions     │                │ · Ollama o MLX-LM      │
└──────────────────┘                │ · revisor de PR         │
                                    │ · bot de Telegram       │
Telegram ◄────────────────────────► │ · métricas/scheduler    │
                                    │ · agente Bambu + 3MF    │
                                    └───────────┬────────────┘
                                                │ FTPS/MQTT por LAN
                                    ┌───────────▼────────────┐
                                    │ Bambu A1 + AMS         │
                                    └────────────────────────┘
```

- **Worker/D1:** única fuente de verdad del negocio. La Mac sólo lee, propone
  acciones por endpoints autorizados y conserva cachés reconstruibles.
- **Mac mini:** sirve los modelos, orquesta agentes, conserva los 3MF y ejecuta
  el agente actual de impresión por FTPS/MQTT. Sus servicios de IA sólo hacen
  conexiones salientes; ningún endpoint de Ollama/MLX se publica en Internet.
- **PC Windows:** estación de trabajo opcional, no servidor. Puede preparar un
  3MF y copiarlo a la carpeta compartida de la Mac; después puede apagarse.
- **Bambu A1:** sigue ejecutando cada impresión de forma autónoma una vez
  iniciada. La Mac la monitorea y reporta el resultado.
- **GitHub:** conserva CI determinista (`check`, build, typecheck, pytest y
  E2E). El revisor de IA complementa esas pruebas; nunca las sustituye.
- **/taller:** gana métricas y la bitácora de decisiones en sus fases.

## Principios que no se negocian

- **Sencillez:** una máquina, servicios pequeños y configuraciones legibles.
  Sin Kubernetes, LangChain ni una plataforma de agentes hasta que exista una
  necesidad concreta.
- **Sin mensualidad obligatoria:** modelos locales con licencia compatible y
  sin fallback cloud activado por defecto.
- **Revisión proporcional al riesgo:** un ajuste visual no debe tardar diez
  minutos por un modelo; pagos, autenticación, datos, Worker, agente y CI sí
  merecen esperar.
- **Pruebas antes que opiniones:** lint, tipos, tests y build siguen siendo los
  gates principales. Un LLM no declara correcto un cambio que rompe CI.
- **Separación de funciones:** Claude implementa y corrige; otro modelo revisa.
  El revisor no escribe código en el PR ni ejecuta código proveniente del PR.
- **Prioridad de producción:** el agente de impresión es un servicio separado y
  ligero. Una revisión de código o consulta de IA nunca debe detenerlo ni
  consumir toda la memoria disponible.
- **Privacidad estructural:** los endpoints de IA no entregan nombre, correo,
  teléfono ni dirección. No basta con pedirle al prompt que ignore la PII.
- **Auditoría:** cada decisión operativa de IA se guarda con entrada, resultado
  y explicación; siempre existe una regla determinista de respaldo.
- **Actualización prudente:** las versiones de modelos se fijan. Un modelo nuevo
  pasa la evaluación antes de reemplazar al anterior.

## Modelos y servidor de inferencia

No se fija para siempre un modelo que podría quedar obsoleto antes de comprar
la Mac. Al implementar, se compararán los modelos de código vigentes que:

- quepan en un máximo aproximado de **45–50 GB** cuantizados, dejando memoria
  para el sistema y los demás agentes;
- tengan licencia permisiva para este uso;
- funcionen de forma estable con Ollama o MLX-LM;
- acepten el contexto necesario para el diff y las instrucciones del repo;
- completen una revisión sensible en menos de diez minutos;
- superen la evaluación propia descrita abajo.

**Baseline actual para la evaluación:** Devstral Small 2 24B cuantizado. No se
elige porque sea el modelo absoluto más potente, sino porque cabe holgadamente
en una Mac de 64 GB y está especializado en código. Qwen Coder u otro modelo
que entonces quepa se probará como alternativa.

GLM-5.2 y Kimi K2.7 Code son candidatos potentes en servidores o mediante API,
pero sus pesos completos no caben en 64 GB; que sean MoE reduce el cálculo por
token, no elimina la necesidad de alojar todos sus pesos. No son candidatos
residentes para esta Mac salvo que aparezca una versión pequeña oficial que
cumpla los criterios.

Para Telegram y clasificación de intenciones puede usarse un modelo general
más pequeño y rápido, escogido con la misma regla de evaluación. El modelo de
código no tiene que atender todas las tareas.

Ollama es la primera opción por sencillez y API compatible; MLX-LM queda como
alternativa si ofrece mejor rendimiento en el hardware comprado. La API escucha
en `localhost`, donde no requiere ni debe asumir autenticación.

## Línea A — revisión local de pull requests

### A0 — integración segura, todavía sin bloquear merges

**Corre en: GitHub + Mac.** Objetivo: comparar al revisor local contra Codex
sin cambiar el flujo actual.

- Instalar el runner privado de GitHub como servicio con una etiqueta exclusiva
  (`formamx-ai`) y PR-Agent en un entorno Python fijado por versión.
- Ollama/MLX corre como servicio separado y PR-Agent lo consulta por localhost.
- El workflow recibe metadatos y el diff del PR mediante la API de GitHub. No
  hace checkout ni ejecuta scripts, Actions o código del PR en la Mac.
- Permisos mínimos: leer contenido/PR y escribir checks/comentarios. Ningún
  secreto del Worker, Stripe, Hostinger o la impresora entra al workflow.
- El resultado se publica como comentario/check informativo. Codex continúa
  con su revisión automática estándar durante la comparación.

Evaluación antes de confiar en el modelo:

- 12 PR de prueba con defectos sembrados y al menos 10 PR reales en paralelo
  con Codex.
- Debe encontrar el 100 % de los defectos preparados de seguridad, pagos y
  autenticación, y al menos 80 % del total.
- Menos de 30 % de hallazgos falsos o no accionables.
- Percentil 95 inferior a diez minutos para PR sensibles del tamaño habitual.
- Ningún secreto en prompts, logs, comentarios o artefactos.

Si ningún modelo local alcanza esos mínimos, se conserva Codex y no se activa
el gate. Comprar el hardware no obliga a aceptar una revisión inferior.

### A1 — gate basado en riesgo

**Se activa sólo después de superar A0.** Objetivo: autonomía sin retrasar los
cambios triviales.

Un clasificador determinista de rutas y archivos decide si el PR necesita al
revisor local. No se usa otro LLM para decidirlo.

Revisión local obligatoria cuando el cambio toca, entre otros:

- `workers/**`, `agent/**`, `.github/**`;
- migraciones, dependencias, lockfiles o configuración de build/deploy;
- `src/lib/**`, `src/config/**` y la lógica de `/taller`;
- autenticación, autorización, Stripe/checkout, APIs o persistencia de datos.

Documentación, assets, CSS y componentes puramente presentacionales pasan sin
esperar a la Mac. Claude puede forzar la revisión añadiendo la etiqueta
`local-ai-review-required` cuando el contexto sea sensible aunque las rutas no
lo revelen.

El workflow deja un check estable llamado `Local AI review`:

1. clasifica el PR en un runner hospedado por GitHub;
2. si es bajo riesgo, marca el check correcto inmediatamente;
3. si es sensible, encola la revisión en la Mac;
4. PR-Agent publica únicamente hallazgos concretos y accionables;
5. Claude corrige, resuelve las conversaciones y solicita otra pasada;
6. con CI y el check local verdes, Claude puede hacer squash-merge a `master`.

La regla de `master` requiere ese check, además de los checks deterministas ya
existentes. Si la Mac está apagada, sólo los PR sensibles esperan. No se crea
un marcador de SHA ni otro gate personalizado encima de éste.

Después de activarlo, Codex puede seguir como segunda opinión mientras Salva
mantenga su suscripción. Si algún día se cancela, el flujo local continúa sin
cambios.

## Línea B — asistente operativo del taller

Estas fases sustituyen el plan anterior de Raspberry Pi. Pueden avanzar después
de preparar la Mac aunque la línea A todavía esté en evaluación.

### B0 — preparación de la Mac mini y migración de la impresora

**Corre en: Mac + una transición supervisada desde Windows.** Objetivo: un solo
equipo encendido para IA y producción, recuperable y administrable.

- Crear usuario dedicado `formamx-ai`, configurar actualizaciones de seguridad
  y registrar inventario/receta de instalación en `docs/mac-mini.md`. Decidir
  FileVault conscientemente: protege el disco, pero un arranque en frío requiere
  que Salva lo desbloquee físicamente antes de que inicien los servicios.
- Instalar Tailscale sólo para administración remota, sin abrir puertos en el
  router. Ollama/MLX permanece ligado a localhost.
- Instalar runtime de Python, GitHub runner, Ollama/MLX y supervisión como
  servicios que reinicien automáticamente.
- Guardar configuración y tokens fuera del repo, con permisos sólo para el
  usuario de servicio. Respaldar únicamente configuración; los modelos se
  pueden volver a descargar.
- Registrar espacio libre, memoria, temperatura, salud de servicios, tiempos de
  inferencia y tamaño de las colas. Alertar por Telegram si un servicio falla.
- Ejecutar el `agent/` existente en macOS: su código es portable; las rutas de
  Windows y el Programador de tareas se sustituyen por rutas POSIX y un servicio
  `launchd`. No reescribir FTPS/MQTT sin que una prueba lo justifique.
- Mover los 3MF a una carpeta fuera del repo en la Mac, por ejemplo
  `/Users/formamx-ai/formamx/3mf/`, y compartirla sólo en la LAN/Tailscale para
  que Salva pueda copiar nuevos archivos desde Windows. Bambu Studio también
  puede instalarse en macOS si Salva prefiere preparar ahí los archivos.
- Antes del corte, añadir y probar recuperación de trabajo activo tras reinicio:
  persistir localmente el `job_id` en curso, consultar el estado de la A1 y
  reconciliar `printing → done/failed` sin duplicar una impresión.
- Probar primero `dry_run`, luego lectura real del AMS, subida FTPS y finalmente
  una impresión completa supervisada con el candado de cama.
- Para el corte, detener el agente de Windows, iniciar el de la Mac y confirmar
  que sólo existe un ejecutor activo. Después deshabilitar la tarea programada
  de Windows; conservar su configuración temporalmente como rollback.
- Ejecutar una inferencia pesada durante una prueba de monitoreo y confirmar que
  MQTT, progreso y keepalive no se retrasan. Limitar concurrencia/memoria del
  servidor de modelos si compiten.

**Verifica:** reiniciar la Mac, confirmar que los servicios vuelven solos, que
la inferencia responde por localhost, que nada escucha públicamente y que el
agente se reconcilia con una impresión en curso. La migración sólo se considera
terminada después de una impresión real completa y un reinicio controlado. Un
UPS es altamente recomendable antes de dejar la Mac como único ejecutor.

### B1 — Worker: token IA + outbox de eventos

**Corre en: Worker/D1.** Objetivo: puerta segura para el asistente y avisos
persistentes aunque la Mac esté apagada.

- Crear migración para `agent_events` con cursor creciente, fecha, tipo,
  `order_id`, `job_id` y `payload_json` sin PII.
- Agregar `AI_TOKEN` y una sub-app propia `/api/ai/*`; nunca compartir rutas ni
  token con `/api/admin/*` o `/api/agent/*`.
- Sustituir el aviso roto de ntfy por escrituras al outbox sólo cuando ocurre
  un evento real.
- Exponer `GET /api/ai/events?after=<id>` y `GET /api/ai/estado`, ambos sin PII.
- Mantener D1 como fuente de verdad; el cursor local de la Mac sólo es caché.

**Verifica:** migración local, typecheck, auth cruzada con los tres tokens y
pruebas del Worker. **Deploy:** migración remota → secreto → Worker.

### B2 — Telegram + notificaciones, todavía sin LLM

**Corre en: Mac.** Objetivo: avisos y consultas deterministas.

Crear `ai-server/` con un paquete Python pequeño: cliente del Worker, lector del
outbox con cursor local, bot de Telegram por long polling, allowlist de
`chat_id`, formato de eventos, configuración de ejemplo y pytest. Comandos
iniciales: `/estado`, `/cola`, `/pedidos_hoy` y `/ayuda`.

Los tokens reales viven sólo en la Mac. Telegram no requiere webhook público.
El sistema debe reintentar con backoff, no perder eventos durante un reinicio y
evitar duplicados dentro de lo razonable.

### B3 — métricas del negocio

**Corre en: Worker + `/taller` + Mac.** Objetivo: una sola lógica de métricas
sirve al panel y al asistente.

- Implementar funciones de métricas en `workers/api/src/lib/metricas.ts`.
- Exponerlas por `/api/admin/metricas/*` y `/api/ai/metricas/*`; la segunda
  forma nunca devuelve columnas `customer_*`.
- Añadir el módulo Métricas a `/taller` siguiendo
  `docs/ROADMAP_ARQUITECTURA.md`.
- Agregar comandos de Telegram sobre ventas, pedidos y producción usando esos
  endpoints, no SQL duplicado en la Mac.

### B4 — preguntas libres con modelo local

**Corre en: Mac.** Objetivo: responder preguntas como “¿cómo van las ventas
este mes contra el pasado?” sin API de pago.

- Un router simple resuelve comandos/plantillas directamente y envía sólo las
  preguntas libres al modelo general local.
- Herramientas permitidas: `get_metricas`, `get_serie`, `get_estado` y
  `get_cola`; todas llaman a `/api/ai/*`.
- El modelo recibe agregados e IDs, nunca PII ni secretos.
- Las herramientas empiezan como sólo lectura. Cualquier acción futura se
  agrega explícitamente con validaciones y bitácora.

No añadir un framework de agentes mientras este router y funciones Python sean
suficientes.

### B5 — priorización inteligente de la cola

**Corre en: Worker + Mac + `/taller`.** Objetivo: dejar FIFO ciego sin entregar
el control final a una respuesta impredecible.

- Agregar `print_jobs.priority` y `agent_decisions`; el claim del Worker ordena
  por `priority DESC, created_at`.
- La Mac calcula la prioridad con un scorer determinista y probado: terminar
  pedidos empezados, respetar antigüedad y reducir cambios de color del AMS.
- El LLM explica la decisión y puede proponer un ajuste acotado; no inventa el
  estado ni ejecuta directamente la impresión.
- `/taller` muestra la bitácora y el motivo de cada reordenamiento.
- El agente de impresión en la Mac no cambia: recibe el siguiente trabajo ya
  ordenado por el Worker.

**Deploy:** migración remota → Worker → sitio → Mac.

## Fases futuras, todavía sin diseño comprometido

1. **Inventario de bobinas:** consumo estimado y aviso de nivel bajo.
2. **Cámara de la A1:** capturar frames desde el actor que tenga acceso LAN,
   evaluar modelos de visión locales y avisar ante spaghetti/despegue. Primero
   sólo observar; pausar exige una fase separada y pruebas contra falsos
   positivos.
3. **Pausa remota:** flag en D1 que el agente de la Mac lee y ejecuta por MQTT; nunca
   acceso directo del LLM a la impresora.
4. **WhatsApp:** orientado a clientes, con borradores que Salva aprueba; Telegram
   sigue siendo la interfaz operativa privada.
5. **Auto-dispatch:** políticas explícitas y apagadas por defecto, reusando la
   lógica existente de trabajos.
6. **Separar nuevamente el ejecutor:** sólo si las cargas de IA afectan de forma
   medible la confiabilidad de impresión; no mantener dos equipos por defecto.

## Verificación y operación por fase

- Ejecutar únicamente los checks aplicables definidos en `AGENTS.md`.
- Probar migraciones en D1 local antes de cualquier migración remota.
- Nunca usar pedidos reales, PII, secretos ni archivos 3MF en pruebas.
- Medir calidad y latencia; no asumir que un benchmark público representa los
  PR o las preguntas de forma.
- Documentar instalación, rollback y recuperación antes de dejar un servicio
  como obligatorio.
- Desplegar en orden: migración remota → Worker → sitio → Mac.
- Una fase por PR, squash a `master`; `master` sigue siendo producción.

## Señales para cambiar de arquitectura

Mantener una sola Mac mientras atienda cómodamente el volumen. Reevaluar Linux
con GPU, una segunda máquina o una cola más compleja sólo si ocurre alguno:

- varias revisiones o tareas compiten diariamente por memoria y tardan más de
  diez minutos de forma habitual;
- la indisponibilidad de una sola máquina afecta ventas u operación crítica;
- los modelos necesarios dejan de caber en memoria;
- se incorporan más repositorios, usuarios o impresoras;
- monitoreo de video continuo exige aceleración independiente.

Si la IA crece pero la impresión sigue siendo ligera, la primera separación
razonable sería mover sólo la inferencia pesada a otra máquina y conservar el
agente Bambu en la Mac estable, no volver a depender de la PC de trabajo.

Hasta entonces, la Mac mini dedicada es la solución deliberadamente sencilla
y proporcionada para forma.

## Referencias de implementación

- [GitHub: self-hosted runners](https://docs.github.com/en/actions/reference/runners/self-hosted-runners)
- [PR-Agent: GitHub con Ollama local](https://docs.pr-agent.ai/installation/github/)
- [Ollama: API compatible con OpenAI](https://docs.ollama.com/api/openai-compatibility)
- [Apple: agentes locales con MLX](https://developer.apple.com/videos/play/wwdc2026/232/)
- [Bambu Studio: versiones oficiales para macOS](https://github.com/bambulab/BambuStudio/releases)
