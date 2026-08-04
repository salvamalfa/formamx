/**
 * Botón de forma. Pill, Alan Sans 700. Hover oscurece; press oscurece un paso más. Nunca encoge.
 */
export interface ButtonProps {
  /** 'primary' naranja taller (la acción de la vista, máx 1) · 'secondary' azul pleno · 'tertiary' contorno azul sobre blanco · 'support' verde bosque (afuera) · 'ghost' solo texto azul */
  variant?: 'primary' | 'secondary' | 'tertiary' | 'support' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  children?: React.ReactNode;
  onClick?: () => void;
}
export declare function Button(props: ButtonProps): JSX.Element;
