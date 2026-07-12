-- Migration number: 0009 	 candado atómico para los efectos de un pago
-- paid_at marca que un pedido ya corrió sus efectos de "pagado" (descontar
-- stock + avisar al taller). El webhook lo pone con un UPDATE guardado
-- (WHERE paid_at IS NULL) para que un reintento de Stripe nunca los repita.
-- Backfill: los pedidos que YA están en un estado post-pago se marcan como
-- procesados con su created_at para no re-descontar stock en el primer reintento.

ALTER TABLE orders ADD COLUMN paid_at TEXT;

UPDATE orders
SET paid_at = created_at
WHERE status IN ('pagada', 'en_cola', 'imprimiendo', 'lista', 'enviada');
