-- Migration number: 0005 	 candado de cama entre impresiones
-- La A1 no sabe si retiraste la pieza. Tras cada impresión real la cama queda
-- "ocupada" y el agente NO recibe más trabajos hasta que confirmes en /taller
-- que la despejaste.

CREATE TABLE printer_flags (
  id        INTEGER PRIMARY KEY CHECK (id = 1),  -- una sola fila
  bed_clear INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO printer_flags (id, bed_clear) VALUES (1, 1);
