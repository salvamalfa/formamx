import React from 'react';

export function Meta({ items = [], tone = 'bosque', separator = ' — ', style }) {
  const colors = { bosque: 'var(--support)', muted: 'var(--text-muted)', crema: 'var(--naranja-claro)' };
  return React.createElement('div', {
    style: {
      fontFamily: 'var(--font-mono)', fontSize: 'var(--meta-size)',
      letterSpacing: 'var(--meta-tracking)', textTransform: 'uppercase',
      color: colors[tone] || colors.bosque, ...style,
    },
  }, items.join(separator));
}
