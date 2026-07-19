import type { LampImageManifest } from '../../../config/lamps';
import { EnviosPanel } from '../envios/EnviosPanel';
import { ImpresoraPanel } from '../impresora/ImpresoraPanel';
import { InventarioPanel } from '../inventario/InventarioPanel';
import { PedidosPanel } from '../pedidos/PedidosPanel';
import { navigate, type ProyectosSub } from '../router';

// Vista "Proyectos": la producción del taller bajo un solo techo, con
// sub-pestañas que hospedan los paneles existentes. Cada panel conserva su
// propio fetch y sus botones; aquí solo va el chrome (título + pills).
const SUBS: { id: ProyectosSub; label: string }[] = [
  { id: 'pedidos', label: 'Pedidos' },
  { id: 'impresora', label: 'Impresora' },
  { id: 'inventario', label: 'Inventario' },
  { id: 'envios', label: 'Envíos' },
];

export function ProyectosPanel({
  sub,
  manifest,
}: {
  sub: ProyectosSub;
  manifest: LampImageManifest;
}) {
  return (
    <div>
      <h1
        class="m-0 text-[32px] font-bold"
        style={{ fontFamily: 'var(--font-display)', letterSpacing: 'var(--tracking-display)' }}
      >
        Proyectos
      </h1>

      <div class="mt-4 flex flex-wrap gap-2">
        {SUBS.map((s) => (
          <button
            key={s.id}
            type="button"
            class={`chip-claro ${s.id === sub ? 'activo' : ''}`}
            onClick={() => navigate({ vista: 'proyectos', sub: s.id })}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div class="mt-2">
        {sub === 'pedidos' && <PedidosPanel manifest={manifest} />}
        {sub === 'impresora' && <ImpresoraPanel />}
        {sub === 'inventario' && <InventarioPanel />}
        {sub === 'envios' && <EnviosPanel />}
      </div>
    </div>
  );
}
