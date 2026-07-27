// Tono de cada etiqueta, réplica de `tagTone` en el brand kit
// (ds-bundle/components/content/ProjectCard.jsx). Un color por trabajo:
// naranja para materiales y oficio, azul para lo técnico, bosque para lo que
// vive afuera. Devuelve el sufijo de la clase `.tag-*` de brand.css.

const MATERIALES = [
  'madera', 'pino', 'roble', 'nogal', 'barro', 'arcilla', 'cerámica',
  'metal', 'acero', 'latón', 'tela', 'cuero', 'barniz',
];

const TECNICO = [
  'impresión 3d', '3d', 'pla', 'resina', 'código', 'edge ai', 'electrónica',
  'video', 'música', 'audio', 'luz', 'lámpara', 'difusor',
];

export type TagTone = 'taller' | 'azul' | 'bosque';

export function tagTone(t: string): TagTone {
  const s = String(t).toLowerCase();
  if (MATERIALES.some((m) => s.includes(m))) return 'taller';
  if (TECNICO.some((m) => s.includes(m))) return 'azul';
  return 'bosque';
}

/** Clase completa de la etiqueta; en modo noche usa la variante `-noche`. */
export function tagClass(t: string, dark = false): string {
  return `tag tag-${tagTone(t)}${dark ? '-noche' : ''}`;
}
