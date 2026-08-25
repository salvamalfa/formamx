-- Migration number: 0020 	 configuración de costos para la calculadora de precio
-- Reemplaza las constantes fijas del Apps Script COSTO_IMPRESION de Salva
-- (docs/NEGOCIO.md §3e) por una fila editable desde /taller — mismo patrón
-- de una sola fila que printer_flags (0005). Todo lo que es dinero va en
-- centavos, igual que bobinas.cost_mxn (0012); consumo_w, minutos y
-- porcentajes son enteros normales, no dinero.
-- vida_util_horas_estimada arranca con el supuesto de Salva (2 años × 9 h/día
-- ≈ 6570 h) pero deja de ser un cálculo hecho de "años×horas al día": una vez
-- que printer_flags.total_print_hours (0021) acumule horas reales, Salva la
-- ajusta aquí a mano cuando quiera revisar el supuesto.

CREATE TABLE pricing_config (
  id                         INTEGER PRIMARY KEY CHECK (id = 1),  -- una sola fila
  costo_kwh_mxn              INTEGER NOT NULL DEFAULT 100,        -- centavos por kWh
  consumo_w                  INTEGER NOT NULL DEFAULT 100,        -- watts promedio de la impresora
  costo_hora_mano_obra_mxn   INTEGER NOT NULL DEFAULT 10000,      -- centavos por hora de mano de obra
  minutos_mano_obra_default  INTEGER NOT NULL DEFAULT 20,         -- minutos de mano de obra por pieza
  precio_impresora_mxn       INTEGER NOT NULL DEFAULT 1300000,    -- centavos, costo de la impresora
  vida_util_horas_estimada   INTEGER NOT NULL DEFAULT 6570,       -- horas de vida útil estimadas
  rep_percent                INTEGER NOT NULL DEFAULT 5,          -- % extra por mantenimiento/reparación
  margen_default_pct         INTEGER NOT NULL DEFAULT 300,        -- % de margen sobre el costo (300 = 4x)
  updated_at                 TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO pricing_config (id) VALUES (1);
