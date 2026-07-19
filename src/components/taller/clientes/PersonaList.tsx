import type { Persona } from '../mensajesData';

// Columna izquierda de Clientes: la lista de personas (clientes + contactos
// sueltos). Cada renglón es un botón con nombre + sublínea; el pendiente va en
// negrita con un punto naranja. El encabezado tiene un "+" discreto para dar
// de alta un contacto nuevo.

export function nombrePersona(p: Persona): string {
  if (p.kind === 'cliente') return p.cliente.name ?? p.cliente.email ?? 'Sin datos';
  return p.nombre;
}

function subtexto(p: Persona): string {
  const ultimo = p.mensajes[p.mensajes.length - 1];
  if (ultimo) {
    return (ultimo.direction === 'out' ? 'Tú: ' : '') + ultimo.body;
  }
  if (p.kind === 'cliente') {
    const ciudad = p.cliente.city ?? 'Sin ciudad';
    const n = p.cliente.order_count;
    return `${ciudad} · ${n} ${n === 1 ? 'pedido' : 'pedidos'}`;
  }
  return p.canal;
}

export function PersonaList({
  personas,
  selKey,
  onSelect,
  onNuevoContacto,
}: {
  personas: Persona[];
  selKey?: string;
  onSelect: (key: string) => void;
  onNuevoContacto: () => void;
}) {
  return (
    <div class="flex h-full min-h-0 flex-col rounded-[var(--radius-m)] border border-[var(--border-soft)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
      <div class="flex items-center justify-between gap-2 px-3 pt-3">
        <span class="meta-caps text-[var(--text-faint)]">Personas</span>
        <button
          type="button"
          class="flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--crema-claro)] hover:text-[var(--text-body)]"
          aria-label="Registrar contacto nuevo"
          title="Registrar contacto nuevo"
          onClick={onNuevoContacto}
        >
          +
        </button>
      </div>

      <div
        data-testid="persona-lista"
        class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-3 pt-2"
      >
        {personas.length === 0 ? (
          <p class="m-3 text-center text-[13px] text-[var(--text-faint)]">
            Nadie coincide con ese filtro.
          </p>
        ) : (
          personas.map((p) => {
            const activo = p.key === selKey;
            return (
              <button
                key={p.key}
                type="button"
                class={`rounded-[var(--radius-s)] p-3 text-left transition-colors ${
                  activo ? 'bg-[var(--crema-oscuro)]' : 'hover:bg-[var(--crema-claro)]'
                }`}
                onClick={() => onSelect(p.key)}
              >
                <div class="flex items-center gap-2">
                  <span
                    class={`min-w-0 truncate text-sm ${p.pendiente ? 'font-bold' : 'font-medium'}`}
                  >
                    {nombrePersona(p)}
                  </span>
                  {p.pendiente && (
                    <span
                      data-testid="pendiente-dot"
                      title="pendiente"
                      class="h-2 w-2 shrink-0 rounded-full bg-[var(--naranja)]"
                    />
                  )}
                </div>
                <div class="mt-0.5 truncate text-[12px] text-[var(--text-muted)]">
                  {subtexto(p)}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
