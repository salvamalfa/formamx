import { call } from './http';
import type { PrintJob } from './pedidos';

// Un trabajo de la cola física de la impresora. Viene de un pedido de lámpara
// (order_id) o de una pieza STL de cliente (custom_print_id): es UNA sola
// cola, así que el tablero la pinta igual venga de donde venga.
export interface QueueJob extends PrintJob {
  custom_print_id: string | null;
  // Nombre del STL cuando el trabajo es de un cliente; null si es de lámpara.
  custom_file_name: string | null;
}

export const getQueue = (token: string) =>
  call<{ jobs: QueueJob[] }>(token, '/jobs').then((r) => r.jobs ?? []);

export interface Spool {
  slot: number;
  color_id: string | null;
  material: string | null;
  // Color exacto que reporta la impresora ('#RRGGBB'), tenga o no
  // correspondencia con el catálogo.
  color_hex: string | null;
  // Bobina del almacén (Inventario) vinculada a mano a esta ranura (0019).
  // NULL = sin vincular todavía: el peso restante se sigue mostrando "sin
  // datos" hasta que Salva la elija en /taller.
  bobina_id: string | null;
  bobina_weight_g: number | null;
  bobina_weight_left_g: number | null;
}

export const getSpools = (token: string) =>
  call<{ slots: Spool[] }>(token, '/spools').then((r) =>
    (r.slots ?? []).map((s) => ({
      ...s,
      bobina_id: s.bobina_id ?? null,
      bobina_weight_g: s.bobina_weight_g ?? null,
      bobina_weight_left_g: s.bobina_weight_left_g ?? null,
    })),
  );

export const linkSpoolBobina = (token: string, slot: number, bobina_id: string | null) =>
  call<{ slot: number; bobina_id: string | null }>(token, `/spools/${slot}`, {
    method: 'PATCH',
    body: JSON.stringify({ bobina_id }),
  });

export const getPrinter = (token: string) =>
  call<{ bed_clear: boolean; ams_synced_at: string | null }>(token, '/printer');

export const confirmBedClear = (token: string) =>
  call<{ bed_clear: boolean }>(token, '/printer/bed-clear', { method: 'POST' });
