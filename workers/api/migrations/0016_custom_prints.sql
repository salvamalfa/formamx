-- Migration number: 0016 	 piezas STL que mandan los clientes
-- El STL vive en R2 (binding STL_BUCKET); D1 solo guarda metadatos y la
-- clave del objeto. El rebanado corre en la PC del agente (CLI de Bambu
-- Studio) y reporta tiempo/gramos aquí; el archivo .gcode.3mf resultante se
-- queda en el disco del agente, igual que los 3MF de las lámparas.
-- Estados sin CHECK (lección de la 0004: SQLite no altera CHECKs), se
-- validan en lib/custom_prints.ts:
--   subido → en_cola → rebanando → listo → imprimiendo → terminado
--   (+ fallido = el rebanado no produjo archivo, + cancelado)

CREATE TABLE custom_prints (
  id           TEXT PRIMARY KEY,              -- 'cp_' + uuid
  file_name    TEXT NOT NULL,                 -- nombre original del STL
  r2_key       TEXT NOT NULL,                 -- 'stl/cp_<uuid>.stl'
  size_bytes   INTEGER NOT NULL,
  -- Elegidos al pedir el rebanado (NULL mientras la pieza solo está subida).
  material     TEXT,                          -- 'PLA' | 'PETG'
  color_id     TEXT,                          -- color de catálogo de la ranura
  color_hex    TEXT,                          -- hex crudo de esa ranura
  supports     TEXT,                          -- 'auto' | 'no'
  orient       TEXT,                          -- 'auto' | 'original'
  status       TEXT NOT NULL DEFAULT 'subido',
  -- Estimados que devuelve el rebanador (result.json).
  est_seconds  INTEGER,
  est_grams    REAL,
  -- 1 cuando el agente logró subir el PNG del plato ('previews/<id>.png').
  preview      INTEGER NOT NULL DEFAULT 0,
  message      TEXT,                          -- motivo de fallo, legible
  print_job_id TEXT,                          -- trabajo del pipeline (fase 4)
  claimed_at   TEXT,                          -- para reencolar rebanados muertos
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_custom_prints_status ON custom_prints(status, created_at);
