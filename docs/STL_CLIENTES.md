# Impresión de STL de clientes — plan por fases

Plan para aceptar archivos STL que mandan los clientes, rebanarlos
automáticamente y mandarlos a la Bambu A1 desde /taller, sin pasar por Bambu
Studio a mano. Léelo completo antes de implementar cualquier fase.

**Estado: prueba de concepto del CLI superada (agosto 2026); ninguna fase
implementada.** La prueba se hizo en Linux con Bambu Studio 02.08.02.61 en modo
línea de comandos, sin interfaz gráfica: STL → `.gcode.3mf` con el arranque real
de la A1, temperaturas correctas y estimación de tiempo/gramos. La receta exacta
está abajo y es la referencia para la fase 2.

## El flujo terminado

1. Un cliente manda un STL. Salva entra a /taller → Proyectos → Impresora y
   pulsa **Importar STL**; el archivo sube al Worker y se guarda en R2.
2. Salva elige material, color (de las bobinas presentes en el AMS) y calidad,
   y pulsa **Rebanar**. Se crea un trabajo de rebanado.
3. El agente (PC de Salva hoy; Mac mini cuando exista, ver `docs/AGENTE_IA.md`
   B0) reclama el trabajo, descarga el STL, corre el CLI de Bambu Studio y
   reporta tiempo estimado, gramos y éxito/error. El `.gcode.3mf` queda en el
   `files_dir` local del agente.
4. Salva revisa el estimado en /taller y pulsa **Imprimir**. Desde ahí todo es
   el pipeline existente: claim, ams_mapping, FTPS, MQTT, candado de cama.

Reglas que no cambian: el gate humano se conserva (nada se imprime sin el clic
de Salva tras ver el estimado); los STL y 3MF jamás entran al repo; el candado
de cama y el flujo de trabajos de `docs/IMPRESION_3D.md` mandan.

## Costo

R2 a este volumen es $0: capa gratuita de 10 GB almacenados, 1 M escrituras y
10 M lecturas al mes, sin costo de salida. Un STL de lámpara pesa 5–50 MB;
haría falta acumular ~300 sin borrar para pagar algo (y entonces serían
~$0.015 USD por GB extra al mes). Activar R2 en el dashboard de Cloudflare es
un paso manual de Salva y puede pedir tarjeta registrada aunque no cobre.

## Receta CLI validada (base de la fase 2)

Comando (mismo binario en Windows/macOS/Linux; en Windows es
`"C:\Program Files\Bambu Studio\bambu-studio.exe"` y la salida de consola no
se ve — leer siempre `result.json`, no stdout):

```sh
bambu-studio \
  --load-settings "machine_a1_04.json;process_020_standard_a1.json" \
  --load-filaments "filament_pla_basic_a1.json" \
  --slice 0 --arrange 1 --orient 1 --ensure-on-bed \
  --export-3mf pieza.pla.gcode.3mf --outputdir out pieza.stl
```

Mañas descubiertas en la prueba, todas obligatorias:

1. **Aplanar los perfiles.** El CLI NO resuelve `inherits`: pasarle los JSON de
   `resources/profiles/BBL/` tal cual produce valores por defecto silenciosos
   (cama a 35 °C, densidad 0, peso 0 g). Hay que fusionar la cadena de
   herencia (hijo pisa a padre, quitar `inherits`) en un JSON autónomo por
   perfil. El aplanador es ~20 líneas de Python y debe vivir en `agent/` con
   tests; se corre contra los `resources/profiles` de la instalación local.
2. **Fusionar los templates de G-code de la máquina.** El start/end/change
   G-code real de la A1 vive en archivos aparte
   (`Bambu Lab A1 0.4 nozzle template machine_start_gcode.json`, etc.); sin
   fusionar sus claves `*_gcode` al perfil aplanado, el 3MF sale con un
   arranque genérico SIN la secuencia real de la A1 (M970/M1002, escalonado
   140→temp de impresión). Verificación rápida: el gcode debe contener M970.
3. **Fijar `curr_bed_type`.** Por defecto rebana para Cool Plate (cama 35 °C).
   Poner `"curr_bed_type": "Textured PEI Plate"` en el process aplanado (o el
   tipo de placa que Salva use).
4. **Leer `result.json` del outputdir**: `return_code`/`error_string`, tiempo
   (`main_predication`, segundos), gramos (`filaments[].total_used_g`) y bbox
   por objeto. Es la interfaz robusta para el agente; el exit code y stdout no
   lo son.
5. **Miniaturas**: sin pantalla, glfw falla al renderizar las imágenes de
   plato pero el rebanado y el 3MF salen completos (el error es tolerable).
   En Linux/macOS sin sesión gráfica, `xvfb-run` (Linux) lo silencia; en la PC
   Windows de Salva hay sesión gráfica y no aplica.
6. El nombre de salida sigue la convención del taller: material explícito
   (`pieza.pla.gcode.3mf`, `pieza.petg.gcode.3mf`), ver
   `docs/IMPRESION_3D.md`.

Perfiles iniciales: `Bambu Lab A1 0.4 nozzle` + `0.20mm Standard @BBL A1` +
filamento según material (`Bambu PLA Basic @BBL A1`, `Bambu PETG Basic…`).
Calidades adicionales (0.28mm borrador, 0.12mm fino) se agregan aplanando el
process correspondiente; no inventar perfiles propios.

## Fases (cada una un PR pequeño y desplegable)

### Fase 1 — Worker: R2 + modelo de datos

**Corre en: Worker/D1.** Sin UI todavía.

- Bucket R2 (binding `STL_BUCKET`) y migración D1 para `custom_prints`:
  id, nombre original, clave R2, tamaño, material, color (hex + nombre de
  catálogo si empareja), calidad, estado
  (`subido → rebanando → listo → imprimiendo → terminado`, +`fallido` con
  motivo, +`cancelado`), estimados (segundos, gramos), fechas. Enums sin
  CHECK, numeración de migración a 4 dígitos.
- Rutas admin (`/api/admin/custom-prints`): subir STL (streaming a R2, límite
  de tamaño explícito ~100 MB), listar, cambiar estado, cancelar, borrar
  (borra también el objeto R2).
- Rutas agente (`/api/agent/…`): claim de trabajos de rebanado (mismo patrón
  atómico de `lib/jobs.ts`), descarga del STL, reporte de resultado con
  estimados o error.
- El STL nunca pasa por D1; D1 guarda solo metadatos y la clave R2.

**Verifica:** typecheck del worker, migración local, auth cruzada
admin/agente, wrangler dev con R2 local.
**Deploy:** activar R2 en la cuenta (paso manual de Salva) → migración remota
→ worker.

### Fase 2 — Agente: rebanado CLI

**Corre en: agent/ (PC Windows).**

- `slicer.py`: localizar el ejecutable de Bambu Studio (ruta en
  `config.toml`), invocar el CLI con la receta de arriba, timeout generoso,
  parsear `result.json` y dejar el `.gcode.3mf` en `files_dir` con el material
  en el nombre.
- `flatten_profiles.py`: aplanador de perfiles (herencia + templates +
  `curr_bed_type`) que genera los JSON a partir de la instalación local de
  Bambu Studio; los JSON generados se guardan junto al config del agente,
  fuera del repo.
- Bucle nuevo en el agente: reclamar trabajo de rebanado → descargar STL →
  validar (que quepa en 256×256×256 mm, malla legible) → rebanar → reportar.
  El rebanado no bloquea el bucle de impresión existente.
- pytest con `result.json` de muestra y el aplanador; el CLI real se prueba a
  mano en la PC de Salva con un STL de verdad (PowerShell exacto en el PR).

### Fase 3 — /taller: la UI

**Corre en: sitio.** Cambio de producto: demo con capturas a Salva ANTES de
abrir el PR (regla de `CLAUDE.md`).

- En Proyectos → Impresora: botón **Importar STL**, subida con progreso,
  lista de piezas de cliente con estado.
- Selector de material/color alimentado por el estado del AMS ya sincronizado
  (solo bobinas presentes; mismo emparejado de color de `lib/catalog.ts`) y
  selector de calidad.
- Tarjeta de resultado: tiempo estimado, gramos, error legible si la malla no
  sirvió, botones Rebanar de nuevo / Cancelar / Imprimir.
- Playwright con API mockeada, siguiendo `tests/e2e/taller.spec.ts`.

### Fase 4 — Imprimir de verdad

**Corre en: Worker + agente.**

- Al pulsar Imprimir, crear un trabajo del pipeline existente que apunte al
  `.gcode.3mf` rebanado (el agente ya lo tiene local); ams_mapping, candado de
  cama y estados de `docs/IMPRESION_3D.md` sin cambios.
- Smoke test REAL con Salva junto a la impresora (regla de la casa para todo
  lo que toca `printer.py`): primera pieza de cliente completa y supervisada.

### Después (sin diseño comprometido)

- Entrada por Telegram: cuando exista el bot de la fase B2 de
  `docs/AGENTE_IA.md`, reusar el endpoint de subida de la fase 1; no
  construir un bot solo para esto.
- Mover el rebanado a la Mac mini junto con el agente (fase B0): el CLI es el
  mismo binario en macOS.

## Verificación general

- Nunca STL/3MF reales en el repo ni en tests; usar un cubo generado.
- `cd workers/api && npm run typecheck`, `cd agent && python3 -m pytest`,
  Playwright de /taller.
- Deploy en el orden de siempre: migración remota → worker → merge del sitio.
