# design-sync — notas

- Fuente: `C:\Users\salva\Desktop\FORMA\Brand Kit\Forma - Brand Kit.zip` — export prearmado de un proyecto de Claude Design (no es un repo compilable; shape `prebuilt-export`, fuera del converter).
- El zip ya trae el layout final: componentes flat (`components/<grupo>/<Nombre>.{jsx,d.ts,prompt.md}` + `<grupo>.card.html` con marcador `@dsCard`), `guidelines/`, `tokens/`, `styles.css`, logos y `ui_kits/`. Se sube tal cual, sin build ni verificación de renders.
- No se genera `_ds_sync.json` (no hay recipe para este shape): cada re-sync compara contra el remoto con `list_files`/`get_file` o re-sube todo — es barato (~80 archivos, ~10 MB).
- El `readme.md` del kit ya es el archivo de convenciones (voz, color, tipo, componentes); no se autora `conventions.md` aparte.
- Re-sync: extraer el zip actualizado a `ds-bundle/` (gitignoreado), `finalize_plan` con los mismos globs y re-subir. El proyecto destino está pineado en `config.json`.
- Fuentes tipográficas vienen de Google Fonts (sin binarios locales) — caveat documentado en el readme del kit.
