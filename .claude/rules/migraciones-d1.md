---
paths:
  - "workers/api/migrations/**"
---

# Migraciones D1

- **Numeración de 4 dígitos**, un tema por archivo.
- **NUNCA editar una migración ya aplicada.** Un cambio sobre algo aplicado es
  una migración nueva.
- **Enums sin `CHECK`.** SQLite no altera un `CHECK` después: los estados que
  crecen se validan en `workers/api/src/lib/`, no en D1. (Lección de la 0004,
  que obligó a reconstruir la tabla entera.)
- Dinero **en centavos**, siempre enteros. Fechas en texto ISO.
- IDs de texto con prefijo: `ord_`, `cus_`, `job_`, `cp_`, `bob_`, `pza_`,
  `shp_`, `msg_`, `qc_`.
- Reconstruir una tabla (el patrón `_nueva` + `INSERT SELECT` + `DROP` +
  `RENAME`) es válido cuando SQLite no puede alterar lo que hace falta, pero
  recrea también sus índices en la misma migración.

Orden de deploy cuando el PR trae migración: **migración remota → deploy del
worker → merge del sitio** (`cd workers/api && npm run migrate:remote`, luego
`npm run deploy`). Nunca al revés.
