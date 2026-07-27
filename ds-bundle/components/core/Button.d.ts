/**
 * Botón de forma. Pill, Alan Sans 700. Hover oscurece; press oscurece un paso más. Nunca encoge.
 * @startingPoint section="Componentes" subtitle="Botón pill en 4 variantes" viewport="700x220"
 */
export interface ButtonProps {
  /** 'primary' azul taller (acción principal, máx 1 por vista) · 'support' verde bosque · 'secondary' borde · 'ghost' texto */
  variant?: 'primary' | 'support' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  children?: React.ReactNode;
  onClick?: () => void;
}
export declare function Button(props: ButtonProps): JSX.Element;
