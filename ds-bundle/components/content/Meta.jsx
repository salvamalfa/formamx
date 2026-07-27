import React from 'react';

export function Meta({ items = [], tone = 'azul', separator = ' — ', style }) {
  const colors = { azul: 'var(--azul)', muted: 'var(--text-muted)', noche: 'var(--azul-noche)' };
  return React.createElement('div', {
    style: {
      fontFamily: 'var(--font-meta)', fontSize: 'var(--meta-size)',
      fontWeight: 'var(--meta-weight)', letterSpacing: 'var(--meta-tracking)',
      textTransform: 'uppercase', color: colors[tone] || colors.azul, ...style,
    },
  }, items.join(separator));
}
