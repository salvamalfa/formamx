import { useEffect, useState } from 'preact/hooks';

// Router por hash del taller. Sin librería: el dashboard es una isla Preact y
// la URL se mantiene con `location.hash`. Formatos canónicos:
//   #resumen | #proyectos/pedidos | #proyectos/impresora |
//   #proyectos/inventario | #proyectos/envios | #pedido/<id> | #clientes |
//   #clientes/<persona> | #inbox
// `persona` es `cus_…` (cliente con ficha) o `ext:<nombre>` (contacto suelto,
// el nombre va urlencoded en el hash). La vista `inbox` es TEMPORAL: se
// elimina en F7 cuando Clientes absorba la mensajería. El default (hash
// vacío o desconocido) es `resumen`, el aterrizaje del taller (F6).

export type ProyectosSub = 'pedidos' | 'impresora' | 'inventario' | 'envios';

export type TallerRoute =
  | { vista: 'resumen' }
  | { vista: 'proyectos'; sub: ProyectosSub }
  | { vista: 'pedido'; id: string }
  | { vista: 'clientes'; persona?: string }
  | { vista: 'inbox' };

const DEFAULT: TallerRoute = { vista: 'resumen' };
const SUBS: ProyectosSub[] = ['pedidos', 'impresora', 'inventario', 'envios'];

function decodePersona(seg: string): string {
  try {
    if (seg.startsWith('ext:')) return `ext:${decodeURIComponent(seg.slice(4))}`;
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

function encodePersona(persona: string): string {
  if (persona.startsWith('ext:')) return `ext:${encodeURIComponent(persona.slice(4))}`;
  return encodeURIComponent(persona);
}

// Tolerante a basura: cualquier hash desconocido cae en proyectos/pedidos.
export function parseHash(hash: string): TallerRoute {
  const raw = (hash || '').replace(/^#/, '');
  const parts = raw.split('/');
  const head = parts[0];
  const rest = parts.slice(1);

  switch (head) {
    case 'resumen':
      return { vista: 'resumen' };
    case 'proyectos': {
      const sub = rest[0] as ProyectosSub | undefined;
      return { vista: 'proyectos', sub: sub && SUBS.includes(sub) ? sub : 'pedidos' };
    }
    case 'pedido': {
      const id = rest.join('/');
      return id ? { vista: 'pedido', id } : DEFAULT;
    }
    case 'clientes': {
      const seg = rest[0];
      return seg ? { vista: 'clientes', persona: decodePersona(seg) } : { vista: 'clientes' };
    }
    case 'inbox':
      return { vista: 'inbox' };

    // Compatibilidad con hashes viejos (previos al shell de F3).
    case 'pedidos':
      return { vista: 'proyectos', sub: 'pedidos' };
    case 'impresora':
      return { vista: 'proyectos', sub: 'impresora' };
    case 'inventario':
      return { vista: 'proyectos', sub: 'inventario' };
    case 'envios':
      return { vista: 'proyectos', sub: 'envios' };
    case 'calidad':
      // Módulo dado de baja en F1: se manda a pedidos.
      return { vista: 'proyectos', sub: 'pedidos' };

    default:
      return DEFAULT;
  }
}

export function formatHash(r: TallerRoute): string {
  switch (r.vista) {
    case 'resumen':
      return '#resumen';
    case 'proyectos':
      return `#proyectos/${r.sub}`;
    case 'pedido':
      return `#pedido/${r.id}`;
    case 'clientes':
      return r.persona ? `#clientes/${encodePersona(r.persona)}` : '#clientes';
    case 'inbox':
      return '#inbox';
  }
}

export function navigate(r: TallerRoute): void {
  if (typeof location === 'undefined') return;
  location.hash = formatHash(r);
}

function currentHash(): string {
  return typeof location === 'undefined' ? '' : location.hash;
}

// Hook: escucha `hashchange` y canonicaliza el hash con `replaceState` SOLO
// cuando difiere del canónico (evita bucles y no dispara `hashchange`).
export function useTallerRoute(): TallerRoute {
  const [route, setRoute] = useState<TallerRoute>(() => parseHash(currentHash()));

  useEffect(() => {
    const sync = () => {
      const hash = currentHash();
      const r = parseHash(hash);
      const canonical = formatHash(r);
      if (hash !== canonical && typeof history !== 'undefined') {
        history.replaceState(null, '', canonical);
      }
      setRoute(r);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  return route;
}
