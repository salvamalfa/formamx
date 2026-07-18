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

- Al iniciar cada sesión, antes del trabajo nuevo, revisa si Codex dejó
  conversaciones o comentarios pendientes en pull requests anteriores,
  incluidos los ya mergeados. Si la sesión genera más de un pull request,
  repite la revisión antes de crear el siguiente. Atiende primero los hallazgos
  aplicables en una rama nueva y resuelve la conversación después de corregir;
  si un hallazgo no aplica, deja una explicación breve y resuélvelo. Esta
  comprobación es responsabilidad del agente: Salva no tiene que solicitarla.
- Cada cambio va en una rama corta y un pull request hacia `master`.
- Todos los checks requeridos y las conversaciones deben quedar resueltos.
- Claude puede hacer squash-merge cuando todos los checks requeridos estén
  verdes y las conversaciones estén resueltas.
