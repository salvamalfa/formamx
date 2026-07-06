import React from 'react';
import { Meta } from './Meta.jsx';
import { Tag } from '../core/Tag.jsx';

export function ProjectCard({ image, placeholder, meta = [], title, note, tags = [], unique = false, onClick, style }) {
  const [hover, setHover] = React.useState(false);
  return React.createElement('article', {
    onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      background: 'var(--surface-card)', borderRadius: 'var(--radius-m)', overflow: 'hidden',
      boxShadow: hover ? 'var(--shadow-raised)' : 'var(--shadow-card)',
      transition: 'box-shadow var(--duration-slow) var(--ease-out)',
      cursor: onClick ? 'pointer' : 'default', fontFamily: 'var(--font-body)',
      display: 'flex', flexDirection: 'column', ...style,
    },
  },
    image ? React.createElement('img', { src: image, alt: title, style: { width: '100%', height: 210, objectFit: 'cover', display: 'block' } })
      : placeholder ? React.createElement('div', { style: { width: '100%', height: 210, background: 'var(--crema-oscuro)', display: 'grid', placeItems: 'center' } },
          React.createElement('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-faint)' } }, placeholder)
        ) : null,
    React.createElement('div', { style: { padding: '18px 20px 20px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 } },
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 } },
        meta.length > 0 && React.createElement(Meta, { items: meta }),
        unique && React.createElement(Tag, { tone: 'tinta' }, 'pieza única')
      ),
      React.createElement('h3', { style: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--display-sm)', lineHeight: 'var(--leading-display)', color: 'var(--text-body)', margin: 0 } }, title),
      note && React.createElement('p', { style: { fontSize: 'var(--text-sm)', lineHeight: 'var(--leading-body)', color: 'var(--text-muted)', margin: 0 } }, note),
      tags.length > 0 && React.createElement('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto', paddingTop: 6 } },
        tags.map((t, i) => React.createElement(Tag, { key: i, tone: 'bosque' }, t))
      )
    )
  );
}
