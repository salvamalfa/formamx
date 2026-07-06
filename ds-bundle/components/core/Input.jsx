import React from 'react';

export function Input({ label, hint, multiline = false, style, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  const field = React.createElement(multiline ? 'textarea' : 'input', {
    ...rest,
    onFocus: (e) => { setFocus(true); rest.onFocus && rest.onFocus(e); },
    onBlur: (e) => { setFocus(false); rest.onBlur && rest.onBlur(e); },
    style: {
      fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--text-body)',
      background: 'var(--blanco)', width: '100%', boxSizing: 'border-box',
      border: focus ? '1.5px solid var(--support)' : '1.5px solid var(--border-strong)',
      outline: focus ? '3px solid var(--support-soft)' : 'none',
      borderRadius: 'var(--radius-s)', padding: '11px 14px',
      minHeight: multiline ? 96 : undefined, resize: multiline ? 'vertical' : undefined,
      transition: 'border-color var(--duration-fast) var(--ease-out)',
      ...style,
    },
  });
  return React.createElement('label', { style: { display: 'block', fontFamily: 'var(--font-body)' } },
    label && React.createElement('div', { style: { fontSize: 13, fontWeight: 600, color: 'var(--text-body)', marginBottom: 6 } }, label),
    field,
    hint && React.createElement('div', { style: { fontSize: 12, color: 'var(--text-faint)', marginTop: 6 } }, hint)
  );
}
