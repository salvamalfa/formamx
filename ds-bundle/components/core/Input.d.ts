/** Campo de texto (o textarea con multiline). Foco verde bosque con halo suave. */
export interface InputProps {
  label?: string;
  /** Texto de ayuda bajo el campo */
  hint?: string;
  placeholder?: string;
  multiline?: boolean;
  value?: string;
  onChange?: (e: any) => void;
}
export declare function Input(props: InputProps): JSX.Element;
