---
paths:
  - "workers/api/migrations/**"
  - "workers/api/src/routes/**"
  - "workers/api/src/lib/orders.ts"
  - "workers/api/src/lib/jobs.ts"
  - "workers/api/src/lib/auth.ts"
  - "workers/api/src/index.ts"
  - "workers/api/wrangler.toml"
  - "src/components/taller/**"
---

# Mantener el mapa de arquitectura

Estás tocando archivos que pueden dejar mintiendo a `docs/ARQUITECTURA.md`, el
retrato de lo que existe hoy. Solo sirve si no miente: se actualiza **en el
mismo PR** que introduce el cambio, nunca después ni en un PR aparte.

Actualízalo cuando el PR haga alguno de estos, y solo entonces:

- Agrega, quita o renombra una **tabla de D1**, o cambia una relación entre
  tablas (§3 y el diagrama ER).
- Agrega un **módulo a /taller** o un grupo de rutas nuevo en el Worker
  (§1 y §4).
- Cambia el **grafo de estados** de un pedido o de un trabajo de impresión (§2).
- Suma o quita una **pieza del sistema** o un servicio externo (§1 y §5): otro
  binding de Cloudflare, otra máquina, otro proveedor de pago.
- Cambia una **frontera de seguridad**: quién puede llamar qué, con qué token
  (§5).
- Implementa algo que §6 listaba como pendiente — entonces se mueve de §6 al
  cuerpo del documento.

NO lo toques por columnas nuevas en una tabla que ya está descrita, cambios de
UI o copy, refactors internos, dependencias, tests ni CI. Un diagrama que se
mueve en cada PR deja de leerse.

Al editarlo: los diagramas son Mermaid en bloques ` ```mermaid `; verifica que
siguen siendo válidos antes de subir (`npx -y @mermaid-js/mermaid-cli`, con
`--no-sandbox` vía `-p` en la nube). Español llano, sin jerga innecesaria: el
lector es Salva, que conoce de programación pero no vive en este código.
