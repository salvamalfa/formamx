import { useEffect, useState } from 'preact/hooks';
import {
  createEnvio,
  getEnvios,
  getOrders,
  patchEnvio,
  type Envio,
  type Order,
} from '../../../lib/taller';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useSession } from '../hooks/useSession';
import { navigate } from '../router';
import { formatSync, money, shortId } from '../ui/format';
import { CARRIERS, ENVIO_STATUS_LABEL, NEXT_STEP_ENVIO, envioStatusBadge } from './labels';

const FORM_CARD =
  'rounded-[var(--radius-m)] border border-[var(--border-soft)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-card)]';

const TABLE_CARD =
  'rounded-[var(--radius-m)] border border-[var(--border-soft)] bg-[var(--surface-card)] p-2 shadow-[var(--shadow-card)] sm:p-4';

const ENVIOS_COLS = '70px 90px 1.4fr 110px 1.2fr 120px';

function EstadoBadge({ status }: { status: string }) {
  const badge = envioStatusBadge(status);
  return (
    <span
      class="inline-block whitespace-nowrap rounded-[var(--radius-pill)] text-[11px]"
      style={{ fontFamily: 'var(--font-mono)', background: badge.bg, color: badge.color, padding: '3px 10px' }}
    >
      {ENVIO_STATUS_LABEL[status] ?? status}
    </span>
  );
}

function GuiaTexto({ envio }: { envio: Envio }) {
  if (!envio.tracking_number) {
    return <span class="text-[var(--text-faint)]">sin guía</span>;
  }
  if (envio.label_url) {
    return (
      <a class="text-[var(--accent)] hover:text-[var(--accent-hover)]" href={envio.label_url} target="_blank" rel="noreferrer">
        {envio.tracking_number}
      </a>
    );
  }
  return <>{envio.tracking_number}</>;
}

function Acciones({ envio, onAvanzar }: { envio: Envio; onAvanzar: (status: string) => void }) {
  const siguiente = NEXT_STEP_ENVIO[envio.status];
  const conIncidencia = envio.status === 'creada' || envio.status === 'en_transito';
  if (!siguiente && !conIncidencia) return null;
  return (
    <div class="mt-2 flex flex-wrap justify-end gap-2">
      {siguiente && (
        <button type="button" class="btn btn-primary btn-sm" onClick={() => onAvanzar(siguiente.status)}>
          {siguiente.label}
        </button>
      )}
      {conIncidencia && (
        <button type="button" class="btn btn-ghost-claro btn-sm" onClick={() => onAvanzar('incidencia')}>
          Incidencia
        </button>
      )}
    </div>
  );
}

// Fila de escritorio: nº · pedido (abre el detalle) · destino · paquetería ·
// guía · estado; las acciones van en un renglón secundario debajo (no caben
// en la fila sin apretar el grid en pantallas medianas).
function EnvioRow({ envio, onAvanzar }: { envio: Envio; onAvanzar: (status: string) => void }) {
  const ciudad = envio.pedido?.shipping?.address?.city;
  return (
    <div class="border-t border-[var(--border-soft)] px-2 py-3">
      <div class="grid items-center gap-3" style={{ gridTemplateColumns: ENVIOS_COLS }}>
        <span class="truncate text-[12px] text-[var(--text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
          {shortId(envio.id)}
        </span>
        <button
          type="button"
          aria-label={`Ver pedido ${shortId(envio.order_id)}`}
          class="justify-self-start truncate text-[12px] text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)]"
          style={{ fontFamily: 'var(--font-mono)' }}
          onClick={() => navigate({ vista: 'pedido', id: envio.order_id })}
        >
          {shortId(envio.order_id)}
        </button>
        <span class="truncate text-sm">{ciudad ?? '—'}</span>
        <span class="truncate text-sm text-[var(--text-muted)]">{envio.carrier ?? '—'}</span>
        <span class="truncate text-[12px] text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
          <GuiaTexto envio={envio} />
        </span>
        <span class="justify-self-end">
          <EstadoBadge status={envio.status} />
        </span>
      </div>
      <Acciones envio={envio} onAvanzar={onAvanzar} />
    </div>
  );
}

// Card apilada de móvil: mismos datos que la fila, layout de antes de F5.
function EnvioCard({ envio, onAvanzar }: { envio: Envio; onAvanzar: (status: string) => void }) {
  const ciudad = envio.pedido?.shipping?.address?.city;
  return (
    <div class="flex flex-col gap-2 border-t border-[var(--border-soft)] px-2 py-3 first:border-t-0">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <button
          type="button"
          class="text-left text-sm font-semibold text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)]"
          onClick={() => navigate({ vista: 'pedido', id: envio.order_id })}
        >
          {envio.pedido?.customer_name ?? shortId(envio.order_id)} →
        </button>
        <EstadoBadge status={envio.status} />
      </div>
      <p class="meta-caps m-0 text-[var(--text-faint)]">
        {ciudad ? `${ciudad} · ` : ''}
        {formatSync(envio.created_at)}
      </p>
      <p class="m-0 text-sm text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
        {envio.carrier ?? 'Sin paquetería'}
        {envio.tracking_number && (
          <>
            {' · '}
            <GuiaTexto envio={envio} />
          </>
        )}
        {envio.cost_mxn != null && ` · ${money(envio.cost_mxn)}`}
      </p>
      <Acciones envio={envio} onAvanzar={onAvanzar} />
    </div>
  );
}

// Módulo "Envíos": las guías activas de los pedidos. Hace su propio fetch
// (no entra a TallerCoreData); si el worker aún no tiene las rutas del
// módulo, muestra el error genérico y no rompe nada. Las entregadas salen
// de la lista (el worker las filtra por default).
export function EnviosPanel() {
  const { token } = useSession();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [formAbierto, setFormAbierto] = useState(false);

  async function load(t: string) {
    setLoading(true);
    try {
      setEnvios(await getEnvios(t));
      setError(null);
    } catch {
      setError('No se pudo cargar. Reintenta.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    void load(token);
    const timer = setInterval(() => void load(token), 30_000);
    return () => clearInterval(timer);
  }, [token]);

  // Avance optimista: la guía cambia al instante y, si el worker falla,
  // vuelve todo a como estaba. Marcar entregada la saca de la lista.
  async function avanzar(envio: Envio, status: string) {
    if (!token) return;
    const previos = envios;
    setAviso(null);
    setEnvios((prev) =>
      status === 'entregada'
        ? prev.filter((e) => e.id !== envio.id)
        : prev.map((e) => (e.id === envio.id ? { ...e, status } : e)),
    );
    try {
      const actualizado = await patchEnvio(token, envio.id, status);
      if (status !== 'entregada') {
        setEnvios((prev) => prev.map((e) => (e.id === envio.id ? actualizado : e)));
      }
    } catch {
      setEnvios(previos);
      setAviso('No se pudo actualizar la guía.');
    }
  }

  return (
    <section class="mt-12">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="m-0 text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
          Envíos
        </h2>
        <div class="flex gap-2">
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            onClick={() => token && void load(token)}
          >
            Actualizar
          </button>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            onClick={() => setFormAbierto((v) => !v)}
          >
            Nueva guía
          </button>
        </div>
      </div>
      <p class="meta-caps m-0 mt-1 text-[var(--text-faint)]">
        {loading && envios.length === 0 ? 'cargando…' : `${envios.length} activas`}
      </p>

      {error && (
        <p class="mt-3 text-sm text-[var(--support)]" role="alert">
          {error}
        </p>
      )}
      {aviso && <p class="mt-3 text-sm text-[var(--support)]">{aviso}</p>}

      {formAbierto && token && (
        <NuevaGuia
          token={token}
          onCreada={(envio) => {
            setEnvios((prev) => [envio, ...prev]);
            setFormAbierto(false);
          }}
        />
      )}

      {!loading && !error && envios.length === 0 && (
        <p class="mt-4 text-sm text-[var(--text-muted)]">
          Sin guías activas. Crea una cuando un pedido esté listo.
        </p>
      )}

      {envios.length > 0 && (
        <div class={`${TABLE_CARD} mt-4`}>
          {isDesktop && (
            <div
              class="meta-caps grid gap-3 px-2 py-2 text-[11px] text-[var(--text-faint)]"
              style={{ gridTemplateColumns: ENVIOS_COLS }}
            >
              <span>Nº</span>
              <span>Pedido</span>
              <span>Destino</span>
              <span>Paquetería</span>
              <span>Guía</span>
              <span class="justify-self-end">Estado</span>
            </div>
          )}
          <div class="flex flex-col">
            {envios.map((e) =>
              isDesktop ? (
                <EnvioRow key={e.id} envio={e} onAvanzar={(status) => void avanzar(e, status)} />
              ) : (
                <EnvioCard key={e.id} envio={e} onAvanzar={(status) => void avanzar(e, status)} />
              ),
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// Alta de guía. El select trae los pedidos en 'lista' (los que ya se pueden
// enviar) vía getOrders — permitido: lo prohibido es entrar a coreData.
function NuevaGuia({ token, onCreada }: { token: string; onCreada: (e: Envio) => void }) {
  const [listos, setListos] = useState<Order[]>([]);
  const [orderId, setOrderId] = useState('');
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');
  const [costo, setCosto] = useState('');
  const [creando, setCreando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    getOrders(token)
      .then((orders) => {
        if (vivo) setListos(orders.filter((o) => o.status === 'lista'));
      })
      .catch(() => {
        if (vivo) setAviso('No se pudieron cargar los pedidos.');
      });
    return () => {
      vivo = false;
    };
  }, [token]);

  async function crear() {
    if (!orderId) return;
    setCreando(true);
    setAviso(null);
    const costoNum = Number(costo);
    try {
      const envio = await createEnvio(token, {
        order_id: orderId,
        ...(carrier.trim() ? { carrier: carrier.trim() } : {}),
        ...(tracking.trim() ? { tracking_number: tracking.trim() } : {}),
        // El costo se captura en pesos y viaja en centavos, como amount_mxn.
        ...(costo.trim() && Number.isFinite(costoNum)
          ? { cost_mxn: Math.round(costoNum * 100) }
          : {}),
      });
      onCreada(envio);
    } catch {
      setAviso('No se pudo crear la guía.');
    } finally {
      setCreando(false);
    }
  }

  return (
    <div class={`${FORM_CARD} mt-4`}>
      <h3 class="meta-caps m-0 text-[var(--text-muted)]">Nueva guía</h3>
      <div class="mt-3 flex flex-col gap-3">
        <select
          class="input-brand"
          aria-label="Pedido"
          value={orderId}
          onChange={(e) => setOrderId((e.target as HTMLSelectElement).value)}
        >
          <option value="">Elige el pedido</option>
          {listos.map((o) => (
            <option key={o.id} value={o.id}>
              {o.id.slice(0, 12)} · {o.customer.name ?? o.customer.email ?? 'sin nombre'}
            </option>
          ))}
        </select>
        {listos.length === 0 && (
          <p class="m-0 text-sm text-[var(--text-muted)]">
            No hay pedidos listos para enviar.
          </p>
        )}
        <input
          type="text"
          class="input-brand"
          placeholder="Paquetería"
          list="carriers-envios"
          value={carrier}
          onInput={(e) => setCarrier((e.target as HTMLInputElement).value)}
        />
        <datalist id="carriers-envios">
          {CARRIERS.map((nombre) => (
            <option key={nombre} value={nombre} />
          ))}
        </datalist>
        <input
          type="text"
          class="input-brand"
          placeholder="Número de guía"
          value={tracking}
          onInput={(e) => setTracking((e.target as HTMLInputElement).value)}
        />
        <input
          type="number"
          class="input-brand"
          placeholder="Costo en pesos (opcional)"
          min="0"
          value={costo}
          onInput={(e) => setCosto((e.target as HTMLInputElement).value)}
        />
        <div class="flex flex-wrap items-center gap-3">
          <button
            type="button"
            class="btn btn-primary disabled:cursor-default disabled:opacity-60"
            disabled={creando || !orderId}
            onClick={() => void crear()}
          >
            Crear guía
          </button>
          {aviso && <p class="m-0 text-sm text-[var(--support)]">{aviso}</p>}
        </div>
      </div>
    </div>
  );
}
