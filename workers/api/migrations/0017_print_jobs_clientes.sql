-- Migration number: 0017 	 print_jobs acepta piezas de clientes
-- Una pieza de cliente (custom_prints, migración 0016) se imprime por el mismo
-- pipeline que las lámparas: misma cola, mismo claim atómico, mismo candado de
-- cama. Para eso `order_id` deja de ser obligatorio (esa pieza no viene de un
-- pedido) y se agrega `custom_print_id`.
-- Se reconstruye la tabla porque SQLite no altera NOT NULL ni CHECK (mismo
-- motivo que la 0004, pero aquí SÍ se conservan los datos: hay trabajos
-- reales). Los CHECK de part/status se retiran al reconstruir, siguiendo la
-- convención del repo: los enums se validan en lib/, no en D1.

CREATE TABLE print_jobs_nueva (
  id              TEXT PRIMARY KEY,               -- 'job_' + uuid
  order_id        TEXT REFERENCES orders(id),         -- NULL en piezas de cliente
  custom_print_id TEXT REFERENCES custom_prints(id),  -- NULL en lámparas
  part            TEXT NOT NULL,                  -- pantalla|cuerpo|tapa|cliente
  file_key        TEXT NOT NULL,                  -- 'pantalla/tessera' | 'clientes/cp_<uuid>'
  colors_json     TEXT NOT NULL,                  -- un color por pieza: ["rojo"]
  status          TEXT NOT NULL DEFAULT 'queued',
  progress_pct    INTEGER,
  message         TEXT,
  claimed_at      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO print_jobs_nueva
  (id, order_id, part, file_key, colors_json, status, progress_pct, message,
   claimed_at, created_at, updated_at)
  SELECT id, order_id, part, file_key, colors_json, status, progress_pct, message,
         claimed_at, created_at, updated_at
  FROM print_jobs;

DROP TABLE print_jobs;
ALTER TABLE print_jobs_nueva RENAME TO print_jobs;

CREATE INDEX idx_jobs_status ON print_jobs(status, created_at);
CREATE INDEX idx_jobs_order ON print_jobs(order_id);
CREATE INDEX idx_jobs_custom_print ON print_jobs(custom_print_id);

-- El índice único de la 0010 (un solo juego de trabajos por pedido, que cierra
-- el TOCTOU del dispatch) se recrea parcial: las piezas de cliente tienen
-- order_id NULL y part 'cliente', así que sin el WHERE dos piezas distintas
-- chocarían entre sí.
CREATE UNIQUE INDEX idx_jobs_order_part ON print_jobs(order_id, part)
  WHERE order_id IS NOT NULL;
