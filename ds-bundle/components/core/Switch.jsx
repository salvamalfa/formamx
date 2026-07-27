import React from 'react';

export function Switch({ label, checked, defaultChecked = false, onChange, style }) {
  const [internal, setInternal] = React.useState(defaultChecked);
  const isOn = checked !== undefined ? checked : internal;
  const toggle = () => { if (checked === undefined) setInternal(!isOn); onChange && onChange(!isOn); };
  return React.createElement('label', {
    style: { display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-body)', ...style },
    onClick: (e) => { e.preventDefault(); toggle(); },
  },
    React.createElement('span', {
      style: {
        width: 40, height: 24, borderRadius: 'var(--radius-pill)', flexShrink: 0,
        background: isOn ? 'var(--accent)' : 'var(--borde)',
        border: '1px solid ' + (isOn ? 'var(--accent)' : 'var(--border-strong)'),
        boxSizing: 'border-box', position: 'relative',
        transition: 'background var(--duration-fast) var(--ease-out)',
      },
    }, React.createElement('span', {
      style: {
        position: 'absolute', top: 2, left: isOn ? 18 : 2, width: 18, height: 18,
        borderRadius: '50%', background: 'var(--blanco)',
        boxShadow: '0 1px 2px rgba(26,26,24,0.2)',
        transition: 'left var(--duration-fast) var(--ease-out)',
      },
    })),
    label
  );
}
