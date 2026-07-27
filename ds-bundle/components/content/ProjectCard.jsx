import React from 'react';
import { Meta } from './Meta.jsx';
import { Tag } from '../core/Tag.jsx';

const MATERIALES = ['madera', 'pino', 'roble', 'nogal', 'barro', 'arcilla', 'cerámica', 'metal', 'acero', 'latón', 'tela', 'cuero', 'barniz'];
const TECNICO = ['impresión 3d', '3d', 'pla', 'resina', 'código', 'edge ai', 'electrónica', 'video', 'música', 'audio', 'luz', 'lámpara', 'difusor'];
export function tagTone(t) {
  const s = String(t).toLowerCase();
  if (MATERIALES.some(m => s.includes(m))) return 'taller';
  if (TECNICO.some(m => s.includes(m))) return 'azul';
  return 'bosque';
}

export function ProjectCard({ image, placeholder, meta = [], title, note, tags = [], unique = false, dark = false, onClick, style }) {
  const [hover, setHover] = React.useState(false);
  return React.createElement('article', {
    onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      background: dark ? 'var(--tinta)' : 'var(--surface-card)', borderRadius: 'var(--radius-m)', overflow: 'hidden',
      border: dark ? '1px solid ' + (hover ? '#43433D' : '#33332F') : '1px solid transparent',
      boxShadow: dark ? 'none' : (hover ? 'var(--shadow-raised)' : 'var(--shadow-card)'),
      transition: 'box-shadow var(--duration-slow) var(--ease-out), border-color var(--duration-slow) var(--ease-out)',
      cursor: onClick ? 'pointer' : 'default', fontFamily: 'var(--font-body)',
      display: 'flex', flexDirection: 'column', ...style,
    },
  },
    image ? React.createElement('img', { src: image, alt: title, style: { width: '100%', height: 210, objectFit: 'cover', display: 'block' } })
      : placeholder ? React.createElement('div', { style: { width: '100%', height: 210, background: dark ? '#26262300' : 'var(--hueso)', backgroundColor: dark ? '#242421' : 'var(--hueso)', borderBottom: dark ? '1px solid #33332F' : 'none', display: 'grid', placeItems: 'center' } },
          React.createElement('span', { style: { fontFamily: 'var(--font-meta)', fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: dark ? 'var(--gris)' : 'var(--text-faint)' } }, placeholder)
        ) : null,
    React.createElement('div', { style: { padding: '18px 20px 20px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 } },
      meta.length > 0 && React.createElement(Meta, { items: meta, tone: dark ? 'noche' : 'azul' }),
      React.createElement('h3', { style: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--display-sm)', lineHeight: 'var(--leading-display)', color: dark ? 'var(--blanco)' : 'var(--text-body)', margin: 0 } }, title),
      note && React.createElement('p', { style: { fontSize: 'var(--text-sm)', lineHeight: 'var(--leading-body)', color: dark ? 'var(--gris-claro)' : 'var(--text-muted)', margin: 0 } }, note),
      (tags.length > 0 || unique) && React.createElement('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 'auto', paddingTop: 8 } },
        tags.map((t, i) => React.createElement(Tag, { key: i, tone: tagTone(t) + (dark ? '-noche' : '') }, t)),
        unique && React.createElement(Tag, { tone: dark ? 'blanco' : 'tinta', style: { marginLeft: 'auto' } }, 'pieza única')
      )
    )
  );
}
