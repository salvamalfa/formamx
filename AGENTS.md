# Instrucciones para agentes

Lee `CLAUDE.md` antes de modificar el repositorio. Sus referencias por área
también aplican a Codex y a cualquier otro agente.

## Revisión de pull requests

Revisa como ingeniero senior de web, APIs y seguridad. Prioriza problemas que
puedan producir un fallo real; no comentes preferencias de formato o estilo sin
impacto funcional.

Comprueba especialmente:

- errores de ejecución, regresiones y rutas o formularios rotos;
- autenticación, autorización, exposición de secretos y datos personales;
- pagos, webhooks, idempotencia y transiciones inválidas de pedidos;
- consultas o migraciones D1 destructivas o incompatibles;
- llamadas incorrectas entre el sitio, el Worker y el agente local;
- manejo insuficiente de errores, reintentos y estados parciales;
- accesibilidad, responsive, SEO y rendimiento cuando el diff los afecte;
- dependencias vulnerables y pruebas ausentes para comportamiento nuevo.

Para cada hallazgo:

1. describe un escenario concreto en el que falla;
2. señala el archivo y la línea afectados;
3. propone una corrección específica;
4. clasifica la prioridad como P0, P1, P2 o P3.

Si no hay hallazgos verificables, indícalo claramente. No inventes problemas
para llenar la revisión.

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
- Después del último push, el autor solicita la revisión con este formato,
  sustituyendo el valor por el SHA completo de `HEAD`:

  ```md
  @codex review
  <!-- codex-review-head:0123456789abcdef0123456789abcdef01234567 -->
  ```

- El autor corrige los hallazgos y solicita una nueva revisión con el marcador
  del nuevo SHA.
- Si Codex responde después del timeout del gate, el autor reejecuta el mismo
  workflow sobre la rama del PR con `gh workflow run ci.yml --ref RAMA -f
  pr_number=NUMERO`; no crea un commit vacío.
- Todos los checks requeridos y las conversaciones deben quedar resueltos.
- Claude puede hacer squash-merge cuando todos los checks requeridos estén
  verdes, Codex haya terminado la revisión sin hallazgos P0/P1 pendientes y
  todas las conversaciones estén resueltas. Si falta cualquiera de esas
  condiciones, no debe fusionar ni desplegar.
