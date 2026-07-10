export interface PrintJobRow {
  id: string;
  order_id: string;
  part: 'pantalla' | 'cuerpo' | 'tapa';
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

// Crea los 3 trabajos de impresión de una lámpara (pantalla en su color,
// cuerpo blanco, tapa en su color). Cada pieza es su propio archivo rebanado
// de un filamento; el color real lo pone el AMS al imprimir. Es la costura
// que usará el agente autónomo para despachar sin humano (ver ROADMAP).
export async function createJobsForOrder(
  db: D1Database,
  orderId: string,
  config: { model: string; pantalla: string; tapa: string },
): Promise<PrintJobRow[]> {
  const piezas = [
    { part: 'pantalla', file_key: `pantalla/${config.model}`, colors: [config.pantalla] },
    { part: 'cuerpo', file_key: 'cuerpo/cuerpo', colors: ['blanco'] },
    { part: 'tapa', file_key: 'tapa/tapa', colors: [config.tapa] },
  ];
  await db.batch(
    piezas.map((j) =>
      db
        .prepare(
          'INSERT INTO print_jobs (id, order_id, part, file_key, colors_json) VALUES (?, ?, ?, ?, ?)',
        )
        .bind(`job_${crypto.randomUUID()}`, orderId, j.part, j.file_key, JSON.stringify(j.colors)),
    ),
  );
  const { results } = await db
    .prepare('SELECT * FROM print_jobs WHERE order_id = ? ORDER BY created_at')
    .bind(orderId)
    .all<PrintJobRow>();
  return results;
}
