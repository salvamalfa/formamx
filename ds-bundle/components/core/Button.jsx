import React from 'react';

export function Button({ variant = 'primary', size = 'md', disabled = false, children, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  const [press, setPress] = React.useState(false);
  const pad = size === 'sm' ? '8px 16px' : size === 'lg' ? '14px 28px' : '11px 22px';
  const fontSize = size === 'sm' ? 13 : size === 'lg' ? 16 : 14;
  const variants = {
    primary: {
      background: press ? 'var(--azul-oscuro)' : hover ? 'var(--accent-hover)' : 'var(--accent)',
      color: 'var(--accent-contrast)', border: 'none',
    },
    support: {
      background: press || hover ? 'var(--support-hover)' : 'var(--support)',
      color: 'var(--blanco)', border: 'none',
    },
    secondary: {
      background: hover ? 'var(--hueso)' : 'transparent',
      color: 'var(--text-body)', border: '1.5px solid var(--border-strong)',
    },
    ghost: {
      background: hover ? 'var(--hueso)' : 'transparent',
      color: 'var(--text-body)', border: 'none',
    },
  };
  return React.createElement('button', {
    ...rest,
    disabled,
    onMouseEnter: (e) => { setHover(true); rest.onMouseEnter && rest.onMouseEnter(e); },
    onMouseLeave: (e) => { setHover(false); setPress(false); rest.onMouseLeave && rest.onMouseLeave(e); },
    onMouseDown: (e) => { setPress(true); rest.onMouseDown && rest.onMouseDown(e); },
    onMouseUp: (e) => { setPress(false); rest.onMouseUp && rest.onMouseUp(e); },
    style: {
      fontFamily: 'var(--font-body)', fontWeight: 700, fontSize, padding: pad,
      borderRadius: 'var(--radius-pill)', cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.45 : 1, transition: 'background var(--duration-fast) var(--ease-out)',
      display: 'inline-flex', alignItems: 'center', gap: 8, lineHeight: 1.2,
      ...variants[variant], ...style,
    },
  }, children);
}
