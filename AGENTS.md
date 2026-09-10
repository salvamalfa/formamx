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
- Para cualquier cambio de producto perceptible por Salva o por un visitante
  (diseño o UX, páginas, módulos, funciones, integraciones o comportamiento),
  trabaja primero en una rama corta sin abrir un pull request. Ejecuta una
  vista o flujo local y muéstrale una demostración clara con capturas; itera en
  la misma rama hasta que confirme el resultado. Si depende de un servicio
  externo, prueba en modo local o de prueba todo lo posible y explica qué
  activación externa quedaría para después. Su confirmación autoriza abrir el
  pull request, activar auto-merge con método squash y continuar con los checks
  sin pedir otra aprobación.
  No añadas esta pausa a mantenimiento interno sin cambios perceptibles, como
  dependencias, CI, tests, documentación o refactors puramente técnicos.
- Cada cambio va en una rama corta y un pull request hacia `master`.
- Al abrir el pull request, intenta activar auto-merge con método squash, pero
  cuenta con que falle (el repo tiene "Allow auto-merge" prendido y aun así la
  herramienta lo rechaza, con checks corriendo o ya en verde). Cuando
  auto-merge falle, por el motivo que sea, haz tú el squash merge en cuanto se
  cumplan las tres condiciones: checks verdes, sin conversaciones abiertas y
  respetando el orden de deploy de `CLAUDE.md`. No lo reintentes esperando que
  cambie, y no dejes el pull request parado: uno verde nunca se queda
  esperando a Salva.
