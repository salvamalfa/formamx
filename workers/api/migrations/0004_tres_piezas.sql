-- Migration number: 0004 	 una lámpara son 3 impresiones, no 2
-- La tapa y el cuerpo son STL separados: cada lámpara genera 3 trabajos de un
-- filamento cada uno (pantalla en su color, cuerpo blanco, tapa en su color).
-- Se recrea la tabla porque SQLite no permite alterar el CHECK; los trabajos
-- existentes eran de prueba.

DROP TABLE print_jobs;

CREATE TABLE print_jobs (
  id           TEXT PRIMARY KEY,               -- 'job_' + uuid
  order_id     TEXT NOT NULL REFERENCES orders(id),
  part         TEXT NOT NULL CHECK (part IN ('pantalla', 'cuerpo', 'tapa')),
  file_key     TEXT NOT NULL,                  -- 'pantalla/tessera' | 'cuerpo/cuerpo' | 'tapa/tapa'
  colors_json  TEXT NOT NULL,                  -- un color por pieza: ["rojo"]
  status       TEXT NOT NULL DEFAULT 'queued' CHECK (status IN
               ('queued', 'claimed', 'printing', 'done', 'failed', 'canceled')),
  progress_pct INTEGER,
  message      TEXT,
  claimed_at   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_jobs_status ON print_jobs(status, created_at);
CREATE INDEX idx_jobs_order ON print_jobs(order_id);
