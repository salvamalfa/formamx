import type { Order, PrintJob } from '../../../lib/taller';

// El paso en_cola→imprimiendo solo lo usan a mano los pedidos que no pasan
// por la impresora (p. ej. la banca): para ellos "imprimiendo" se presenta
// como "En progreso". Los pedidos 3D avanzan solos cuando el agente imprime.
export const NEXT_STEP: Record<string, { status: string; label: string }> = {
  pagada: { status: 'en_cola', label: 'A la cola' },
  en_cola: { status: 'imprimiendo', label: 'Empezar' },
  imprimiendo: { status: 'lista', label: 'Marcar lista' },
  lista: { status: 'enviada', label: 'Marcar enviada' },
};

export const STATUS_LABEL: Record<string, string> = {
  pendiente: 'Pendiente de pago',
  pagada: 'Pagada',
  en_cola: 'En cola',
  imprimiendo: 'Imprimiendo',
  lista: 'Lista',
  enviada: 'Enviada',
  cancelada: 'Cancelada',
};

// Estado visible según el tipo de pieza: lo que en una lámpara es
// "Imprimiendo", en una pieza manual (madera) es simplemente "En progreso".
export function statusLabel(order: Order): string {
  if (order.production === 'manual' && order.status === 'imprimiendo') return 'En progreso';
  return STATUS_LABEL[order.status] ?? order.status;
}

export const JOB_STATUS_LABEL: Record<PrintJob['status'], string> = {
  queued: 'en cola',
  claimed: 'preparando',
  printing: 'imprimiendo',
  done: 'lista',
  failed: 'falló',
  canceled: 'cancelado',
};

export const PART_LABEL: Record<PrintJob['part'], string> = {
  pantalla: 'Pantalla',
  cuerpo: 'Cuerpo',
  tapa: 'Tapa',
};
