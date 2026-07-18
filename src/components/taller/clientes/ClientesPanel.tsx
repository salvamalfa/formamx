import { useEffect, useState } from 'preact/hooks';
import { MODELS } from '../../../config/lamps';
import {
  getCliente,
  getClientes,
  patchClienteNotes,
  type Cliente,
  type ClientePedido,
} from '../../../lib/taller';
import { useSession } from '../hooks/useSession';
import { STATUS_LABEL } from '../pedidos/labels';
import { formatSync, money } from '../ui/format';

const CARD =
  'rounded-[var(--radius-m)] border border-[var(--border-soft)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-card)]';

// Módulo "Clientes": quién ha comprado, su historial y notas del taller.
// Hace su propio fetch (no entra a TallerCoreData); si el worker aún no
// tiene las rutas del CRM, muestra el error genérico y no rompe nada.
// Un 401 aquí no re-abre el gate: el polling del core lo hace en segundos.
export function ClientesPanel() {
  const { token } = useSession();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function load(t: string) {
    setLoading(true);
    try {
      setClientes(await getClientes(t));
      setError(null);
    } catch {
      setError('No se pudo cargar. Reintenta.');
    } finally {
      setLoading(false);
    }
  }

  // Polling solo en la vista de lista; el detalle se carga al entrar.
  useEffect(() => {
    if (!token || selectedId) return;
    void load(token);
    const timer = setInterval(() => void load(token), 30_000);
    return () => clearInterval(timer);
  }, [token, selectedId]);

  if (selectedId && token) {
    return (
      <ClienteDetalle token={token} id={selectedId} onBack={() => setSelectedId(null)} />
    );
  }

  const q = busqueda.trim().toLowerCase();
  const visibles = q
    ? clientes.filter((c) =>
        [c.name, c.email, c.phone].some((v) => v?.toLowerCase().includes(q)),
      )
    : clientes;

  return (
    <section class="mt-12">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="m-0 text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
          Clientes
        </h2>
        <button type="button" class="btn btn-ghost btn-sm" onClick={() => token && void load(token)}>
          Actualizar
        </button>
      </div>
      <p class="meta-caps m-0 mt-1 text-[var(--text-faint)]">
        {loading && clientes.length === 0 ? 'cargando…' : `${clientes.length} en total`}
      </p>

      {error && (
        <p class="mt-3 text-sm text-[var(--support)]" role="alert">
          {error}
        </p>
      )}

      <input
        type="search"
        class="input-brand mt-4"
        placeholder="Buscar por nombre, email o teléfono"
        value={busqueda}
        onInput={(e) => setBusqueda((e.target as HTMLInputElement).value)}
      />

      {!loading && !error && clientes.length === 0 && (
        <p class="mt-4 text-sm text-[var(--text-muted)]">
          Aún no hay clientes. Aparecen solos con el primer pedido.
        </p>
      )}
      {clientes.length > 0 && visibles.length === 0 && (
        <p class="mt-4 text-sm text-[var(--text-muted)]">Nadie coincide con la búsqueda.</p>
      )}

      <div class="mt-4 grid gap-4 md:grid-cols-2">
        {visibles.map((c) => (
          <button
            key={c.id}
            type="button"
            class={`${CARD} cursor-pointer text-left`}
            onClick={() => setSelectedId(c.id)}
          >
            <p class="m-0 text-sm font-semibold">{c.name ?? c.email ?? 'Sin datos'}</p>
            {c.name && c.email && (
              <p class="m-0 mt-0.5 truncate text-xs text-[var(--text-muted)]">{c.email}</p>
            )}
            <p class="meta-caps m-0 mt-2 text-[var(--text-faint)]">
              {c.order_count === 1 ? '1 pedido' : `${c.order_count} pedidos`}
              {c.last_order_at ? ` · último: ${formatSync(c.last_order_at)}` : ''}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}

function ClienteDetalle({
  token,
  id,
  onBack,
}: {
  token: string;
  id: string;
  onBack: () => void;
}) {
  const [detalle, setDetalle] = useState<{ cliente: Cliente; pedidos: ClientePedido[] } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [notas, setNotas] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    setError(null);
    getCliente(token, id)
      .then((d) => {
        if (!vivo) return;
        setDetalle(d);
        setNotas(d.cliente.notes ?? '');
      })
      .catch(() => {
        if (vivo) setError('No se pudo cargar. Reintenta.');
      });
    return () => {
      vivo = false;
    };
  }, [token, id, intento]);

  // Guardado optimista: las notas se dan por guardadas y, si el worker
  // falla, se restauran las anteriores (también en el textarea).
  async function guardar() {
    if (!detalle) return;
    const previas = detalle.cliente.notes;
    setDetalle({ ...detalle, cliente: { ...detalle.cliente, notes: notas } });
    setGuardando(true);
    setAviso(null);
    try {
      await patchClienteNotes(token, id, notas);
      setAviso('Notas guardadas.');
    } catch {
      setDetalle((d) => (d ? { ...d, cliente: { ...d.cliente, notes: previas } } : d));
      setNotas(previas ?? '');
      setAviso('No se pudieron guardar las notas.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section class="mt-12">
      <button type="button" class="btn btn-ghost btn-sm" onClick={onBack}>
        ← Clientes
      </button>

      {error && (
        <div class="mt-4">
          <p class="m-0 text-sm text-[var(--support)]" role="alert">
            {error}
          </p>
          <button
            type="button"
            class="btn btn-ghost btn-sm mt-2"
            onClick={() => setIntento((n) => n + 1)}
          >
            Reintentar
          </button>
        </div>
      )}

      {!detalle && !error && (
        <p class="meta-caps mt-4 text-[var(--text-faint)]">cargando…</p>
      )}

      {detalle && (
        <>
          <h2 class="mt-4 text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
            {detalle.cliente.name ?? detalle.cliente.email ?? 'Sin datos'}
          </h2>
          <div
            class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {detalle.cliente.email && (
              <a class="text-[var(--support)]" href={`mailto:${detalle.cliente.email}`}>
                {detalle.cliente.email}
              </a>
            )}
            {detalle.cliente.phone && (
              <a class="text-[var(--support)]" href={`tel:${detalle.cliente.phone}`}>
                {detalle.cliente.phone}
              </a>
            )}
          </div>

          <div class={`${CARD} mt-6`}>
            <h3 class="meta-caps m-0 text-[var(--text-muted)]">Notas del taller</h3>
            <textarea
              class="input-brand mt-3 min-h-28"
              placeholder="Preferencias, acuerdos, lo que haga falta recordar"
              value={notas}
              onInput={(e) => setNotas((e.target as HTMLTextAreaElement).value)}
            />
            <div class="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                class="btn btn-primary disabled:cursor-default disabled:opacity-60"
                disabled={guardando}
                onClick={() => void guardar()}
              >
                Guardar
              </button>
              {aviso && <p class="m-0 text-sm text-[var(--text-muted)]">{aviso}</p>}
            </div>
          </div>

          <h3 class="meta-caps mt-8 text-[var(--text-muted)]">
            {detalle.pedidos.length === 1 ? '1 pedido' : `${detalle.pedidos.length} pedidos`}
          </h3>
          {detalle.pedidos.length === 0 && (
            <p class="mt-2 text-sm text-[var(--text-muted)]">Todavía sin pedidos.</p>
          )}
          <ul class="m-0 mt-3 flex list-none flex-col gap-3 p-0">
            {detalle.pedidos.map((p) => (
              <li key={p.id} class={`${CARD} flex flex-wrap items-baseline justify-between gap-2`}>
                <div class="min-w-0">
                  <p class="m-0 text-sm font-semibold">{describePedido(p)}</p>
                  <p class="meta-caps m-0 mt-1 text-[var(--text-faint)]">
                    {formatSync(p.created_at)}
                  </p>
                </div>
                <div class="text-right">
                  <span class="meta-caps text-[var(--support)]">
                    {STATUS_LABEL[p.status] ?? p.status}
                  </span>
                  <p class="m-0 mt-1 text-sm font-bold">{money(p.amount_mxn)}</p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function describePedido(p: ClientePedido): string {
  if (!p.config) {
    return p.product_id === 'banca-001' ? 'La banca de los abuelos' : p.product_id;
  }
  const model = MODELS.find((m) => m.id === p.config!.model)?.label ?? p.config.model;
  return `Lámpara ${model}`;
}
