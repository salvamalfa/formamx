-- Migration number: 0022 	 fija la bobina usada por una pieza de cliente
-- Hallazgo de Codex en el PR de la Fase 3e: pricing.ts y el descuento de
-- gramos re-derivaban CADA UNO por separado qué bobina corresponde a una
-- pieza de cliente (buscando en spool_slots por material+color_id en el
-- momento de la llamada). Si el AMS cambiaba entre el rebanado y el fin de
-- la impresión, o si dos ranuras compartían material+color, el costo
-- calculado y el gramaje descontado podían venir de bobinas distintas.
--
-- bobina_id se fija UNA vez, al calcular el precio en slice-result (mismo
-- momento en que ya se guarda cost_mxn/price_mxn), y el descuento de gramos
-- al terminar la impresión usa ese mismo valor en vez de volver a buscar.
-- NULL = no había bobina vinculada al rebanar (fallback de pricing.ts);
-- entonces tampoco hay de dónde descontar, y no se descuenta nada.

ALTER TABLE custom_prints ADD COLUMN bobina_id TEXT REFERENCES bobinas(id);
