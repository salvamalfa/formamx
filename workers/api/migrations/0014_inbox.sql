-- Migration number: 0014 	 inbox de mensajes con clientes
-- Registro de conversaciones con clientes (email, WhatsApp, web o captura
-- manual desde /taller). Sin tabla de hilos a propósito: customer_id +
-- orden cronológico ES el hilo (boceto en ROADMAP §7). `external_id` es la
-- llave de idempotencia para conectores futuros (patrón webhook_events,
-- 0001): un conector que reintenta el mismo mensaje no lo duplica.
-- Sin CHECK en channel/direction/status: los enums que crecen se validan
-- en lib/ (lección 0004).

CREATE TABLE messages (
  id          TEXT PRIMARY KEY,                 -- 'msg_' + uuid
  channel     TEXT NOT NULL,                    -- email|whatsapp|web|manual
  direction   TEXT NOT NULL,                    -- in|out (recibido|enviado)
  external_id TEXT UNIQUE,                      -- id del mensaje en el conector origen; NULL en captura manual
  customer_id TEXT REFERENCES customers(id),
  order_id    TEXT REFERENCES orders(id),
  subject     TEXT,
  body        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'nuevo',    -- nuevo|leido|respondido|archivado
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- El tablero pregunta por status (activos vs archivados) y por cliente
-- (el hilo de una persona).
CREATE INDEX idx_messages_status ON messages(status);
CREATE INDEX idx_messages_customer ON messages(customer_id);
