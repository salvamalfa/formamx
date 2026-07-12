# forma — formamx.com

Taller de proyectos de una persona: bancas, lámparas, videos, música. Cada
pieza se hace una vez. No es una tienda ni un portafolio: es documentación
honesta del proceso — la venta existe, pero es consecuencia de la historia.

Este repo contiene el sitio completo y el pipeline **compra → taller →
impresión 3D automática**: alguien configura su lámpara y paga; el pedido cae
al dashboard del taller; al despacharlo, un agente local manda cada pieza a
la Bambu Lab A1 con los filamentos correctos del AMS.

## Estructura

| Carpeta | Qué es |
| --- | --- |
| `src/` | Sitio Astro 6 (Preact + Tailwind 4): bitácora, configurador de lámparas, `/taller` (dashboard privado) |
| `workers/api/` | Backend en Cloudflare Workers + D1: checkout Stripe, webhook, cola de pedidos y trabajos de impresión ([README](workers/api/README.md)) |
| `agent/` | Agente Python que corre junto a la impresora: FTPS + MQTT a la A1, sincronización del AMS ([README](agent/README.md)) |
| `ds-bundle/` | Design system de forma: tokens, voz de marca, componentes |
| `docs/` | Documentación por área: impresión 3D, agente de IA, roadmap de arquitectura (ERP/MES por módulos) |
| `CLAUDE.md` | Contexto operativo para sesiones de Claude Code |

## Comandos

```sh
npm install && npm run dev      # sitio en localhost:4321
npm run build                   # build estático (deploy: merge a master)
npm run test:e2e                # suite Playwright
```

El backend y el agente tienen sus propios README con la puesta en marcha.
