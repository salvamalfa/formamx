import { API_BASE } from '../../config/api';
import { call } from './http';

// Piezas STL que mandan los clientes: se suben aquí, las rebana el agente y
// se mandan a imprimir desde /taller. Plan en docs/STL_CLIENTES.md.

export type CustomPrintStatus =
  | 'subido'
  | 'en_cola'
  | 'rebanando'
  | 'listo'
  | 'imprimiendo'
  | 'terminado'
  | 'fallido'
  | 'cancelado'
  // Lápida del borrado: solo se ve si la limpieza del archivo quedó a medias.
  | 'borrado';

// Las dos vistas del tablero. Se piden por separado al worker: el listado va
// topado, así que filtrar en el navegador escondería piezas pendientes viejas
// detrás de las terminadas.
export type CustomPrintScope = 'pendientes' | 'historico';

export interface CustomPrintCounts {
  pendientes: number;
  historico: number;
}

export interface CustomPrint {
  id: string;
  file_name: string;
  size_bytes: number;
  // 'stl' o '3mf' (proyecto de Bambu Studio, "Guardar proyecto"): un 3mf ya
  // trae soportes y orientación resueltos, así que su rebanado no ofrece
  // esas dos opciones.
  formato: 'stl' | '3mf';
  material: string | null;
  color_id: string | null;
  color_hex: string | null;
  supports: string | null;
  orient: string | null;
  status: CustomPrintStatus;
  est_seconds: number | null;
  est_grams: number | null;
  // Costo/precio calculados al rebanar (Fase 3e); NULL hasta el primer
  // rebanado exitoso. price_override_mxn manda sobre price_mxn cuando Salva
  // edita el precio a mano desde el desglose.
  cost_mxn: number | null;
  price_mxn: number | null;
  price_override_mxn: number | null;
  cost_breakdown: CostBreakdown | null;
  preview: boolean;
  message: string | null;
  print_job_id: string | null;
  progress_pct: number | null;
  // Estado del trabajo en la cola física de la impresora. Mientras la pieza
  // está en 'imprimiendo', el trabajo puede seguir 'queued' (esperando turno)
  // o 'claimed' (el agente ya se lo llevó): sin esto el tablero decía
  // "Imprimiendo" desde el clic, aunque la impresora ni hubiera arrancado.
  job_status: 'queued' | 'claimed' | 'printing' | 'done' | 'failed' | 'canceled' | null;
  created_at: string;
  updated_at: string;
}

export interface CostBreakdown {
  material_mxn: number;
  luz_mxn: number;
  mano_obra_mxn: number;
  amortizacion_mxn: number;
  total_mxn: number;
  material_source: 'bobina' | 'fallback';
  amortizada: boolean;
}

export interface OpcionesRebanado {
  material: string;
  color_id: string;
  color_hex?: string | null;
  supports?: 'auto' | 'no';
  orient?: 'auto' | 'original';
}

// Tolerancia hacia atrás por si responde un worker anterior al módulo.
const normalize = (p: CustomPrint): CustomPrint => ({
  ...p,
  formato: p.formato ?? 'stl',
  material: p.material ?? null,
  color_id: p.color_id ?? null,
  color_hex: p.color_hex ?? null,
  supports: p.supports ?? null,
  orient: p.orient ?? null,
  est_seconds: p.est_seconds ?? null,
  est_grams: p.est_grams ?? null,
  cost_mxn: p.cost_mxn ?? null,
  price_mxn: p.price_mxn ?? null,
  price_override_mxn: p.price_override_mxn ?? null,
  cost_breakdown: p.cost_breakdown ?? null,
  preview: p.preview ?? false,
  message: p.message ?? null,
  print_job_id: p.print_job_id ?? null,
  progress_pct: p.progress_pct ?? null,
  job_status: p.job_status ?? null,
});

export const getCustomPrints = (token: string, scope?: CustomPrintScope) =>
  call<{ prints: CustomPrint[]; counts?: CustomPrintCounts }>(
    token,
    scope ? `/custom-prints?scope=${scope}` : '/custom-prints',
  ).then((r) => ({
    prints: (r.prints ?? []).map(normalize),
    // Un worker anterior a los conteos no los manda; entonces las pestañas se
    // quedan sin cifra en vez de inventar una a partir de la página recortada.
    counts: r.counts ?? null,
  }));

export const rebanarPrint = (token: string, id: string, opciones: OpcionesRebanado) =>
  call<CustomPrint>(token, `/custom-prints/${id}/rebanar`, {
    method: 'POST',
    body: JSON.stringify(opciones),
  }).then(normalize);

export const imprimirPrint = (token: string, id: string) =>
  call<CustomPrint>(token, `/custom-prints/${id}/imprimir`, { method: 'POST' }).then(normalize);

export const cancelarPrint = (token: string, id: string) =>
  call<CustomPrint>(token, `/custom-prints/${id}/cancelar`, { method: 'POST' }).then(normalize);

// Sobrescribe el precio de la pieza (desglose "›" en la tarjeta).
// `undefined`/`null` limpia la sobrescritura y vuelve a mostrar price_mxn.
export const patchPrintPrecio = (token: string, id: string, price_override_mxn: number | null) =>
  call<CustomPrint>(token, `/custom-prints/${id}/precio`, {
    method: 'PATCH',
    body: JSON.stringify({ price_override_mxn }),
  }).then(normalize);

export const borrarPrint = (token: string, id: string) =>
  call<{ ok: boolean }>(token, `/custom-prints/${id}`, { method: 'DELETE' });

// La subida NO pasa por call(): el cuerpo es el archivo crudo (no JSON) y hace
// falta el progreso, que fetch no expone de forma portable. Los errores se
// mantienen iguales a los de call() para que la UI los trate igual.
export function uploadCustomPrint(
  token: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<CustomPrint> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `${API_BASE}/api/admin/custom-prints?filename=${encodeURIComponent(file.name)}`;
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener('load', () => {
      if (xhr.status === 401) return reject(new Error('no_autorizado'));
      if (xhr.status < 200 || xhr.status >= 300) return reject(new Error(`error_${xhr.status}`));
      try {
        resolve(normalize(JSON.parse(xhr.responseText) as CustomPrint));
      } catch {
        reject(new Error('respuesta_invalida'));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('error_red')));
    xhr.send(file);
  });
}

// La imagen del plato va autenticada, así que no se puede colgar de un <img
// src>: se baja y se convierte en blob URL. Quien la use debe revocarla.
export async function getPreviewUrl(token: string, id: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/admin/custom-prints/${id}/preview`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error('no_autorizado');
  if (!res.ok) throw new Error(`error_${res.status}`);
  return URL.createObjectURL(await res.blob());
}
