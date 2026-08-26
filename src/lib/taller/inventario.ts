import { call } from "./http";
import type { Order } from "./pedidos";

// Umbral de "material bajo": una bobina con menos de esto se marca para
// reponer (badge "bajo" en la tabla de inventario). Espejo del comentario en
// workers/api/src/lib/resumen.ts (mismo número, dos lugares porque el worker
// calcula el conteo del Resumen y el front pinta el badge por fila).
export const MATERIAL_BAJO_G = 200;

export interface Bobina {
  id: string;
  color_id: string | null;
  // Tono real del filamento ('#RRGGBB', 0023). color_id dice de qué familia es;
  // color_hex dice cuál de sus tonos — dos blancos distintos siguen siendo
  // blancos para el desplegable del AMS, pero se ven y se distinguen.
  color_hex: string | null;
  material: string;
  brand: string | null;
  weight_g: number;
  weight_left_g: number;
  cost_mxn: number | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Pieza {
  id: string;
  product_id: string;
  // Lámpara: {model, pantalla, tapa}; banca u otros: null.
  config: Order["config"];
  print_job_id: string | null;
  order_id: string | null;
  qc_status: string | null;
  status: string;
  location: string | null;
  created_at: string;
}

// Normalizaciones por si responde un worker anterior al módulo.
const normalizeBobina = (b: Bobina): Bobina => ({
  ...b,
  color_id: b.color_id ?? null,
  color_hex: b.color_hex ?? null,
  material: b.material ?? "PLA",
  brand: b.brand ?? null,
  weight_g: b.weight_g ?? 1000,
  weight_left_g: b.weight_left_g ?? 0,
  cost_mxn: b.cost_mxn ?? null,
});

const normalizePieza = (p: Pieza): Pieza => ({
  ...p,
  config: p.config ?? null,
  print_job_id: p.print_job_id ?? null,
  order_id: p.order_id ?? null,
  qc_status: p.qc_status ?? null,
  location: p.location ?? null,
});

export const getBobinas = (token: string) =>
  call<{ bobinas: Bobina[] }>(token, "/inventario/bobinas").then((r) =>
    (r.bobinas ?? []).map(normalizeBobina),
  );

export const createBobina = (
  token: string,
  data: {
    color_id?: string;
    color_hex?: string;
    material?: string;
    brand?: string;
    weight_g?: number;
    cost_mxn?: number;
  },
) =>
  call<Bobina>(token, "/inventario/bobinas", {
    method: "POST",
    body: JSON.stringify(data),
  }).then(normalizeBobina);

export const patchBobina = (
  token: string,
  id: string,
  data: {
    weight_left_g?: number;
    status?: string;
    color_id?: string;
    color_hex?: string;
  },
) =>
  call<Bobina>(token, `/inventario/bobinas/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  }).then(normalizeBobina);

export const getPiezas = (token: string) =>
  call<{ piezas: Pieza[] }>(token, "/inventario/piezas").then((r) =>
    (r.piezas ?? []).map(normalizePieza),
  );

export const createPieza = (
  token: string,
  data: {
    product_id: string;
    config?: NonNullable<Order["config"]>;
    location?: string;
    order_id?: string;
  },
) =>
  call<Pieza>(token, "/inventario/piezas", {
    method: "POST",
    body: JSON.stringify(data),
  }).then(normalizePieza);

export const patchPieza = (
  token: string,
  id: string,
  data: { status?: string; location?: string; qc_status?: string },
) =>
  call<Pieza>(token, `/inventario/piezas/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  }).then(normalizePieza);
