-- Migration number: 0012 	 inventario de bodega: bobinas y piezas terminadas
-- Dos tablas, un tema (boceto en ROADMAP §7): `bobinas` es el ALMACÉN de
-- filamento; `spool_slots` sigue siendo "qué está montado en el AMS" (estado
-- físico que dicta la impresora). La unión `spool_slots.bobina_id` queda
-- DIFERIDA a propósito — cuando haga falta, es un ADD COLUMN trivial.
-- Sin CHECK en status: los enums que crecen se validan en lib/ (lección 0004).

CREATE TABLE bobinas (
  id            TEXT PRIMARY KEY,                  -- 'bob_' + uuid
  color_id      TEXT,                              -- id del catálogo (lamps.ts); NULL = fuera de catálogo
  material      TEXT NOT NULL DEFAULT 'PLA',       -- PLA, PETG, ... (texto libre)
  brand         TEXT,
  weight_g      INTEGER NOT NULL DEFAULT 1000,     -- peso nominal de la bobina
  weight_left_g INTEGER NOT NULL,                  -- lo que queda; se edita a mano, sin auto-agotar
  cost_mxn      INTEGER,                           -- centavos, lo que costó la bobina
  status        TEXT NOT NULL DEFAULT 'nueva',     -- nueva|en_uso|agotada
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- El tablero pregunta por las no agotadas (lo que hay en el almacén).
CREATE INDEX idx_bobinas_status ON bobinas(status);

-- Piezas terminadas: lo impreso (o hecho a mano) que espera comprador o ya
-- tiene uno. `qc_status` es denormalizado y MANUAL (el registro formal de
-- calidad llega con el módulo calidad); aquí solo se anota el veredicto.
CREATE TABLE piezas (
  id           TEXT PRIMARY KEY,                   -- 'pza_' + uuid
  product_id   TEXT NOT NULL REFERENCES products(id),
  config_json  TEXT,                               -- lámpara: {"model","pantalla","tapa"}; banca: NULL
  print_job_id TEXT REFERENCES print_jobs(id),     -- de qué impresión salió, si se sabe
  order_id     TEXT REFERENCES orders(id),         -- pedido que la reserva/compró, si hay
  qc_status    TEXT,                               -- NULL = sin revisar; ok|rechazada
  status       TEXT NOT NULL DEFAULT 'en_stock',   -- en_stock|reservada|vendida|merma
  location     TEXT,                               -- dónde está en el taller (texto libre)
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- El tablero pregunta por status (stock disponible) y por pedido.
CREATE INDEX idx_piezas_status ON piezas(status);
CREATE INDEX idx_piezas_order ON piezas(order_id);
