import { useEffect, useState } from 'preact/hooks';
import { getCliente, patchClienteNotes, type ClientePedido } from '../../../lib/taller';
import type { Persona } from '../mensajesData';
import { productLabel } from '../pedidos/labels';
import { StatusBadge } from '../pedidos/PedidosTable';
import { navigate } from '../router';
import { avatarDe } from '../ui/avatar';
import { money } from '../ui/format';
import { nombrePersona } from './PersonaList';

const CARD = 'rounded-[var(--radius-m)] border border-[var(--border-soft)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]';

function mesAnio(sqlUtc: string): string {
  const d = new Date(sqlUtc.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
}

function Avatar({ nombre, keyId }: { nombre: string; keyId: string }) {
  const a = avatarDe(nombre, keyId);
  return (
    <span
      class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold"
      style={{ background: a.bg, color: a.color, fontFamily: 'var(--font-display)' }}
    >
      {a.iniciales}
    </span>
  );
}

// Columna derecha de Clientes: la ficha de la persona seleccionada. Para un
// cliente trae su historial de pedidos (fetch propio al seleccionar) y sus
// notas editables; para un contacto suelto solo el aviso de que aún no es
// cliente.
export function PersonaFicha({
  persona,
  token,
  onVolver,
}: {
  persona: Persona;
  token: string;
  onVolver?: () => void;
}) {
  const nombre = nombrePersona(persona);

  return (
    <div class={`${CARD} h-full min-h-0 overflow-y-auto p-5`}>
      {onVolver && (
        <button
          type="button"
          class="mb-3 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-body)] lg:hidden"
          onClick={onVolver}
        >
          ‹ Volver al chat
        </button>
      )}

      <div class="mb-4 flex items-center gap-3">
        <Avatar nombre={nombre} keyId={persona.key} />
        <div class="min-w-0">
          <div class="text-[15px] font-bold">{nombre}</div>
          <div
            class="mt-0.5 text-[10px] uppercase text-[var(--text-faint)]"
            style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}
          >
            {persona.kind === 'cliente'
              ? `${persona.cliente.city ?? 'Sin ciudad'} · desde ${mesAnio(persona.cliente.created_at)}`
              : 'contacto nuevo'}
          </div>
        </div>
      </div>

      {persona.kind === 'cliente' ? (
        <FichaCliente persona={persona} token={token} />
      ) : (
        <div class="border-t border-[var(--border-soft)] pt-4">
          <p class="m-0 text-[13px] text-[var(--text-muted)]">
            Todavía no es cliente. Escribió por {persona.canal}.
          </p>
        </div>
      )}
    </div>
  );
}

function FichaCliente({
  persona,
  token,
}: {
  persona: Extract<Persona, { kind: 'cliente' }>;
  token: string;
}) {
  const cliente = persona.cliente;
  const [pedidos, setPedidos] = useState<ClientePedido[] | null>(null);
  const [errorPedidos, setErrorPedidos] = useState(false);
  const [intento, setIntento] = useState(0);
  const [notas, setNotas] = useState(cliente.notes ?? '');
  const [notasGuardadas, setNotasGuardadas] = useState(cliente.notes ?? '');
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Historial: fetch propio al seleccionar el cliente. `intento` en las deps
  // permite reintentar el fetch tras un fallo (botón Reintentar).
  useEffect(() => {
    let vivo = true;
    setPedidos(null);
    setErrorPedidos(false);
    getCliente(token, cliente.id)
      .then((d) => {
        if (vivo) setPedidos(d.pedidos);
      })
      .catch(() => {
        if (vivo) setErrorPedidos(true);
      });
    return () => {
      vivo = false;
    };
  }, [token, cliente.id, intento]);

  // Reseteo de notas al cambiar de cliente (la lista puede refrescarse por
  // polling; el borrador local manda mientras se edita).
  useEffect(() => {
    setNotas(cliente.notes ?? '');
    setNotasGuardadas(cliente.notes ?? '');
    setAviso(null);
  }, [cliente.id]);

  // Guardado optimista: se da por guardado y, si el worker falla, se restaura.
  async function guardar() {
    const previas = notasGuardadas;
    setNotasGuardadas(notas);
    setGuardando(true);
    setAviso(null);
    try {
      await patchClienteNotes(token, cliente.id, notas);
      setAviso('Notas guardadas.');
    } catch {
      setNotasGuardadas(previas);
      setNotas(previas);
      setAviso('No se pudieron guardar las notas.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div class="flex flex-col gap-3 border-t border-[var(--border-soft)] pt-4">
      {cliente.email && (
        <div>
          <div class="meta-caps text-[var(--text-faint)]">Correo</div>
          <a
            href={`mailto:${cliente.email}`}
            class="mt-0.5 block text-[13px] text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)]"
            style={{ overflowWrap: 'anywhere' }}
          >
            {cliente.email}
          </a>
        </div>
      )}
      {cliente.phone && (
        <div>
          <div class="meta-caps text-[var(--text-faint)]">Teléfono</div>
          <a
            href={`tel:${cliente.phone}`}
            class="mt-0.5 block text-[12px] text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {cliente.phone}
          </a>
        </div>
      )}

      <div>
        <div class="meta-caps mb-1 text-[var(--text-faint)]">Sus pedidos</div>
        {errorPedidos ? (
          <div role="alert" class="mt-1 flex flex-col items-start gap-1">
            <p class="m-0 text-[12px] text-[var(--support)]">No se pudo cargar. Reintenta.</p>
            <button
              type="button"
              class="text-[12px] font-medium text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)]"
              onClick={() => setIntento((n) => n + 1)}
            >
              Reintentar
            </button>
          </div>
        ) : pedidos === null ? (
          <p class="meta-caps m-0 text-[var(--text-faint)]">cargando…</p>
        ) : pedidos.length === 0 ? (
          <p class="m-0 mt-1 text-[12px] text-[var(--text-faint)]">Todavía no tiene pedidos.</p>
        ) : (
          pedidos.map((p) => (
            <button
              key={p.id}
              type="button"
              class="flex w-full items-center justify-between gap-2 border-t border-[var(--border-soft)] py-2 text-left transition-colors hover:bg-[var(--crema-claro)]"
              onClick={() => navigate({ vista: 'pedido', id: p.id })}
            >
              <span class="min-w-0">
                <span class="block truncate text-[13px] font-medium">{productLabel(p)}</span>
                <span
                  class="mt-px block text-[10px] text-[var(--text-faint)]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {p.id} · {money(p.amount_mxn)}
                </span>
              </span>
              <StatusBadge order={p} />
            </button>
          ))
        )}
      </div>

      <div class="rounded-[var(--radius-s)] p-3" style={{ background: 'var(--highlight-soft)' }}>
        <div class="meta-caps mb-1 text-[var(--tinta-suave)]">Notas</div>
        <textarea
          class="w-full resize-y rounded-[var(--radius-s)] border border-[var(--border-soft)] bg-[var(--blanco)] p-2 text-[13px] outline-none focus:border-[var(--support)]"
          rows={3}
          placeholder="Preferencias, acuerdos, lo que haga falta recordar"
          value={notas}
          onInput={(e) => setNotas((e.target as HTMLTextAreaElement).value)}
        />
        <div class="mt-2 flex items-center gap-3">
          <button
            type="button"
            class="btn btn-primary btn-sm disabled:cursor-default disabled:opacity-60"
            disabled={guardando || notas === notasGuardadas}
            onClick={() => void guardar()}
          >
            Guardar
          </button>
          {aviso && <span class="text-[12px] text-[var(--tinta)]">{aviso}</span>}
        </div>
      </div>
    </div>
  );
}
