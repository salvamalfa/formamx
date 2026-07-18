-- Migration number: 0013 	 registros de control de calidad
-- Las DEFINICIONES de los checklists NO viven aquí: viven en código
-- (lib/calidad.ts, indexadas por products.production) — la fuente de verdad
-- de qué se revisa es el código; D1 solo guarda los RESULTADOS de cada
-- revisión (checklist_json con las respuestas de ese momento). Los registros
-- son INMUTABLES: no hay UPDATE — repetir la revisión de una pieza es
-- insertar una fila nueva; el historial no miente.
-- Sin CHECK en part/passed: se valida en lib/ (lección 0004).

CREATE TABLE qc_registros (
  id             TEXT PRIMARY KEY,                 -- 'qc_' + uuid
  order_id       TEXT NOT NULL REFERENCES orders(id),
  print_job_id   TEXT REFERENCES print_jobs(id),   -- impresión revisada, si se sabe
  part           TEXT,                             -- pantalla|cuerpo|tapa; NULL = pieza completa
  checklist_json TEXT NOT NULL,                    -- respuestas {item_id: true|false} de ESA revisión
  passed         INTEGER NOT NULL,                 -- 0|1; lo calcula el worker (todos los items en true)
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- El tablero pregunta por pedido (¿ya tiene una revisión aprobada?).
CREATE INDEX idx_qc_registros_order ON qc_registros(order_id);
