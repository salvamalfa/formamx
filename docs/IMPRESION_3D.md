# Proyecto de impresión 3D — configurador, taller y agente

Documento de referencia del pipeline **compra → impresión** de las lámparas.
Léelo completo antes de tocar el configurador, la sección "Impresión 3D" de
/taller, la cola de trabajos o el agente. (forma es más que impresión 3D:
este documento cubre SOLO este proyecto.)

## El pipeline, de punta a punta (ya opera en producción)

1. El comprador configura su lámpara en `/lampara` (5 modelos de pantalla ×
   6 colores de pantalla × 6 de tapa; cuerpo siempre blanco) y paga con
   Stripe.
2. El webhook registra el pedido; aparece en `/taller` → sección
   "Impresión 3D" con preview, chips de filamento y datos de envío.
3. Salva lo pasa a "En cola" y pulsa **Imprimir** → se crean **3 trabajos**
   (pantalla, cuerpo, tapa), cada uno una impresión independiente.
4. El **agente** (PC Windows de Salva, misma LAN que la Bambu A1) reclama un
   trabajo, sube el archivo a la impresora y arranca la impresión con el
   filamento correcto del AMS. Reporta progreso real al dashboard.
5. Tras CADA pieza: candado de cama — Salva retira la pieza y confirma
   "Cama despejada" en /taller antes de que arranque la siguiente.
6. Con las 3 piezas listas, Salva inspecciona y marca el pedido "Lista"
   (gate humano deliberado; el agente nunca lo hace).

## Fuente de verdad y archivos clave

| Qué | Dónde |
| --- | --- |
| Catálogo de modelos/colores (única fuente de verdad) | `src/config/lamps.ts` — la importan configurador, Worker y dashboard |
| Configurador público | `src/components/LampConfigurator.tsx` + `src/pages/lampara.astro` |
| Dashboard del taller | `src/components/taller/` (shell + módulos; ver `docs/ROADMAP_ARQUITECTURA.md`) |
| API de pedidos/trabajos | `workers/api/src/routes/admin/` y `routes/agent.ts`; lógica en `lib/jobs.ts` (`createJobsForOrder`), `lib/orders.ts` (grafo), `lib/catalog.ts` (validación + match de color hex) |
| Agente | `agent/formamx_agent/` (`printer.py` = FTPS/MQTT; `mapping.py` = ams_mapping y elección de archivo) |

## Reglas duras del dominio

- **Una lámpara = 3 impresiones separadas** (pantalla en su color, cuerpo
  blanco, tapa en su color), un filamento por pieza.
- **El material va explícito en el nombre del archivo** —
  `tessera.petg.gcode.3mf`, `cuerpo.pla.gcode.3mf` — sin genéricos: el
  G-code fija temperaturas al rebanar, un archivo sin material es ambiguo.
  El agente elige el archivo según el **material de la ranura mapeada**.
- Los 3MF rebanados viven SOLO en la PC de Salva (`C:\formamx\3mf\
  {pantalla|cuerpo|tapa}\`). Jamás subir STL/3MF al repo: son binarios
  pesados y no son código (la regla nació cuando el repo era público y se
  mantiene ahora que es privado).
  Hoy solo existe el modelo **Tessera**; los otros 4 (diamond, fluted,
  rhombus, torsion) se agregan cuando Salva los rebane.
- **El AMS de la impresora dicta el estado**: el agente lo lee cada 5 min
  (también en dry_run) y el panel de /taller es SOLO lectura — muestra hex
  crudo, color de catálogo emparejado y material. El match de color trata
  los neutros por croma (gris/negro quedan sin asignar; solo un neutro
  claro es blanco).
- **ams_mapping**: índice = número de filamento del 3MF (0-based), valor =
  ranura 0-3 del AMS. Se calcula en el claim con las bobinas frescas; si
  falta un color, el trabajo falla ANTES de tocar la impresora.
- **Candado de cama** (`printer_flags.bed_clear`): tras cada impresión real
  (terminada o fallida a medias) no se entregan más trabajos hasta confirmar
  en /taller. La A1 no sabe si retiraste la pieza; sin esto imprimiría
  encima de la anterior.
- Trabajos: `queued → claimed → printing → done` (+`failed` con motivo y
  botón Reintentar, +`canceled`). Un claim sin avance se reencola solo a
  los 15 min (agente muerto a media preparación).

## La Bambu A1 por LAN — quirks ganados con sangre (`agent/printer.py`)

Requiere Modo desarrollador/LAN activado (los updates de firmware pueden
apagarlo — primera sospecha si el agente "no ve" la impresora). Usuario
`bblp`, contraseña = access code. Cert autofirmado (sin verificación de
cadena; es LAN propia).

1. **FTPS implícito** (:990): TLS desde antes del banner (subclase de
   `FTP_TLS` con el setter de `sock`).
2. **Reusar la sesión TLS del canal de control en el canal de datos**
   (override de `ntransfercmd` con `session=self.sock.session`) — sin esto
   la subida cuelga con "read operation timed out".
3. **NO hacer `unwrap()` al cerrar la subida** (override de `storbinary`
   que termina con `voidresp()`): la Bambu nunca contesta el close_notify
   y ftplib se cuelga esperándolo, aunque el archivo ya se transfirió.
4. MQTT (:8883): comando `project_file` con `url: file:///sdcard/model.3mf`
   y `ams_mapping`; monitoreo por `mc_percent` (progreso, reportar throttled
   cada ≥5%) y `gcode_state` (FINISH/FAILED). `pushall` para leer estado y
   AMS (`print.ams.ams[0].tray[]`: `tray_type`, `tray_color` RGBA).
5. El agente no reclama si `gcode_state == RUNNING` (algo lanzado a mano).

## Config del agente (PC de Salva, nunca al repo)

`C:\formamx\config.toml`: api_base, agent_token, files_dir, dry_run,
`[printer]` ip/serial/access_code. El **modo ensayo** (`dry_run = true`)
simula las impresiones pero SÍ lee el AMS real — sirve para probar el
circuito completo sin filamento. Log en `C:\formamx\agent.log`.

## Verificación al tocar este proyecto

- `cd agent && python3 -m pytest tests/` (mapping + regresiones del FTPS).
- Playwright de /taller con API mockeada (`tests/e2e/taller.spec.ts`).
- Worker contra `wrangler dev` + `migrate:local` (claim atómico, dispatch,
  candado de cama, sync del AMS con hex).
- Cambios del agente que toquen `printer.py`: smoke test REAL con Salva
  junto a la impresora — los quirks de la Bambu no se pueden simular.
