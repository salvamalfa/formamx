/** Línea de metadata en Alan Sans Bold, MAYÚSCULAS con tracking amplio: PROYECTO 001 — 2026.04 — PINO. El hilo conductor de la bitácora. */
export interface MetaProps {
  /** Piezas de la línea, p. ej. ['Proyecto 001', '2026.04', 'Pino'] */
  items: string[];
  /** 'azul' (default) · 'muted' gris · 'noche' (sobre fondo tinta) */
  tone?: 'azul' | 'muted' | 'noche';
  /** Separador, default ' — ' */
  separator?: string;
}
export declare function Meta(props: MetaProps): JSX.Element;
