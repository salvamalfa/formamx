// Lista de trabajos de la bitácora, en orden del más reciente al más viejo.
// La usan la portada (columna "forma" muestra el primero), /trabajos y la
// columna "Trabajos" del menú. Cuando haya una pieza nueva se agrega aquí.
import type { ImageMetadata } from 'astro';
import sillaJardin from '../assets/photos/banca.jpeg';
import lampBase from '../assets/lamps/base/TesseraLamp_CuerpoTapa_Azul.png';
import lampShade from '../assets/lamps/pantalla/TesseraLamp_Pantalla_Azul.png';

export interface Trabajo {
  titulo: string;
  /** Línea corta bajo la imagen: material, fecha, estado. */
  pie: string;
  /** Nota de bitácora, una frase. */
  nota: string;
  meta: string[];
  href?: string;
  /** Foto real de la pieza. */
  imagen?: ImageMetadata;
  imagenAlt?: string;
  /** Render por capas (lámparas): se apilan en orden sobre fondo hueso. */
  capas?: ImageMetadata[];
  /** Texto del hueco cuando todavía no hay imagen. */
  placeholder?: string;
  /** Proporción del recuadro, ancho/alto. */
  ratio: string;
}

export const trabajos: Trabajo[] = [
  {
    titulo: 'Silla de jardín',
    pie: 'Pino, 2026. Pieza única.',
    nota: 'La primera capa quedó chueca. La segunda, mejor.',
    meta: ['Proyecto 001', '2026.04', 'Pino'],
    href: '/banca',
    imagen: sillaJardin,
    imagenAlt: 'Silla de jardín al sol, en pino',
    ratio: '4 / 5',
  },
  {
    titulo: 'Lámpara Tessera',
    pie: 'PLA, en proceso.',
    nota: 'Tercer intento del difusor. Los dos primeros se doblaron.',
    meta: ['Proyecto 002', 'En proceso', 'PLA'],
    href: '/lampara',
    capas: [lampBase, lampShade],
    imagenAlt: 'Lámpara Tessera azul',
    ratio: '1 / 1',
  },
  {
    titulo: 'Video: el jardín en junio',
    pie: 'Pronto.',
    nota: 'Grabando las tardes. Sin guion, con pájaros.',
    meta: ['Proyecto 003', 'Pronto'],
    placeholder: 'Grabando',
    ratio: '16 / 10',
  },
];
