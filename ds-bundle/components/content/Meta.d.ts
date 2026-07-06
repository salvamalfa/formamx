/** Línea de metadata mono en mayúsculas: PROYECTO 001 — 2026.04 — PINO. El hilo conductor de la bitácora. */
export interface MetaProps {
  /** Piezas de la línea, p. ej. ['Proyecto 001', '2026.04', 'Pino'] */
  items: string[];
  /** 'bosque' (default) · 'muted' · 'crema' (sobre fondos oscuros) */
  tone?: 'bosque' | 'muted' | 'crema';
  /** Separador, default ' — ' */
  separator?: string;
}
export declare function Meta(props: MetaProps): JSX.Element;
