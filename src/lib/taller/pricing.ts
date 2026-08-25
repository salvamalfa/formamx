import { call } from './http';

// Configuración de costos de la calculadora de precio (0020, Fase 3e). Una
// sola fila, editable desde /taller — reemplaza las constantes fijas del
// Apps Script de Salva.
export interface PricingConfig {
  costo_kwh_mxn: number;
  consumo_w: number;
  costo_hora_mano_obra_mxn: number;
  minutos_mano_obra_default: number;
  precio_impresora_mxn: number;
  vida_util_horas_estimada: number;
  rep_percent: number;
  margen_default_pct: number;
  updated_at: string;
}

export const getPricingConfig = (token: string) => call<PricingConfig>(token, '/pricing/config');

export const patchPricingConfig = (token: string, data: Partial<Omit<PricingConfig, 'updated_at'>>) =>
  call<PricingConfig>(token, '/pricing/config', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
