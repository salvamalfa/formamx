import { call } from './http';

// Agregados de la vista Resumen. Montos en CENTAVOS (como el resto del taller).
export interface ResumenVentasPunto {
  mes: string; // 'YYYY-MM'
  total_mxn: number;
}

export interface Resumen {
  ventas: {
    mes_mxn: number;
    mes_anterior_mxn: number;
    delta_pct: number | null;
    serie: ResumenVentasPunto[]; // 6 elementos ascendente, termina en el mes actual
  };
  pedidos: {
    activos: number;
    sin_empezar: number;
  };
  mensajes_sin_responder: number;
  material_bajo: number;
}

// Normalización defensiva por si responde un worker anterior al endpoint.
const normalizeResumen = (r: Partial<Resumen> | null): Resumen => ({
  ventas: {
    mes_mxn: r?.ventas?.mes_mxn ?? 0,
    mes_anterior_mxn: r?.ventas?.mes_anterior_mxn ?? 0,
    delta_pct: r?.ventas?.delta_pct ?? null,
    serie: r?.ventas?.serie ?? [],
  },
  pedidos: {
    activos: r?.pedidos?.activos ?? 0,
    sin_empezar: r?.pedidos?.sin_empezar ?? 0,
  },
  mensajes_sin_responder: r?.mensajes_sin_responder ?? 0,
  material_bajo: r?.material_bajo ?? 0,
});

export const getResumen = (token: string) =>
  call<Partial<Resumen>>(token, '/resumen').then(normalizeResumen);
