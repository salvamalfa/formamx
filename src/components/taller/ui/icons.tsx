// Set mínimo de iconos UI (trazo 2px redondeado, estilo Lucide) insertados en
// línea: nada de CDN externo, así no dependemos de una petición en runtime
// para tres iconos que casi no cambian. Ver ds-bundle/readme.md § ICONOGRAPHY.

interface IconProps {
  class?: string;
}

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '2',
  'stroke-linecap': 'round' as const,
  'stroke-linejoin': 'round' as const,
};

export function IconUpload({ class: className }: IconProps) {
  return (
    <svg {...base} class={className} aria-hidden="true">
      <path d="M12 3v12" />
      <path d="m7 8 5-5 5 5" />
      <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </svg>
  );
}

export function IconRebanar({ class: className }: IconProps) {
  return (
    <svg {...base} class={className} aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  );
}

export function IconBorrar({ class: className }: IconProps) {
  return (
    <svg {...base} class={className} aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M18 7v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7" />
      <path d="M8 7V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}
