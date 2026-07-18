import { call } from './http';

export interface ChecklistItem {
  id: string;
  label: string;
}

// Las definiciones viven en el worker (lib/calidad.ts) y el panel las pinta
// tal cual: UI y validación nunca divergen.
export type Checklists = Record<'impresion_3d' | 'manual', ChecklistItem[]>;

export interface QcRegistro {
  id: string;
  order_id: string;
  print_job_id: string | null;
  // pantalla|cuerpo|tapa; null = pieza completa.
  part: string | null;
  checklist: Record<string, boolean>;
  // Veredicto calculado por el worker (todos los items en true).
  passed: boolean;
  notes: string | null;
  created_at: string;
  // Resumen del pedido que el worker adjunta por JOIN; null si responde un
  // worker anterior al módulo.
  pedido: { id: string; product_id: string | null; customer_name: string | null } | null;
}

// Normalizaciones por si responde un worker anterior al módulo.
const normalizeRegistro = (r: QcRegistro): QcRegistro => ({
  ...r,
  print_job_id: r.print_job_id ?? null,
  part: r.part ?? null,
  checklist: r.checklist ?? {},
  passed: r.passed === true,
  notes: r.notes ?? null,
  pedido: r.pedido ?? null,
});

export const getChecklists = (token: string) =>
  call<{ checklists: Checklists }>(token, '/calidad/checklists').then((r) => ({
    impresion_3d: r.checklists?.impresion_3d ?? [],
    manual: r.checklists?.manual ?? [],
  }));

export const getRegistros = (token: string, orderId?: string) =>
  call<{ registros: QcRegistro[] }>(
    token,
    `/calidad${orderId ? `?order_id=${encodeURIComponent(orderId)}` : ''}`,
  ).then((r) => (r.registros ?? []).map(normalizeRegistro));

export const createRegistro = (
  token: string,
  data: {
    order_id: string;
    checklist: Record<string, boolean>;
    part?: string;
    print_job_id?: string;
    notes?: string;
  },
) =>
  call<QcRegistro>(token, '/calidad', { method: 'POST', body: JSON.stringify(data) }).then(
    normalizeRegistro,
  );
