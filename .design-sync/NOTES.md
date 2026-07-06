# design-sync — notas

- **Fuente de verdad: `ds-bundle/` en este repo** (versionado en git desde 2026-07-06). El zip original (`C:\Users\salva\Desktop\FORMA\Brand Kit\Forma - Brand Kit.zip`) es solo el respaldo histórico del import inicial — export prearmado de un proyecto de Claude Design (no es un repo compilable; shape `prebuilt-export`, fuera del converter).
- **Flujo bidireccional (pull-before-push), obligatorio en cada sync:** (1) `list_files` + `get_file` de los archivos de texto remotos y diff contra `ds-bundle/`; (2) cambios remotos que no existan localmente se commitean a `ds-bundle/` primero (conflicto real local↔remoto → preguntar al usuario); (3) solo entonces subir lo local. El usuario edita indistintamente aquí o en claude.ai/design; si editó allá, también puede pedir "trae los cambios de Claude Design" sin hacer sync completo.
- Archivos generados por la app en el proyecto remoto (p. ej. `_ds_manifest.json`, sentinel `_ds_needs_recompile`) no se traen a git ni cuentan como "cambios del usuario".
- El zip ya trae el layout final: componentes flat (`components/<grupo>/<Nombre>.{jsx,d.ts,prompt.md}` + `<grupo>.card.html` con marcador `@dsCard`), `guidelines/`, `tokens/`, `styles.css`, logos y `ui_kits/`. Se sube tal cual, sin build ni verificación de renders.
- No se genera `_ds_sync.json` (no hay recipe para este shape): cada re-sync compara contra el remoto con `list_files`/`get_file` o re-sube todo — es barato (~80 archivos, ~10 MB).
- El `readme.md` del kit ya es el archivo de convenciones (voz, color, tipo, componentes); no se autora `conventions.md` aparte.
- Re-sync: extraer el zip actualizado a `ds-bundle/` (gitignoreado), `finalize_plan` con los mismos globs y re-subir. El proyecto destino está pineado en `config.json`.
- Fuentes tipográficas vienen de Google Fonts (sin binarios locales) — caveat documentado en el readme del kit.
