import { useEffect, useState } from 'preact/hooks';
import {
  createEnvio,
  getEnvios,
  getOrders,
  patchEnvio,
  type Envio,
  type Order,
} from '../../../lib/taller';
import { useSession } from '../hooks/useSession';
import { formatSync, money } from '../ui/format';
import { CARRIERS, ENVIO_STATUS_LABEL, NEXT_STEP_ENVIO } from './labels';

const CARD =
  'rounded-[var(--radius-m)] border border-[var(--border-soft)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-card)]';

// Módulo "Envíos": las guías activas de los pedidos. Hace su propio fetch
// (no entra a TallerCoreData); si el worker aún no tiene las rutas del
// módulo, muestra el error genérico y no rompe nada. Las entregadas salen
// de la lista (el worker las filtra por default).
export function EnviosPanel() {
  const { token } = useSession();
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

      <ul class="m-0 mt-4 grid list-none gap-4 p-0 md:grid-cols-2">
        {envios.map((e) => {
          const siguiente = NEXT_STEP_ENVIO[e.status];
          const conIncidencia = e.status === 'creada' || e.status === 'en_transito';
          const ciudad = e.pedido?.shipping?.address?.city;
          return (
            <li key={e.id} class={CARD}>
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <p class="m-0 text-sm font-semibold">
                  {e.pedido?.customer_name ?? e.order_id}
                </p>
                <span class="meta-caps text-[var(--support)]">
                  {ENVIO_STATUS_LABEL[e.status] ?? e.status}
                </span>
              </div>
              <p class="meta-caps m-0 mt-1 text-[var(--text-faint)]">
                {ciudad ? `${ciudad} · ` : ''}
                {formatSync(e.created_at)}
              </p>
              <p
                class="m-0 mt-2 text-sm text-[var(--text-muted)]"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {e.carrier ?? 'Sin paquetería'}
                {e.tracking_number && (
                  <>
                    {' · '}
                    {e.label_url ? (
                      <a
                        class="text-[var(--support)]"
                        href={e.label_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {e.tracking_number}
                      </a>
                    ) : (
                      e.tracking_number
                    )}
                  </>
                )}
                {e.cost_mxn != null && ` · ${money(e.cost_mxn)}`}
              </p>
              {(siguiente || conIncidencia) && (
                <div class="mt-3 flex flex-wrap gap-2">
                  {siguiente && (
                    <button
                      type="button"
                      class="btn btn-primary"
                      onClick={() => void avanzar(e, siguiente.status)}
                    >
                      {siguiente.label}
                    </button>
                  )}
                  {conIncidencia && (
                    <button
                      type="button"
                      class="btn btn-ghost"
                      onClick={() => void avanzar(e, 'incidencia')}
                    >
                      Incidencia
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
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
    <div class={`${CARD} mt-4`}>
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
