import { useState } from 'preact/hooks';
import { EnviosPanel } from '../envios/EnviosPanel';
import { ConfiguracionImpresora } from '../impresora/ConfiguracionImpresora';
import { ImpresoraPanel } from '../impresora/ImpresoraPanel';
import { InventarioPanel } from '../inventario/InventarioPanel';
import { PedidosPanel } from '../pedidos/PedidosPanel';
import { navigate, type ProyectosSub } from '../router';
import { IconAjustes } from '../ui/icons';

// Vista "Proyectos": la producción del taller bajo un solo techo, con
// sub-pestañas que hospedan los paneles existentes. Cada panel conserva su
// propio fetch y sus botones; aquí solo va el chrome (título + pills).
const SUBS: { id: ProyectosSub; label: string }[] = [
  { id: 'pedidos', label: 'Pedidos' },
  { id: 'impresora', label: 'Impresora' },
  { id: 'inventario', label: 'Inventario' },
  { id: 'envios', label: 'Envíos' },
];

export function ProyectosPanel({ sub }: { sub: ProyectosSub }) {
  const [config, setConfig] = useState(false);
  return (
    <div>
      <h1
        class="m-0 text-[32px] font-bold"
        style={{ fontFamily: 'var(--font-display)', letterSpacing: 'var(--tracking-display)' }}
      >
        Proyectos
      </h1>

      <div class="mt-4 flex flex-wrap items-center gap-2">
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
        {sub === 'impresora' && (
          <button
            type="button"
            title="Configuración de Impresora"
            aria-label="Configuración de Impresora"
            class="ml-auto text-[var(--text-faint)] hover:text-[var(--text-body)]"
            onClick={() => setConfig(true)}
          >
            <IconAjustes class="size-5" />
          </button>
        )}
      </div>

      <div class="mt-2">
        {sub === 'pedidos' && <PedidosPanel />}
        {sub === 'impresora' && <ImpresoraPanel />}
        {sub === 'inventario' && <InventarioPanel />}
        {sub === 'envios' && <EnviosPanel />}
      </div>

      {config && <ConfiguracionImpresora onClose={() => setConfig(false)} />}
    </div>
  );
}
