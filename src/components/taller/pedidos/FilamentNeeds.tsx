import { colorLabel, colorSwatch } from '../ui/colores';

// Filamentos que necesita la lámpara y si están cargados en el AMS.
export function FilamentNeeds({
  config,
  loaded,
}: {
  config: { pantalla: string; tapa: string };
  loaded: Set<string>;
}) {
  const needed = [
    { id: 'blanco', role: 'cuerpo' },
    { id: config.pantalla, role: 'pantalla' },
    { id: config.tapa, role: 'tapa' },
  ];
  return (
    <div class="flex flex-wrap gap-1.5">
      {needed.map(({ id, role }) => {
        const ok = loaded.has(id);
        return (
          <span
            key={role}
            class={`meta-caps inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2 py-0.5 text-[10px] ${
              ok
                ? 'bg-[var(--support-soft)] text-[var(--support)]'
                : 'bg-[color-mix(in_srgb,var(--naranja)_18%,transparent)] text-[var(--naranja-oscuro)]'
            }`}
          >
            <span
              class="size-2.5 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.2)]"
              style={{ background: colorSwatch(id) }}
            />
            {role}: {colorLabel(id)}
            {!ok && ' · carga'}
          </span>
        );
      })}
    </div>
  );
}
