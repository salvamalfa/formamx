/** Etiqueta pill para materiales, estados y categorías («madera», «en proceso», «pieza única»). Siempre minúsculas salvo TINTA para sellos. */
export interface TagProps {
  /** 'neutral' crema · 'bosque' materiales/éxito · 'mostaza' en proceso · 'naranja' destacado · 'tinta' sello (pieza única) */
  tone?: 'neutral' | 'bosque' | 'mostaza' | 'naranja' | 'tinta';
  children?: React.ReactNode;
}
export declare function Tag(props: TagProps): JSX.Element;
