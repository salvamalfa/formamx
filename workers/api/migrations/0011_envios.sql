-- Migration number: 0011 	 guías de envío por pedido
-- Un pedido puede tener N guías (reenvíos: guía equivocada = crear otra;
-- el historial no se edita). `orders.status = 'enviada'` no cambia de dueño:
-- el detalle del envío vive aquí (boceto en ROADMAP §7).
-- Sin CHECK en status: los enums que crecen se validan en lib/ (lección 0004).

CREATE TABLE shipments (
  id              TEXT PRIMARY KEY,                 -- 'shp_' + uuid
  order_id        TEXT NOT NULL REFERENCES orders(id),
  carrier         TEXT,                             -- Estafeta, DHL, ... (texto libre)
  service         TEXT,                             -- terrestre, exprés, ...
  tracking_number TEXT,
  label_url       TEXT,                             -- URL de la guía/etiqueta si existe
  cost_mxn        INTEGER,                          -- centavos, lo que costó la guía
  raw_json        TEXT,                             -- respuesta cruda del carrier (API futura)
  status          TEXT NOT NULL DEFAULT 'creada',   -- creada|en_transito|entregada|incidencia
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  shipped_at      TEXT,                             -- se sella al pasar a en_transito
  delivered_at    TEXT                              -- se sella al pasar a entregada
);

-- El tablero pregunta por pedido (historial de guías) y por status (activas).
CREATE INDEX idx_shipments_order ON shipments(order_id);
CREATE INDEX idx_shipments_status ON shipments(status);
