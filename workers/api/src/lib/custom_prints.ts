// Piezas STL de clientes (tabla custom_prints, migración 0016). El archivo
// vive en R2; aquí solo viaja el metadato. El grafo de estados sigue el
// patrón de lib/orders.ts y se valida en código, no con CHECK en D1.
//
// Dos matices que explican el grafo:
//  · `fallido` significa SIEMPRE "el rebanado no dejó archivo". Un fallo de
//    IMPRESIÓN devuelve la pieza a `listo` (el .gcode.3mf sigue existiendo),
//    así el gate de Imprimir es simplemente status === 'listo'.
//  · `en_cola` existe para que el agente distinga "me pidieron rebanar"
//    de "ya lo reclamé" (rebanando), igual que queued/claimed en print_jobs.

export type CustomPrintStatus =
  | 'subido'
  | 'en_cola'
  | 'rebanando'
  | 'listo'
  | 'imprimiendo'
  | 'terminado'
  | 'fallido'
  | 'cancelado'
  // Lápida del borrado: la fila queda así mientras se limpian sus objetos en
  // R2 y desaparece en cuanto se limpian. Solo sobrevive si R2 falló, y
  // entonces es la única pista que queda de qué archivos hay que borrar.
  | 'borrado';

export interface CustomPrintRow {
  id: string;
  file_name: string;
  r2_key: string;
  size_bytes: number;
  // 1 cuando el STL y la vista previa ya se limpiaron de R2 (migración 0018).
  files_deleted: number;
  material: string | null;
  color_id: string | null;
  color_hex: string | null;
  supports: string | null;
  orient: string | null;
  status: string;
  est_seconds: number | null;
  est_grams: number | null;
  preview: number;
  message: string | null;
  print_job_id: string | null;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
}

const TRANSITIONS: Record<CustomPrintStatus, CustomPrintStatus[]> = {
  subido: ['en_cola', 'cancelado'],
  en_cola: ['rebanando', 'cancelado'],
  rebanando: ['listo', 'fallido', 'cancelado'],
  // Desde listo se puede re-rebanar (otro color/material) o mandar a imprimir.
  listo: ['en_cola', 'imprimiendo', 'cancelado'],
  // El fallo de impresión regresa aquí, no a fallido: el 3MF sigue estando.
  imprimiendo: ['terminado', 'listo'],
  fallido: ['en_cola', 'cancelado'],
  terminado: [],
  cancelado: [],
  borrado: [],
};

export function canTransition(from: string, to: string): boolean {
  return (TRANSITIONS[from as CustomPrintStatus] ?? []).includes(to as CustomPrintStatus);
}

export const CUSTOM_PRINT_STATUSES = Object.keys(TRANSITIONS) as CustomPrintStatus[];

// Estados desde los que se puede (re)pedir un rebanado.
export const REBANABLE_STATUSES: CustomPrintStatus[] = ['subido', 'listo', 'fallido'];

// Borrar limpia D1 y R2. No se permite mientras el archivo está en uso
// (en_cola/rebanando/imprimiendo): primero se cancela. Incluye 'borrado' para
// que repetir el borrado reintente una limpieza de R2 que quedó a medias.
export const DELETABLE_STATUSES: CustomPrintStatus[] = [
  'subido',
  'listo',
  'fallido',
  'terminado',
  'cancelado',
  'borrado',
];

export const CANCELABLE_STATUSES: CustomPrintStatus[] = [
  'subido',
  'en_cola',
  'rebanando',
  'listo',
  'fallido',
];

// Rebanar un STL grande puede tardar varios minutos; 15 (el de print_jobs)
// sería agresivo y reencolaría trabajos vivos.
export const SLICE_STALE_MINUTES = 30;

// Tope de subida. Coincide con el límite de cuerpo de petición del plan
// gratuito de Workers, así que subir más no funcionaría de todos modos.
export const MAX_STL_BYTES = 100 * 1024 * 1024;

export const SUPPORTS_VALUES = ['auto', 'no'];
export const ORIENT_VALUES = ['auto', 'original'];

export function isSupports(v: unknown): v is string {
  return typeof v === 'string' && SUPPORTS_VALUES.includes(v);
}

export function isOrient(v: unknown): v is string {
  return typeof v === 'string' && ORIENT_VALUES.includes(v);
}

export function stlKey(id: string): string {
  return `stl/${id}.stl`;
}

export function previewKey(id: string): string {
  return `previews/${id}.png`;
}

// Scopes del tablero. Se resuelven en SQL —no filtrando en el cliente— porque
// el listado va topado: con suficientes piezas terminadas, un filtro en el
// navegador dejaría fuera piezas pendientes viejas y no habría forma de
// cancelarlas ni borrarlas desde /taller.
export const SCOPE_WHERE: Record<string, string> = {
  pendientes: "cp.status NOT IN ('terminado', 'cancelado')",
  historico: "cp.status = 'terminado'",
};

// Limpia de R2 el STL del cliente y su vista previa, y lo anota en la fila.
// Idempotente (las claves son deterministas y borrar en R2 no falla si el
// objeto ya no está), así que se puede reintentar cuantas veces haga falta.
// Devuelve false si R2 falló: la fila se queda con files_deleted = 0 y el
// listado del tablero vuelve a intentarlo. Nunca marca limpio lo que no lo
// está — el archivo de un cliente no puede quedarse guardado en silencio.
export async function purgeCustomPrintFiles(
  bucket: R2Bucket,
  db: D1Database,
  id: string,
  r2Key: string,
): Promise<boolean> {
  try {
    await bucket.delete(r2Key);
    await bucket.delete(previewKey(id));
  } catch {
    return false;
  }
  // `preview` vuelve a 0 en el mismo paso: su PNG ya no existe, así que la UI
  // no debe pedirlo.
  await db
    .prepare(
      `UPDATE custom_prints SET files_deleted = 1, preview = 0, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(id)
    .run();
  return true;
}

// La clave de R2 y el claim son internos: el dashboard no los necesita.
export function shapeCustomPrint(row: CustomPrintRow, progressPct: number | null = null) {
  return {
    id: row.id,
    file_name: row.file_name,
    size_bytes: row.size_bytes,
    material: row.material,
    color_id: row.color_id,
    color_hex: row.color_hex,
    supports: row.supports,
    orient: row.orient,
    status: row.status,
    est_seconds: row.est_seconds,
    est_grams: row.est_grams,
    preview: row.preview === 1,
    files_deleted: row.files_deleted === 1,
    message: row.message,
    print_job_id: row.print_job_id,
    progress_pct: progressPct,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
