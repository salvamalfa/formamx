import React from 'react';

export function Tag({ tone = 'neutral', children, style, ...rest }) {
  const tones = {
    neutral: { background: 'var(--hueso)', color: 'var(--text-muted)' },
    azul: { background: 'var(--azul-claro)', color: 'var(--azul-oscuro)' },
    taller: { background: 'var(--naranja-claro)', color: 'var(--naranja-oscuro)' },
    bosque: { background: 'var(--bosque-claro)', color: 'var(--bosque)' },
    tinta: { background: 'var(--surface-inverse)', color: 'var(--text-inverse)' },
    blanco: { background: 'var(--blanco)', color: 'var(--tinta)' },
    // Variantes para tarjetas y secciones en tinta (modo noche)
    'neutral-noche': { background: '#262623', color: 'var(--gris-claro)' },
    'azul-noche': { background: '#1E2A33', color: 'var(--azul-noche)' },
    'taller-noche': { background: 'var(--naranja-sombra)', color: 'var(--naranja-noche)' },
    'bosque-noche': { background: 'var(--bosque-sombra)', color: 'var(--bosque-noche)' },
  };
  return React.createElement('span', {
    ...rest,
    style: {
      fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
      padding: '5px 12px', borderRadius: 'var(--radius-pill)',
      display: 'inline-flex', alignItems: 'center', gap: 6, lineHeight: 1.2,
      whiteSpace: 'nowrap', flexShrink: 0,
      ...tones[tone], ...style,
    },
  }, children);
}
