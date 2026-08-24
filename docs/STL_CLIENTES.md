# Impresión de STL de clientes — plan por fases

Plan para aceptar archivos STL que mandan los clientes, rebanarlos
automáticamente y mandarlos a la Bambu A1 desde /taller, sin pasar por Bambu
Studio a mano. Léelo completo antes de implementar cualquier fase.

**Estado: las 4 fases implementadas (agosto 2026); falta el smoke test real con
la impresora.** La prueba de concepto del CLI se hizo en Linux con Bambu Studio
02.08.02.61 en modo línea de comandos, sin interfaz gráfica: STL → `.gcode.3mf`
con el arranque real de la A1, temperaturas correctas y estimación de
tiempo/gramos. La receta exacta está abajo y es la referencia para la fase 2.

**Validado de punta a punta en producción** (Salva, PC del taller, Bambu
Studio 02.07.00.55): subió un colador real por /taller, el agente lo rebanó
solo (1 h 16 min, 30.45 g, con soportes) y la vista del plato se vio bien. Lo
único que falló fue la CSP del sitio: `img-src` no incluía `blob:`, que es
como se sirve la vista previa (va autenticada, no puede ser un `<img src>`
normal). Corregido agregando `blob:` a `img-src` en `astro.config.mjs`
(`security.csp.directives`). Falta el clic de **Imprimir** con la impresora
encendida — eso es el smoke test que sigue pendiente.

Decisiones tomadas con Salva al arrancar la implementación:

- **Placa**: PEI texturizada (fija en el perfil aplanado, constante `BED_TYPE`).
- **Calidad**: solo `0.20mm Standard` por ahora; agregar borrador/fino después
  es aplanar otro process.
- **Colores**: solo los del catálogo de lámparas (el `color_id` que ya resuelve
  el AMS). Un filamento negro o gris no es seleccionable hasta ampliar el
  catálogo.
- **Soportes y orientación** son opciones por pieza (`supports`: `auto|no`,
  `orient`: `auto|original`), porque Salva hoy acuesta las piezas a mano y
  activa soportes. `--orient 1` reproduce el "Auto orientar" de Bambu Studio
  (evalúa 18 orientaciones por voladizo y área de contacto); `original` respeta
  la orientación del STL.
- **Vista del rebanado**: /taller muestra la miniatura sombreada que Bambu
  Studio incrusta en el 3MF — la misma que se ve en su interfaz y en la
  pantalla de la impresora. Confirmada en la PC del taller con Bambu Studio
  02.07.00.55. Nunca con `--export-png`, que rompe el rebanado entero (maña 5).
  Necesita sesión gráfica al rebanar; para una máquina sin pantalla hay un
  dibujante desde G-code listo en `agent/apendice/`, fuera de producción.

## El flujo terminado

1. Un cliente manda un STL. Salva entra a /taller → Proyectos → Impresora y
   pulsa **Importar STL**; el archivo sube al Worker y se guarda en R2.
2. Salva elige material y color (de las bobinas presentes en el AMS), decide
   soportes y orientación, y pulsa **Rebanar**. La pieza entra a la cola de
   rebanado.
3. El agente (PC de Salva hoy; Mac mini cuando exista, ver `docs/AGENTE_IA.md`
   B0) reclama la pieza, descarga el STL, corre el CLI de Bambu Studio y
   reporta tiempo estimado, gramos y éxito/error, más un PNG del plato. El
   `.gcode.3mf` queda en el `files_dir` local del agente.
4. Salva revisa el estimado y la vista previa en /taller y pulsa **Imprimir**.
   Desde ahí todo es el pipeline existente: claim, ams_mapping, FTPS, MQTT,
   candado de cama.

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
5. **JAMÁS pasar `--export-png`.** Basta con incluirla —con cualquier valor,
   sola o junto a `--export-3mf`— para que el CLI conteste
   `return_code: -2, "Invalid parameters to the slicer."` y **no rebane nada**.
   La vista se saca de dentro del propio 3MF (`Metadata/plate_*.png`,
   excluyendo `pick`/`top`, que son auxiliares del visor, y prefiriendo
   `plate_1.png` sobre `plate_1_small.png`). **Esas miniaturas solo existen si
   la máquina tuvo sesión gráfica al rebanar**: en la PC del taller existen
   (confirmado con Bambu Studio 02.07.00.55, distinta a la 02.08.02.61 con la
   que se validó la receta — el comando funcionó igual). Sin pantalla el 3MF
   viene sin ellas y la pieza se revisa solo con los estimados; para ese caso
   hay un dibujante desde G-code listo en `agent/apendice/`, documentado y
   probado pero fuera del camino de producción: se prefirió el render
   sombreado de Bambu por verse mejor.
6. **Soportes**: encender `enable_support = '1'` en una copia temporal del
   process (no tocar el perfil generado). El tipo y el ángulo ya vienen bien
   del perfil de Bambu (`tree(auto)` a 30°), que es exactamente lo que se
   activa a mano en la interfaz — no hay que inventarlos.
7. **Orientación**: `--orient 1` reproduce el "Auto orientar" de la interfaz
   (evalúa 18 orientaciones por voladizo, área de contacto e imprimibilidad);
   `--orient 0` respeta la del archivo. Medido con una torre de 8×8×120 mm:
   de pie 4055 s, auto-orientada 550 s — el rebanador la acuesta solo.
8. El nombre de salida sigue la convención del taller: material explícito
   (`pieza.pla.gcode.3mf`, `pieza.petg.gcode.3mf`), ver
   `docs/IMPRESION_3D.md`.

Perfiles iniciales: `Bambu Lab A1 0.4 nozzle` + `0.20mm Standard @BBL A1` +
filamento según material (`Bambu PLA Basic @BBL A1`, `Bambu PETG Basic…`).
Calidades adicionales (0.28mm borrador, 0.12mm fino) se agregan aplanando el
process correspondiente; no inventar perfiles propios.

## Fases (cada una un PR pequeño y desplegable)

### Fase 1 — Worker: R2 + modelo de datos ✅ HECHA

**Corre en: Worker/D1.** Sin UI todavía. Migración `0016_custom_prints.sql`,
lógica en `lib/custom_prints.ts`, rutas en `routes/admin/custom_prints.ts` y
`routes/agent.ts`; binding `STL_BUCKET` en `wrangler.toml` y `env.ts`.

Grafo real implementado (con un estado más que el boceto original):

```
subido → en_cola → rebanando → listo → imprimiendo → terminado
                        ↓         ↑ (fallo de impresión: el 3MF sigue estando)
                     fallido ──────┘ (reintentar rebanado)
```

`en_cola` existe para que el agente distinga "me pidieron rebanar" de "ya lo
reclamé", igual que `queued`/`claimed` en `print_jobs`. **`fallido` significa
siempre "el rebanado no dejó archivo"**: un fallo de IMPRESIÓN devuelve la
pieza a `listo`, así el gate de Imprimir es simplemente `status === 'listo'`.

Decisiones de implementación que conviene no re-litigar:

- **Sin tabla de trabajos de rebanado**: el claim atómico va directo sobre
  `custom_prints` (mismo `UPDATE … WHERE id = (SELECT … LIMIT 1) RETURNING *`
  de `routes/agent.ts`), con reencolado de claims muertos a los
  `SLICE_STALE_MINUTES = 30` (rebanar tarda más que arrancar una impresión;
  los 15 de `print_jobs` reencolarían trabajos vivos).
- **El claim de rebanado NO mira el candado de cama**: rebanar no toca la
  impresora, así que se puede preparar trabajo con una pieza en la cama.
- **Subida como cuerpo binario crudo** (`?filename=`, no multipart): permite
  `STL_BUCKET.put(key, c.req.raw.body)` en streaming. R2 necesita el tamaño de
  antemano, así que `Content-Length` es obligatorio (411 sin él) y sirve para
  rechazar lo enorme antes de escribir nada (100 MB, el tope de cuerpo de
  petición del plan gratuito de Workers).
- **El STL viaja al agente por endpoint autenticado** con el `AGENT_TOKEN` que
  ya existe, no por URL firmada: no hay llaves S3 de R2 que rotar.
- **Borrar va en tres pasos** — la fila pasa a `borrado` con un UPDATE guardado
  por estado, se limpian los objetos de R2, y recién entonces desaparece la
  fila. El primer paso cierra una carrera (si alguien encolaba la pieza para
  rebanar entre la lectura y el borrado, se borraba el STL de una pieza recién
  encolada y las dos peticiones reportaban éxito). El estado `borrado` es la
  lápida: si R2 falla, la fila se queda ahí — es la única pista de qué archivos
  limpiar — la respuesta es 503 `limpieza_pendiente` y repetir el borrado
  reintenta. Nunca se reporta éxito con el STL del cliente todavía guardado.
  El preview se borra siempre por su clave determinista, porque su bandera pudo
  quedar en 0 tras un re-rebanado fallido.

**Verificado:** typecheck, migración local y ciclo completo contra
`wrangler dev` con R2 local — subida (el STL regresa byte a byte idéntico),
auth cruzada admin/agente 401 en ambos sentidos, rechazo real de un archivo de
101 MB, claim atómico y 204 con la cola vacía, reporte de éxito y de fallo,
reintento desde `fallido`, subida y descarga del preview, y borrado que deja
el STL inaccesible.
**Deploy:** activar R2 en la cuenta (paso manual de Salva) →
`npx wrangler r2 bucket create formamx-stl` → migración remota → worker.

### Fase 2 — Agente: rebanado CLI ✅ HECHA

**Corre en: agent/ (PC Windows).** `flatten_profiles.py` (aplanador),
`slicer.py` (invocación y lectura del `result.json`), métodos nuevos en
`api.py` y `slice_loop` en `__main__.py`. Sección `[slicer]` **opcional** en el
config: sin ella el agente solo imprime, así que una máquina sin Bambu Studio
sigue sirviendo.

- El rebanado corre en **su propio hilo**, no en el bucle de impresión.
  `process_job` se queda dentro de una impresión durante horas y rebanar no
  toca la impresora: una pieza recién subida no tiene por qué esperar a que
  termine una lámpara. El trabajo pesado lo hace un subproceso (el CLI), así
  que no compite por el GIL con el reporte de progreso ni con el keepalive de
  MQTT. Cada hilo tiene su propia `TallerApi`: `requests.Session` no es segura
  entre hilos.
- Un 409 al reportar el resultado NO es error: significa que la pieza se
  canceló mientras se rebanaba. Se anota y se sigue.
- Los 3MF de cliente van a `<files_dir>/clientes/<id>.<material>.gcode.3mf`,
  que `pick_file` ya sabe resolver (soporta subcarpetas y tiene contención
  anti-traversal), así que la fase 4 no necesita tocar `mapping.py`.

**Verificado** con Bambu Studio 02.08.02.61 real (Linux, mismo motor que la
versión de Windows): 30 pruebas de pytest, y sobre todo una integración de
punta a punta corriendo `slice_loop` de verdad contra `wrangler dev` — subir
dos STL por la API, que el agente los reclame, se baje el STL de R2, los rebane
y reporte. Números medidos que confirman que las opciones sí llegan al
rebanador:

| pieza | opciones | resultado |
| --- | --- | --- |
| T con voladizo de 20 mm | PLA, sin soportes | 1626 s, 3.93 g |
| la misma | PLA, soportes automáticos | 1986 s, **5.59 g** (el extra es el soporte) |
| torre 8×8×120 mm | orientación del archivo | 4055 s |
| la misma | orientación automática | **550 s** (el rebanador la acuesta) |

**Hecho en la PC de Salva** (comandos en `agent/README.md`): corrió
`flatten_profiles` contra su instalación (Bambu Studio 02.07.00.55, distinta a
la 02.08.02.61 con la que se validó la receta — el comando funcionó igual sin
tocar nada) y rebanó un STL real de cliente de punta a punta.

### Fase 3 — /taller: la UI ✅ HECHA

**Corre en: sitio.** Cambio de producto: demo con capturas a Salva ANTES de
abrir el PR (regla de `CLAUDE.md`).

- En Proyectos → Impresora: botón **Importar STL**, subida con progreso,
  lista de piezas de cliente con estado.
- Selector de material/color alimentado por el estado del AMS ya sincronizado
  (solo bobinas presentes; mismo emparejado de color de `lib/catalog.ts`), más
  los interruptores de soportes (automáticos / sin soportes) y orientación
  (automática / como viene el archivo).
- Tarjeta de resultado: vista previa del plato, tiempo estimado, gramos, error
  legible si la malla no sirvió, botones Rebanar de nuevo / Cancelar /
  Imprimir.
- Playwright con API mockeada, siguiendo `tests/e2e/taller.spec.ts`.

### Fase 4 — Imprimir de verdad ✅ HECHA (falta el smoke test real)

**Corre en: Worker + sitio.** El agente **no cambió ni una línea**: una pieza de
cliente entra a la MISMA cola que las lámparas, así que hereda claim atómico,
ams_mapping, candado de cama y reencolado sin duplicar nada.

- Migración **0017**: reconstruye `print_jobs` con `order_id` NULL-able (una
  pieza de cliente no viene de un pedido) y `custom_print_id`. Es la única
  migración del plan sobre datos vivos, así que preserva las filas con
  `INSERT … SELECT` (la 0004 pudo hacer DROP porque sus datos eran de prueba).
  El índice único de la 0010 se recrea **parcial** (`WHERE order_id IS NOT
  NULL`): sin eso, dos piezas de cliente —ambas con `order_id` NULL y part
  `cliente`— chocarían entre sí.

  **Trampa para la próxima reconstrucción de `print_jobs`** (la 0017 la esquivó
  por suerte, no por diseño): otras tablas la referencian por clave foránea y
  con filas dependientes el `DROP TABLE` falla con
  `FOREIGN KEY constraint failed`, dejando la migración a medias. La 0017 pasó
  porque su único dependiente vivo, `piezas.print_job_id`, está vacío en
  producción (`qc_registros` tenía otra referencia, pero la 0015 dio de baja
  esa tabla). Quien reconstruya `print_jobs` otra vez tiene que **listar los
  dependientes de ese momento** —no fiarse de esta lista, que envejece— y
  vaciarlos o preservarlos, no solo copiar sus propias filas.
- `POST /api/admin/custom-prints/:id/imprimir`: inserta el trabajo y mueve el
  estado en un `db.batch` (una transacción), las dos sentencias guardadas por
  `status = 'listo'`. `file_key = 'clientes/<id>'` y `colors_json` con el color
  elegido — ambos formatos que `mapping.py` ya resolvía.
- `POST /api/agent/jobs/:id/status` espeja el desenlace en la pieza cuando el
  trabajo trae `custom_print_id`. Un fallo de impresión la devuelve a `listo`
  (no a `fallido`): el `.gcode.3mf` sigue existiendo, así que se reimprime sin
  volver a rebanar.

**Verificado** contra `wrangler dev`: migración aplicada sobre un trabajo real
preexistente que sobrevivió intacto; y el ciclo completo — rebanar → imprimir →
segundo imprimir 409 → el agente reclama de la misma cola (`part='cliente'`,
`order_id` nulo) → progreso espejado → fallo que devuelve a `listo` con el
motivo y activa el candado de cama → reimpresión sin re-rebanar → `terminado` →
409 al intentar reimprimir. Los pedidos de lámpara siguen intactos. 61 pruebas
e2e y 31 de pytest en verde.

**Pendiente:** smoke test REAL con Salva junto a la impresora (regla de la casa
para todo lo que toca la impresora): primera pieza de cliente completa y
supervisada, verificando el candado de cama al final.

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
