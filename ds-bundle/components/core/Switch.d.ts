/** Interruptor pill; encendido en azul taller. */
export interface SwitchProps {
  label?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
}
export declare function Switch(props: SwitchProps): JSX.Element;
