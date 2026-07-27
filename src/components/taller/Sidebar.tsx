import logoBlanco from '../../assets/brand/forma-blanco.svg';
import { useMensajes } from './mensajesData';
import { navigate, type TallerRoute } from './router';

// Barra de navegación del taller. Un solo componente para las dos formas:
// en desktop (lg:) es una columna fija de 216px sobre tinta; en móvil se
// vuelve una barra superior sticky con los mismos botones en horizontal.

interface NavEntry {
  label: string;
  activo: boolean;
  onClick: () => void;
  badge?: number;
}

function fechaHoy(): string {
  return new Date().toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function NavButton({ label, activo, onClick, badge }: NavEntry) {
  const base =
    'flex items-center justify-between gap-2 whitespace-nowrap rounded-full px-[14px] py-[9px] text-left text-sm transition-colors lg:w-full';
  const tono = activo
    ? 'bg-[var(--accent)] font-bold text-[var(--accent-contrast)]'
    : 'font-normal text-[rgba(255,255,255,0.72)] hover:bg-[rgba(255,255,255,0.1)]';
  return (
    <button type="button" class={`${base} ${tono}`} onClick={onClick}>
      <span>{label}</span>
      {badge ? (
        <span
          class="rounded-full bg-[var(--blanco)] px-2 py-px text-[11px] font-bold text-[var(--tinta)]"
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

export function Sidebar({ route, onLogout }: { route: TallerRoute; onLogout: () => void }) {
  const { sinResponder } = useMensajes();

  const enResumen = route.vista === 'resumen';
  const enProyectos = route.vista === 'proyectos' || route.vista === 'pedido';
  const enClientes = route.vista === 'clientes';

  const entradas: NavEntry[] = [
    {
      label: 'Resumen',
      activo: enResumen,
      onClick: () => navigate({ vista: 'resumen' }),
    },
    {
      label: 'Proyectos',
      activo: enProyectos,
      onClick: () => navigate({ vista: 'proyectos', sub: 'pedidos' }),
    },
    // Clientes absorbió el inbox (F7): el badge de sin responder vive aquí.
    {
      label: 'Clientes',
      activo: enClientes,
      onClick: () => navigate({ vista: 'clientes' }),
      badge: sinResponder || undefined,
    },
  ];

  return (
    <aside
      class="sticky top-0 z-40 flex items-center gap-3 bg-[var(--tinta)] px-4 py-3 lg:static lg:z-auto lg:h-dvh lg:w-[216px] lg:shrink-0 lg:flex-col lg:items-stretch lg:gap-0 lg:px-4 lg:py-6"
    >
      <img
        src={logoBlanco.src}
        alt="forma"
        class="h-5 w-auto shrink-0 lg:mx-2 lg:mt-2 lg:mb-6 lg:h-[26px] lg:self-start"
      />

      <div
        class="mx-2 mb-2 hidden text-[11px] uppercase tracking-[0.08em] text-[rgba(255,255,255,0.45)] lg:block"
      >
        Taller
      </div>

      <nav class="flex min-w-0 flex-1 gap-1 overflow-x-auto lg:flex-none lg:flex-col lg:gap-0.5 lg:overflow-visible">
        {entradas.map((e) => (
          <NavButton key={e.label} {...e} />
        ))}
      </nav>

      <div class="flex shrink-0 items-center lg:mt-auto lg:flex-col lg:items-start lg:gap-2 lg:border-t lg:border-[rgba(255,255,255,0.15)] lg:pt-4">
        <div class="hidden px-2 lg:block">
          <div class="text-sm font-medium text-[var(--blanco)]">Salvador</div>
          <div
            class="mt-0.5 text-[11px] text-[rgba(255,255,255,0.5)]"
          >
            {fechaHoy()}
          </div>
        </div>
        <button
          type="button"
          class="rounded-md px-2 py-1 text-[13px] text-[rgba(255,255,255,0.6)] transition-colors hover:text-[var(--blanco)] lg:self-start"
          onClick={onLogout}
        >
          Salir →
        </button>
      </div>
    </aside>
  );
}
