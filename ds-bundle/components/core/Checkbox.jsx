import React from 'react';

export function Checkbox({ label, checked, defaultChecked = false, onChange, style }) {
  const [internal, setInternal] = React.useState(defaultChecked);
  const isOn = checked !== undefined ? checked : internal;
  const toggle = () => { if (checked === undefined) setInternal(!isOn); onChange && onChange(!isOn); };
  return React.createElement('label', {
    style: { display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-body)', ...style },
    onClick: (e) => { e.preventDefault(); toggle(); },
  },
    React.createElement('span', {
      style: {
        width: 20, height: 20, borderRadius: 6, flexShrink: 0, boxSizing: 'border-box',
        border: isOn ? 'none' : '1.5px solid var(--border-strong)',
        background: isOn ? 'var(--accent)' : 'var(--blanco)',
        display: 'grid', placeItems: 'center',
        transition: 'background var(--duration-fast) var(--ease-out)',
      },
    }, isOn ? React.createElement('svg', { width: 12, height: 12, viewBox: '0 0 12 12' },
      React.createElement('path', { d: 'M2 6.5L5 9.5L10 3', stroke: 'var(--blanco)', strokeWidth: 2, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' })
    ) : null),
    label
  );
}
