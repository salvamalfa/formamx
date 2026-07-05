// Genera en build el manifest de imágenes optimizadas del configurador.
// Solo puede importarse desde código de servidor (frontmatter .astro):
// astro:assets no existe en el cliente. El island recibe el manifest como prop.
import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';
import type { LampImageManifest } from '../config/lamps';

const WIDTHS = [800, 1400, 2048];

const sources = import.meta.glob<{ default: ImageMetadata }>(
  '../assets/lamps/**/*.png'
);

// '../assets/lamps/pantalla/TesseraLamp_Pantalla_Azul.png' -> 'pantalla/TesseraLamp_Pantalla_Azul'
const keyFromPath = (path: string): string =>
  path.replace('../assets/lamps/', '').replace(/\.png$/, '');

export async function buildLampImageManifest(): Promise<LampImageManifest> {
  const manifest: LampImageManifest = {};

  for (const [path, load] of Object.entries(sources)) {
    const { default: meta } = await load();
    const image = await getImage({
      src: meta,
      widths: WIDTHS,
      format: 'webp',
      quality: 85,
    });
    manifest[keyFromPath(path)] = {
      src: image.src,
      srcset: image.srcSet.attribute,
    };
  }

  return manifest;
}
