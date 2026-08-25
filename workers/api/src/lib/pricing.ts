// Calculadora de costo/precio de piezas de cliente (Fase 3e, docs/NEGOCIO.md
// §3). Reemplaza el Apps Script COSTO_IMPRESION de Salva: mismo desglose
// (material, luz, mano de obra, amortización), pero el material sale de la
// bobina real vinculada a la ranura usada (no de un $250 fijo) y la
// amortización usa horas reales acumuladas en vez de un supuesto de
// horas/día. Todo el dinero es centavos MXN, igual que el resto del repo.

export interface PricingConfigRow {
  costo_kwh_mxn: number;
  consumo_w: number;
  costo_hora_mano_obra_mxn: number;
  minutos_mano_obra_default: number;
  precio_impresora_mxn: number;
  vida_util_horas_estimada: number;
  rep_percent: number;
  margen_default_pct: number;
}

// Se usa solo cuando la ranura no tiene bobina vinculada todavía (0019): el
// mismo valor por defecto que ya traía el Apps Script, para no dejar el
// costo en blanco mientras Salva no ha hecho la vinculación en /taller.
const FALLBACK_BOBINA_COST_MXN = 25000; // $250.00
const FALLBACK_BOBINA_WEIGHT_G = 1000;

export interface BobinaCostInput {
  cost_mxn: number | null;
  weight_g: number;
}

export interface CostBreakdown {
  material_mxn: number;
  luz_mxn: number;
  mano_obra_mxn: number;
  amortizacion_mxn: number;
  total_mxn: number;
  // Si no hubo bobina vinculada, el material se estimó con el valor de
  // respaldo — no es lo que de verdad cuesta, es un aviso a revisar.
  material_source: 'bobina' | 'fallback';
  // true cuando la impresora ya acumuló más horas que su vida útil
  // estimada: la amortización deja de cobrar la parte de capital y solo
  // cobra el % de mantenimiento (rep_percent) — la máquina ya se pagó sola.
  amortizada: boolean;
}

// Redondeo a centavos enteros en cada paso: los montos que se guardan en D1
// son INTEGER, y sumar floats sin redondear va acumulando arrastre.
function round(mxn: number): number {
  return Math.round(mxn);
}

export function computeCostBreakdown(
  gramos: number,
  segundos: number,
  bobina: BobinaCostInput | null,
  config: PricingConfigRow,
  totalPrintSecondsAntes: number,
  minutosManoObra?: number | null,
): CostBreakdown {
  const horas = segundos / 3600;

  // A. Material: prorrateo del costo de la bobina por el peso usado.
  const costoBobina = bobina?.cost_mxn ?? FALLBACK_BOBINA_COST_MXN;
  const pesoBobina = bobina?.weight_g ?? FALLBACK_BOBINA_WEIGHT_G;
  const material_mxn = round((gramos / pesoBobina) * costoBobina);

  // B. Electricidad.
  const luz_mxn = round(horas * (config.consumo_w / 1000) * config.costo_kwh_mxn);

  // C. Mano de obra.
  const minutos = minutosManoObra ?? config.minutos_mano_obra_default;
  const mano_obra_mxn = round((minutos / 60) * config.costo_hora_mano_obra_mxn);

  // D. Amortización dinámica: mientras la impresora no cumpla su vida útil
  // estimada en horas, cobra capital + mantenimiento; ya cumplida, solo
  // mantenimiento (rep_percent) — ver docs/NEGOCIO.md §3e.
  const horasAcumuladas = totalPrintSecondsAntes / 3600;
  const amortizada = horasAcumuladas >= config.vida_util_horas_estimada;
  const factorCapital = amortizada ? 0 : 1;
  const costoHoraMaquina =
    (config.precio_impresora_mxn * (factorCapital + config.rep_percent / 100)) /
    config.vida_util_horas_estimada;
  const amortizacion_mxn = round(costoHoraMaquina * horas);

  const total_mxn = material_mxn + luz_mxn + mano_obra_mxn + amortizacion_mxn;

  return {
    material_mxn,
    luz_mxn,
    mano_obra_mxn,
    amortizacion_mxn,
    total_mxn,
    material_source: bobina?.cost_mxn != null ? 'bobina' : 'fallback',
    amortizada,
  };
}

// Precio sugerido: costo + margen de pricing_config. Salva puede
// sobrescribirlo por pieza (custom_prints.price_override_mxn); este valor es
// solo el punto de partida.
export function computeSuggestedPrice(costTotalMxn: number, config: PricingConfigRow): number {
  return round(costTotalMxn * (1 + config.margen_default_pct / 100));
}
