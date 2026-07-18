// Control de calidad (tabla qc_registros, migración 0013). Las DEFINICIONES
// de los checklists viven aquí, en código, indexadas por products.production;
// D1 solo guarda los resultados de cada revisión. Los registros son
// inmutables (repetir la revisión = fila nueva) y `passed` SIEMPRE se
// calcula en el worker a partir de las respuestas — cualquier `passed` que
// mande el cliente se ignora.

export interface ChecklistItem {
  id: string;
  label: string;
}

export const CHECKLISTS: Record<'impresion_3d' | 'manual', ChecklistItem[]> = {
  impresion_3d: [
    { id: 'capas', label: 'Capas uniformes, sin saltos ni hilos' },
    { id: 'warping', label: 'Sin warping ni esquinas levantadas' },
    { id: 'encaje', label: 'Pantalla, cuerpo y tapa encajan sin forzar' },
    { id: 'colores', label: 'Colores según el pedido' },
    { id: 'electrico', label: 'Socket y cable probados, enciende' },
  ],
  manual: [
    { id: 'acabado', label: 'Lijado y acabado uniformes' },
    { id: 'estructura', label: 'Estable, sin juego en las uniones' },
    { id: 'medidas', label: 'Medidas según la ficha' },
  ],
};

// Valida las respuestas contra el checklist del tipo de producción: null si
// falta algún item o hay un valor no booleano. Si es válido devuelve el
// veredicto — aprobada solo cuando TODOS los items están en true.
export function validateChecklist(
  production: 'impresion_3d' | 'manual',
  checklist: unknown,
): { passed: boolean } | null {
  if (typeof checklist !== 'object' || checklist === null || Array.isArray(checklist)) {
    return null;
  }
  const respuestas = checklist as Record<string, unknown>;
  let passed = true;
  for (const item of CHECKLISTS[production]) {
    const valor = respuestas[item.id];
    if (typeof valor !== 'boolean') return null;
    if (!valor) passed = false;
  }
  return { passed };
}

export interface QcRow {
  id: string;
  order_id: string;
  print_job_id: string | null;
  part: string | null;
  checklist_json: string;
  passed: number;
  notes: string | null;
  created_at: string;
}

// Parse tolerante: un checklist_json corrupto no tira la lista (misma
// política que shapePieza en lib/inventario.ts).
function parseChecklist(raw: string): Record<string, boolean> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, boolean>)
      : {};
  } catch {
    return {};
  }
}

export function shapeQc(row: QcRow) {
  return {
    id: row.id,
    order_id: row.order_id,
    print_job_id: row.print_job_id,
    part: row.part,
    checklist: parseChecklist(row.checklist_json),
    passed: row.passed === 1,
    notes: row.notes,
    created_at: row.created_at,
  };
}
