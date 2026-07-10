import { call } from './http';

export interface Spool {
  slot: number;
  color_id: string | null;
  material: string | null;
  // Color exacto que reporta la impresora ('#RRGGBB'), tenga o no
  // correspondencia con el catálogo.
  color_hex: string | null;
}

export const getSpools = (token: string) =>
  call<{ slots: Spool[] }>(token, '/spools').then((r) => r.slots);

export const getPrinter = (token: string) =>
  call<{ bed_clear: boolean; ams_synced_at: string | null }>(token, '/printer');

export const confirmBedClear = (token: string) =>
  call<{ bed_clear: boolean }>(token, '/printer/bed-clear', { method: 'POST' });
