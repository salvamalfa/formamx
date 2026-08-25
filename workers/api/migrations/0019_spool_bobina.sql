-- Migration number: 0019 	 liga spool_slots con bobinas
-- La unión quedó DIFERIDA a propósito en 0012 ("cuando haga falta, es un ADD
-- COLUMN trivial"). Hace falta ahora: sin ella, el panel Impresora solo
-- adivina el % restante por color+material (heurística ambigua si hay dos
-- bobinas iguales) y no hay forma de descontar gramos de la bobina real ni
-- de calcular el costo de material de una pieza. NULL = ranura sin bobina
-- vinculada todavía (se sigue mostrando "sin datos", no se rompe nada).

ALTER TABLE spool_slots ADD COLUMN bobina_id TEXT REFERENCES bobinas(id);
