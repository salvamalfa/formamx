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

// Reinicia un ajuste manual (p. ej. "Quitar ajuste" de precio): flecha
// circular en sentido contrario a IconRebanar, mismo lenguaje visual.
export function IconReiniciar({ class: className }: IconProps) {
  return (
    <svg {...base} class={className} aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 4v5h-5" />
    </svg>
  );
}

export function IconEditar({ class: className }: IconProps) {
  return (
    <svg {...base} class={className} aria-hidden="true">
      <path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
      <path d="M18.4 2.6a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z" />
    </svg>
  );
}

export function IconGuardar({ class: className }: IconProps) {
  return (
    <svg {...base} class={className} aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function IconAjustes({ class: className }: IconProps) {
  return (
    <svg {...base} class={className} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}
