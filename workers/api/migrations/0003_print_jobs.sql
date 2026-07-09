-- Migration number: 0003 	 cola de trabajos de impresión (fase 3)
-- Cada lámpara despachada genera 2 trabajos: la pantalla en su color y el
-- cuerpo+tapa (blanco + color de tapa) como plato de 2 filamentos.

CREATE TABLE print_jobs (
  id           TEXT PRIMARY KEY,               -- 'job_' + uuid
  order_id     TEXT NOT NULL REFERENCES orders(id),
  part         TEXT NOT NULL CHECK (part IN ('pantalla', 'cuerpo_tapa')),
  file_key     TEXT NOT NULL,                  -- 'pantalla/tessera' | 'cuerpo_tapa/cuerpo_tapa'
  colors_json  TEXT NOT NULL,                  -- pantalla: ["rojo"]; cuerpo_tapa: ["blanco","rojo"]
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
