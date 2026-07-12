-- Migration number: 0010 	 un solo trabajo por (pedido, pieza)
-- Cierra el TOCTOU del dispatch: dos peticiones concurrentes ya no pueden
-- crear dos juegos de trabajos para el mismo pedido. La segunda choca con el
-- índice único y la ruta la traduce a 409 'ya_despachado'.

CREATE UNIQUE INDEX idx_jobs_order_part ON print_jobs(order_id, part);
