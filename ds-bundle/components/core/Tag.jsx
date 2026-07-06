import React from 'react';

export function Tag({ tone = 'neutral', children, style, ...rest }) {
  const tones = {
    neutral: { background: 'var(--crema-oscuro)', color: 'var(--text-muted)' },
    bosque: { background: 'var(--support-soft)', color: 'var(--support)' },
    mostaza: { background: 'var(--highlight-soft)', color: '#8A6415' },
    naranja: { background: 'var(--naranja-claro)', color: 'var(--naranja-oscuro)' },
    tinta: { background: 'var(--surface-inverse)', color: 'var(--text-inverse)' },
  };
  return React.createElement('span', {
    ...rest,
    style: {
      fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
      padding: '5px 12px', borderRadius: 'var(--radius-pill)',
      display: 'inline-flex', alignItems: 'center', gap: 6, lineHeight: 1.2,
      ...tones[tone], ...style,
    },
  }, children);
}
