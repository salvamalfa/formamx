-- Migration number: 0007 	 hex crudo del filamento reportado por la impresora
-- El color exacto que reporta la A1 se conserva aunque no se parezca a ningún
-- color del catálogo (p. ej. un gris): el panel del AMS lo muestra tal cual.

ALTER TABLE spool_slots ADD COLUMN color_hex TEXT;
