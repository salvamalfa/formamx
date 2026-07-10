-- Migration number: 0008 	 cimientos para los módulos futuros del taller
-- 1) products.production separa lo que pasa por la impresora de lo manual
--    (sin CHECK: los enums que crecen se validan en lib/, lección de la 0004).
-- 2) customers normaliza a los clientes (el CRM futuro solo leerá); los
--    customer_* de orders se quedan como snapshot histórico del pedido.

ALTER TABLE products ADD COLUMN production TEXT NOT NULL DEFAULT 'manual';
UPDATE products SET production = 'impresion_3d' WHERE id = 'lampara';

CREATE TABLE customers (
  id         TEXT PRIMARY KEY,                 -- 'cus_' + uuid
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  name       TEXT,
  email      TEXT UNIQUE COLLATE NOCASE,
  phone      TEXT,
  notes      TEXT
);

ALTER TABLE orders ADD COLUMN customer_id TEXT REFERENCES customers(id);

-- Backfill: un cliente por email existente en pedidos.
INSERT INTO customers (id, name, email, phone)
SELECT 'cus_' || lower(hex(randomblob(16))), customer_name, lower(customer_email), customer_phone
FROM orders
WHERE customer_email IS NOT NULL
GROUP BY lower(customer_email);

UPDATE orders
SET customer_id = (SELECT c.id FROM customers c WHERE c.email = lower(orders.customer_email))
WHERE customer_email IS NOT NULL;
