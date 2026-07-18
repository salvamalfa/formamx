# Instrucciones para agentes

Lee `CLAUDE.md` antes de modificar el repositorio. Sus referencias por área
también aplican a Codex y a cualquier otro agente.

## Validación esperada

Según el área modificada, ejecuta los checks aplicables:

```sh
npm run check
npm run build
npm run test:e2e
cd workers/api && npm run typecheck
cd agent && python -m pytest tests/
```

No uses credenciales reales en pruebas. No despliegues el Worker ni apliques
migraciones remotas como parte de una revisión.

## Flujo de GitHub

- Cada cambio va en una rama corta y un pull request hacia `master`.
- Usa la revisión automática estándar de Codex. No publiques marcadores de SHA
  ni esperes un gate personalizado. Si Codex deja un hallazgo antes del merge,
  corrígelo; después puedes pedir una segunda pasada con `@codex review`.
- Todos los checks requeridos y las conversaciones deben quedar resueltos.
- Claude puede hacer squash-merge cuando todos los checks requeridos estén
  verdes y las conversaciones estén resueltas; no necesita esperar a que una
  revisión automática todavía en curso termine. Un hallazgo que llegue después
  del merge se corrige en un PR de seguimiento.
