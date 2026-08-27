// Inventario de bodega (tablas bobinas y piezas, migración 0012). Las
// bobinas son el ALMACÉN de filamento — spool_slots sigue siendo el AMS
// físico; la unión spool_slots.bobina_id está diferida a propósito. Los
// grafos de estado siguen el patrón de lib/orders.ts y se validan aquí,
// no con CHECK en D1.

export type BobinaStatus = 'nueva' | 'en_uso' | 'agotada';
export type PiezaStatus = 'en_stock' | 'reservada' | 'vendida' | 'merma';

export interface BobinaRow {
  id: string;
  color_id: string | null;
  // Tono real del filamento ('#RRGGBB', 0023). El color_id dice de qué familia
  // es; el hex dice cuál de sus tonos, que es lo que permite empatar dos
  // blancos distintos con la misma ranura del AMS.
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

export interface PiezaRow {
  id: string;
  product_id: string;
  config_json: string | null;
  print_job_id: string | null;
  order_id: string | null;
  qc_status: string | null;
  status: string;
  location: string | null;
  created_at: string;
}

// La bobina solo avanza: se estrena, se usa y se acaba. Llegar a 0 g NO la
// agota sola — agotarla es siempre una decisión explícita de Salva.
const BOBINA_TRANSITIONS: Record<BobinaStatus, BobinaStatus[]> = {
  nueva: ['en_uso', 'agotada'],
  en_uso: ['agotada'],
  agotada: [],
};

// Una reserva se puede deshacer (vuelve a stock); vendida y merma son
// terminales — si una pieza "vuelve", es una pieza nueva.
const PIEZA_TRANSITIONS: Record<PiezaStatus, PiezaStatus[]> = {
  en_stock: ['reservada', 'vendida', 'merma'],
  reservada: ['en_stock', 'vendida', 'merma'],
  vendida: [],
  merma: [],
};

export function canTransitionBobina(from: string, to: string): boolean {
  return (BOBINA_TRANSITIONS[from as BobinaStatus] ?? []).includes(to as BobinaStatus);
}

// Vincular una bobina a una ranura del AMS es lo que de verdad la pone en
// uso — no un botón aparte. Se llama tanto al vincular a mano (PATCH
// /spools/:slot) como al re-mapear sola tras leer el AMS (POST /agent/ams);
// no-op si ya estaba en_uso o agotada, así que es seguro llamarla siempre
// que una ranura queda con bobina_id.
export async function activateBobina(db: D1Database, bobinaId: string): Promise<void> {
  await db
    .prepare(
      `UPDATE bobinas SET status = 'en_uso', updated_at = datetime('now')
       WHERE id = ? AND status = 'nueva'`,
    )
    .bind(bobinaId)
    .run();
}

export function canTransitionPieza(from: string, to: string): boolean {
  return (PIEZA_TRANSITIONS[from as PiezaStatus] ?? []).includes(to as PiezaStatus);
}

export const BOBINA_STATUSES = Object.keys(BOBINA_TRANSITIONS) as BobinaStatus[];
export const PIEZA_STATUSES = Object.keys(PIEZA_TRANSITIONS) as PiezaStatus[];

// Veredicto manual sobre la pieza (denormalizado, editado a mano desde
// /taller); no depende de ningún otro módulo.
export const QC_VALUES = ['ok', 'rechazada'];

export function shapeBobina(row: BobinaRow) {
  return {
    id: row.id,
    color_id: row.color_id,
    color_hex: row.color_hex,
    material: row.material,
    brand: row.brand,
    weight_g: row.weight_g,
    weight_left_g: row.weight_left_g,
    cost_mxn: row.cost_mxn,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Parse tolerante: un config_json corrupto no tira la lista (misma política
// que parseJson en routes/admin/_shape.ts; se repite aquí porque lib/ jamás
// importa de routes/).
function parseConfig(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function shapePieza(row: PiezaRow) {
  return {
    id: row.id,
    product_id: row.product_id,
    config: parseConfig(row.config_json),
    print_job_id: row.print_job_id,
    order_id: row.order_id,
    qc_status: row.qc_status,
    status: row.status,
    location: row.location,
    created_at: row.created_at,
  };
}
