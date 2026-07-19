// Avatar de iniciales con color determinista por llave de persona. Los pares
// bg/color son los del mockup del CRM (crema/naranja, verde, mostaza): la
// misma persona siempre cae en el mismo par, así el color es memoria visual y
// no ruido.
const PALETAS: { bg: string; color: string }[] = [
  { bg: '#F2D9BC', color: '#B5541E' },
  { bg: '#E4EAE0', color: '#2F4632' },
  { bg: '#F3E3BE', color: '#8A6510' },
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export interface Avatar {
  iniciales: string;
  bg: string;
  color: string;
}

export function avatarDe(nombre: string, key: string): Avatar {
  const iniciales =
    (nombre || '·')
      .trim()
      .split(/\s+/)
      .map((w) => w[0] ?? '')
      .slice(0, 2)
      .join('')
      .toUpperCase() || '·';
  const pal = PALETAS[hash(key) % PALETAS.length];
  return { iniciales, bg: pal.bg, color: pal.color };
}
