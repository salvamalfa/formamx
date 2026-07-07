-- Migration number: 0002 	 estado del AMS lite (4 ranuras de filamento)

CREATE TABLE spool_slots (
  slot       INTEGER PRIMARY KEY CHECK (slot BETWEEN 0 AND 3),
  color_id   TEXT,          -- id de color de lamps.ts, 'blanco', o NULL = vacío
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO spool_slots (slot, color_id) VALUES (0, NULL), (1, NULL), (2, NULL), (3, NULL);
