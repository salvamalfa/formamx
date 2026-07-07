-- Migration number: 0001 	 catálogo mínimo + pedidos + libro de idempotencia de webhooks

CREATE TABLE products (
  id        TEXT PRIMARY KEY,          -- 'lampara' | 'banca-001'
  kind      TEXT NOT NULL CHECK (kind IN ('configurable', 'unique')),
  name      TEXT NOT NULL,
  price_mxn INTEGER NOT NULL,          -- centavos
  stock     INTEGER,                   -- NULL = ilimitado; 1 = pieza única
  active    INTEGER NOT NULL DEFAULT 1
);

INSERT INTO products (id, kind, name, price_mxn, stock, active) VALUES
  ('lampara',   'configurable', 'Lámpara forma',           49900,  NULL, 1),
  ('banca-001', 'unique',       'La banca de los abuelos', 240000, 1,    1);

CREATE TABLE orders (
  id                  TEXT PRIMARY KEY,                    -- 'ord_' + uuid
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  provider            TEXT NOT NULL DEFAULT 'stripe',      -- costura para Mercado Pago después
  provider_session_id TEXT NOT NULL UNIQUE,
  provider_payment_id TEXT,
  payment_method      TEXT,                                -- 'card' | 'oxxo'
  product_id          TEXT NOT NULL REFERENCES products(id),
  config_json         TEXT,                                -- lámpara: {"model","pantalla","tapa"}; banca: NULL
  amount_mxn          INTEGER NOT NULL,                    -- centavos
  currency            TEXT NOT NULL DEFAULT 'mxn',
  customer_name       TEXT,
  customer_email      TEXT,
  customer_phone      TEXT,
  shipping_json       TEXT,                                -- shipping_details de Stripe tal cual
  status              TEXT NOT NULL CHECK (status IN
    ('pendiente', 'pagada', 'en_cola', 'imprimiendo', 'lista', 'enviada', 'cancelada'))
);

CREATE INDEX idx_orders_status ON orders(status);

CREATE TABLE webhook_events (
  event_id    TEXT PRIMARY KEY,        -- evt_... de Stripe
  provider    TEXT NOT NULL DEFAULT 'stripe',
  type        TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);
