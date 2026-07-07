-- Pedidos falsos para probar el dashboard en local. NO usar en remoto.
-- Aplicar con: npx wrangler d1 execute formamx --local --file seed.dev.sql

DELETE FROM orders WHERE id LIKE 'ord_seed_%';

INSERT INTO orders (id, provider_session_id, payment_method, product_id, config_json, amount_mxn, customer_name, customer_email, customer_phone, shipping_json, status) VALUES
  ('ord_seed_1', 'cs_seed_1', 'card', 'lampara',
   '{"model":"tessera","pantalla":"azul","tapa":"rojo"}', 49900,
   'Ana Prueba', 'ana@example.com', '+525511112222',
   '{"name":"Ana Prueba","address":{"line1":"Av. Insurgentes 100","city":"CDMX","state":"CDMX","postal_code":"06700","country":"MX"}}',
   'pagada'),
  ('ord_seed_2', 'cs_seed_2', 'oxxo', 'lampara',
   '{"model":"torsion","pantalla":"verde","tapa":"naranja"}', 49900,
   'Beto Prueba', 'beto@example.com', '+523339998888',
   '{"name":"Beto Prueba","address":{"line1":"Calle Morelos 5","city":"Guadalajara","state":"Jalisco","postal_code":"44100","country":"MX"}}',
   'en_cola'),
  ('ord_seed_3', 'cs_seed_3', 'card', 'banca-001', NULL, 240000,
   'Caro Prueba', 'caro@example.com', '+528117776666',
   '{"name":"Caro Prueba","address":{"line1":"Hidalgo 22","city":"Monterrey","state":"Nuevo León","postal_code":"64000","country":"MX"}}',
   'imprimiendo');
