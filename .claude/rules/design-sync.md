---
paths:
  - "ds-bundle/**"
  - ".design-sync/**"
---

# Antes de tocar el design system

Estás por editar algo dentro de `ds-bundle/` (o su config en `.design-sync/`),
el espejo local del proyecto "Forma Brand Kit" en Claude Design. Este
directorio se sincroniza en las dos direcciones con esa herramienta — pull-before-push
**obligatorio en cada sync**, no opcional — y si no lo haces, el remoto puede
seguir cambiando sin que git se entere (ya pasó: un mes completo de drift sin
que nadie lo notara).

Antes de escribir cualquier archivo aquí:

1. Lee `.design-sync/NOTES.md` completo — tiene el proyecto destino
   (`config.json`), el historial de qué cambió y cuándo, y qué se dejó fuera
   a propósito (`uploads/`, archivos generados por la app).
2. Con el tool `DesignSync`: `list_files` + `get_file` de los archivos de
   texto remotos que vayas a tocar, y compara contra lo que hay en git. Si el
   remoto ya cambió algo que no está en `ds-bundle/`, tráelo primero (commit
   aparte si conviene) — nunca lo pises con tu propio push.
3. Solo entonces sube lo tuyo con `finalize_plan` + `write_files`.
4. Si encontraste drift real (remoto con cambios que no estaban en git),
   déjalo anotado en `.design-sync/NOTES.md` con la fecha, como ya se hace ahí.

`DesignSync` ya está en `permissions.allow`, así que no debería interrumpirte
con un prompt — pero la lógica de comparar y decidir qué traer sigue siendo
tuya, el permiso no reemplaza el paso 2.
