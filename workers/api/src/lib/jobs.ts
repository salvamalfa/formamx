export interface PrintJobRow {
  id: string;
  order_id: string;
  part: 'pantalla' | 'cuerpo_tapa';
  file_key: string;
  colors_json: string;
  status: 'queued' | 'claimed' | 'printing' | 'done' | 'failed' | 'canceled';
  progress_pct: number | null;
  message: string | null;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
}

export function shapeJob(row: PrintJobRow) {
  return {
    id: row.id,
    order_id: row.order_id,
    part: row.part,
    file_key: row.file_key,
    colors: JSON.parse(row.colors_json) as string[],
    status: row.status,
    progress_pct: row.progress_pct,
    message: row.message,
  };
}

// Un claim se considera abandonado tras 15 min sin pasar a printing (agente
// muerto a media preparación); vuelve a la cola antes de cada claim nuevo.
export const STALE_CLAIM_MINUTES = 15;
