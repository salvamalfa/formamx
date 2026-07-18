import { useEffect, useState } from 'preact/hooks';
import {
  createMensaje,
  getClientes,
  getMensajes,
  patchMensaje,
  type Cliente,
  type Mensaje,
} from '../../../lib/taller';
import { useSession } from '../hooks/useSession';
import { formatSync } from '../ui/format';
import { CHANNEL_LABEL, DIRECTION_LABEL, MSG_ACTIONS, MSG_STATUS_LABEL } from './labels';

const CARD =
  'rounded-[var(--radius-m)] border border-[var(--border-soft)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-card)]';

// Módulo "Inbox": el registro de mensajes con clientes. Hace su propio fetch
// (no entra a TallerCoreData); si el worker aún no tiene las rutas del
// módulo, muestra el error genérico y no rompe nada. Los archivados salen
// de Activos (el worker los filtra por default) y viven en su propia vista.
export function InboxPanel() {
  const { token } = useSession();
  const [vista, setVista] = useState<'activos' | 'archivados'>('activos');
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [formAbierto, setFormAbierto] = useState(false);
  // Mensaje con el cuerpo expandido (por default va recortado a 3 líneas).
  const [expandido, setExpandido] = useState<string | null>(null);

  async function load(t: string, v: 'activos' | 'archivados') {
    setLoading(true);
    try {
      setMensajes(await getMensajes(t, v === 'archivados' ? { status: 'archivado' } : undefined));
      setError(null);
    } catch {
      setError('No se pudo cargar. Reintenta.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    void load(token, vista);
    const timer = setInterval(() => void load(token, vista), 30_000);
    return () => clearInterval(timer);
  }, [token, vista]);

  // Cambio de estado optimista con rollback; archivar saca el mensaje de
  // Activos al instante (el worker lo filtra por default).
  async function avanzar(mensaje: Mensaje, status: string) {
    if (!token) return;
    const previos = mensajes;
    const sale = status === 'archivado' && vista === 'activos';
    setAviso(null);
    setMensajes((prev) =>
      sale
        ? prev.filter((m) => m.id !== mensaje.id)
        : prev.map((m) => (m.id === mensaje.id ? { ...m, status } : m)),
    );
    try {
      const actualizado = await patchMensaje(token, mensaje.id, status);
      if (!sale) {
        setMensajes((prev) => prev.map((m) => (m.id === mensaje.id ? actualizado : m)));
      }
    } catch {
      setMensajes(previos);
      setAviso('No se pudo actualizar el mensaje.');
    }
  }

  return (
    <section class="mt-12">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="m-0 text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
          Inbox
        </h2>
        <div class="flex gap-2">
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            onClick={() => token && void load(token, vista)}
          >
            Actualizar
          </button>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            onClick={() => setFormAbierto((v) => !v)}
          >
            Registrar mensaje
          </button>
        </div>
      </div>

      <div class="mt-3 flex gap-2">
        {(['activos', 'archivados'] as const).map((v) => (
          <button
            key={v}
            type="button"
            class={`chip ${vista === v ? 'activo' : ''}`}
            onClick={() => setVista(v)}
          >
            {v === 'activos' ? 'Activos' : 'Archivados'}
          </button>
        ))}
      </div>
      <p class="meta-caps m-0 mt-2 text-[var(--text-faint)]">
        {loading && mensajes.length === 0 ? 'cargando…' : `${mensajes.length} ${vista}`}
      </p>

      {error && (
        <p class="mt-3 text-sm text-[var(--support)]" role="alert">
          {error}
        </p>
      )}
      {aviso && <p class="mt-3 text-sm text-[var(--support)]">{aviso}</p>}

      {formAbierto && token && (
        <RegistrarMensaje
          token={token}
          onCreado={(mensaje) => {
            // El mensaje nuevo nunca nace archivado: solo se pinta en Activos.
            if (vista === 'activos') setMensajes((prev) => [mensaje, ...prev]);
            setFormAbierto(false);
          }}
        />
      )}

      {!loading && !error && mensajes.length === 0 && (
        <p class="mt-4 text-sm text-[var(--text-muted)]">
          {vista === 'activos'
            ? 'Sin mensajes por atender. Registra el primero cuando escriba un cliente.'
            : 'Nada archivado todavía.'}
        </p>
      )}

      <ul class="m-0 mt-4 grid list-none gap-4 p-0 md:grid-cols-2">
        {mensajes.map((m) => {
          const acciones = MSG_ACTIONS[m.status] ?? [];
          return (
            <li key={m.id} class={CARD}>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="chip">{CHANNEL_LABEL[m.channel] ?? m.channel}</span>
                  <span class="meta-caps text-[var(--text-faint)]">
                    {DIRECTION_LABEL[m.direction] ?? m.direction}
                  </span>
                </div>
                <span class="meta-caps text-[var(--support)]">
                  {MSG_STATUS_LABEL[m.status] ?? m.status}
                </span>
              </div>
              <p class="meta-caps m-0 mt-2 text-[var(--text-faint)]">
                {m.customer_name ? `${m.customer_name} · ` : ''}
                {formatSync(m.created_at)}
              </p>
              {m.subject && <p class="m-0 mt-2 text-sm font-semibold">{m.subject}</p>}
              {/* Recortado a 3 líneas; un toque lo expande o lo vuelve a recortar. */}
              <p
                class={`m-0 mt-1 cursor-pointer text-sm whitespace-pre-line text-[var(--text-muted)] ${
                  expandido === m.id ? '' : 'line-clamp-3'
                }`}
                onClick={() => setExpandido((prev) => (prev === m.id ? null : m.id))}
              >
                {m.body}
              </p>
              {acciones.length > 0 && (
                <div class="mt-3 flex flex-wrap gap-2">
                  {acciones.map((a) => (
                    <button
                      key={a.status}
                      type="button"
                      class={`btn btn-sm ${a.status === 'archivado' ? 'btn-ghost' : 'btn-primary'}`}
                      onClick={() => void avanzar(m, a.status)}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Alta manual de un mensaje. El select trae los clientes del CRM via
// getClientes — permitido: lo prohibido es entrar a coreData. Si el worker
// aún no tiene el módulo de clientes, el select queda vacío y el mensaje se
// registra sin cliente. order_id existe en la API pero no en este form (v1).
function RegistrarMensaje({
  token,
  onCreado,
}: {
  token: string;
  onCreado: (m: Mensaje) => void;
}) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [canal, setCanal] = useState('manual');
  const [direccion, setDireccion] = useState<'in' | 'out'>('in');
  const [asunto, setAsunto] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [creando, setCreando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    getClientes(token)
      .then((cs) => {
        if (vivo) setClientes(cs);
      })
      .catch(() => {
        // Sin clientes no pasa nada: el campo es opcional.
      });
    return () => {
      vivo = false;
    };
  }, [token]);

  async function crear() {
    const texto = cuerpo.trim();
    if (!texto) return;
    setCreando(true);
    setAviso(null);
    try {
      const mensaje = await createMensaje(token, {
        channel: canal,
        body: texto,
        direction: direccion,
        ...(asunto.trim() ? { subject: asunto.trim() } : {}),
        ...(clienteId ? { customer_id: clienteId } : {}),
      });
      onCreado(mensaje);
    } catch {
      setAviso('No se pudo registrar el mensaje.');
    } finally {
      setCreando(false);
    }
  }

  return (
    <div class={`${CARD} mt-4`}>
      <h3 class="meta-caps m-0 text-[var(--text-muted)]">Registrar mensaje</h3>
      <div class="mt-3 flex flex-col gap-3">
        <select
          class="input-brand"
          aria-label="Canal"
          value={canal}
          onChange={(e) => setCanal((e.target as HTMLSelectElement).value)}
        >
          {Object.entries(CHANNEL_LABEL).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <div class="flex gap-2">
          {(['in', 'out'] as const).map((d) => (
            <button
              key={d}
              type="button"
              class={`chip ${direccion === d ? 'activo' : ''}`}
              onClick={() => setDireccion(d)}
            >
              {DIRECTION_LABEL[d]}
            </button>
          ))}
        </div>
        <input
          type="text"
          class="input-brand"
          placeholder="Asunto (opcional)"
          value={asunto}
          onInput={(e) => setAsunto((e.target as HTMLInputElement).value)}
        />
        <textarea
          class="input-brand min-h-24"
          placeholder="Mensaje"
          value={cuerpo}
          onInput={(e) => setCuerpo((e.target as HTMLTextAreaElement).value)}
        />
        <select
          class="input-brand"
          aria-label="Cliente"
          value={clienteId}
          onChange={(e) => setClienteId((e.target as HTMLSelectElement).value)}
        >
          <option value="">Sin cliente</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name ?? c.email ?? c.id.slice(0, 12)}
            </option>
          ))}
        </select>
        <div class="flex flex-wrap items-center gap-3">
          <button
            type="button"
            class="btn btn-primary disabled:cursor-default disabled:opacity-60"
            disabled={creando || !cuerpo.trim()}
            onClick={() => void crear()}
          >
            Registrar
          </button>
          {aviso && <p class="m-0 text-sm text-[var(--support)]">{aviso}</p>}
        </div>
      </div>
    </div>
  );
}
