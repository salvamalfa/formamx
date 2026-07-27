/** Etiqueta pill para materiales, estados y categorías. El color dice de qué habla: naranja = material de taller, verde = exterior/naturaleza, azul = técnico/digital. */
export interface TagProps {
  /** 'neutral' hueso · 'taller' naranja (madera, barro, metal) · 'bosque' verde (exterior, naturaleza) · 'azul' técnico (3d, código, video) · 'tinta' sello (pieza única) · sufijo `-noche` para tarjetas sobre tinta, 'blanco' para el sello ahí */
  tone?: 'neutral' | 'taller' | 'bosque' | 'azul' | 'tinta' | 'blanco'
    | 'neutral-noche' | 'taller-noche' | 'bosque-noche' | 'azul-noche';
  children?: React.ReactNode;
}
export declare function Tag(props: TagProps): JSX.Element;
