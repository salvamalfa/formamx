/**
 * Tarjeta de proyecto de la bitácora: foto, metadata mono, título Alan Sans, nota honesta y tags de material.
 * @startingPoint section="Componentes" subtitle="Tarjeta de proyecto con foto y metadata" viewport="700x420"
 */
export interface ProjectCardProps {
  /** Ruta de la foto (luz natural, pieza en uso) */
  image?: string;
  /** Sin foto aún: texto del bloque placeholder («foto pendiente») */
  placeholder?: string;
  /** Metadata: ['Proyecto 001', '2026.04', 'Pino'] */
  meta?: string[];
  title: string;
  /** Una frase honesta del proceso, no copy de venta */
  note?: string;
  /** Materiales/categorías en minúsculas. El color del tag se elige solo: naranja para materiales de taller, azul para técnico/digital, verde para el resto. */
  tags?: string[];
  /** Muestra el sello «pieza única» */
  unique?: boolean;
  /** Modo noche: tarjeta tinta, título blanco, tags en tonos oscuros */
  dark?: boolean;
  onClick?: () => void;
}
export declare function ProjectCard(props: ProjectCardProps): JSX.Element;
