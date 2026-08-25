-- Migration number: 0021 	 horas reales de impresora + costo/precio por pieza de cliente
-- Dos temas que se necesitan juntos para la Fase 3e (docs/NEGOCIO.md):
--
-- 1. Amortización dinámica por uso real, no un supuesto de horas/día:
--    printing_started_at se llena una sola vez, en la primera transición
--    claimed→printing de un print_job (no en cada reporte de progreso), para
--    medir la duración real de la impresión. Al terminar (done/failed), esa
--    duración se suma a printer_flags.total_print_seconds. Segundos y no
--    horas para no acumular error de redondeo con cada reporte.
--
-- 2. Costo y precio calculados por pieza de cliente, guardados como snapshot
--    en vez de recalcularse cada vez que se lee (igual que est_seconds/
--    est_grams ya son snapshot del rebanado): cost_mxn sale de pricing.ts;
--    price_mxn es cost_mxn con el margen de pricing_config aplicado;
--    price_override_mxn es NULL salvo que Salva edite el precio a mano desde
--    el desglose en /taller, en cuyo caso manda sobre price_mxn.

ALTER TABLE printer_flags ADD COLUMN total_print_seconds INTEGER NOT NULL DEFAULT 0;

ALTER TABLE print_jobs ADD COLUMN printing_started_at TEXT;

ALTER TABLE custom_prints ADD COLUMN cost_mxn INTEGER;
ALTER TABLE custom_prints ADD COLUMN price_mxn INTEGER;
ALTER TABLE custom_prints ADD COLUMN price_override_mxn INTEGER;
-- Desglose de cost_mxn (material/luz/mano de obra/amortización + de dónde
-- salió el costo de material), para el panel "›" de /taller. Va como JSON en
-- vez de 4 columnas más porque es puramente informativo — nada más lo lee ni
-- filtra por sus partes.
ALTER TABLE custom_prints ADD COLUMN cost_breakdown_json TEXT;
