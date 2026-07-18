import { useEffect, useState } from 'preact/hooks';
import {
  createRegistro,
  getChecklists,
  getOrders,
  getRegistros,
  type ChecklistItem,
  type Checklists,
  type Order,
  type QcRegistro,
} from '../../../lib/taller';
import { useSession } from '../hooks/useSession';
import { PRODUCT_LABEL } from '../inventario/labels';
import { formatSync } from '../ui/format';
import { PART_CHOICE_LABEL, passedLabel } from './labels';

const CARD =
  'rounded-[var(--radius-m)] border border-[var(--border-soft)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-card)]';

function describePedido(productId: string | null, customerName: string | null): string {
  const producto = productId ? (PRODUCT_LABEL[productId] ?? productId) : 'Pedido';
  return customerName ? `${producto} · ${customerName}` : producto;
}

// Módulo "Calidad": revisar piezas contra el checklist del worker y guardar
// el resultado. Hace su propio fetch (no entra a TallerCoreData); si el
// worker aún no tiene las rutas del módulo, muestra el error genérico y no
// rompe nada. Calidad NO bloquea el flujo de pedidos: marcar 'lista' sigue
// siendo decisión humana en Pedidos — aquí solo se lista lo que está en
// imprimiendo|lista sin una revisión aprobada (enganche blando).
export function CalidadPanel() {
  const { token } = useSession();
  const [registros, setRegistros] = useState<QcRegistro[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [checklists, setChecklists] = useState<Checklists | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [revisando, setRevisando] = useState<Order | null>(null);

  async function load(t: string) {
    setLoading(true);
    try {
      const [regs, ords, defs] = await Promise.all([
        getRegistros(t),
        getOrders(t),
        getChecklists(t),
      ]);
      setRegistros(regs);
      setOrders(ords);
      setChecklists(defs);
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

  // Por revisar: lo que ya salió de la impresora (o del banco) y aún no
  // tiene una revisión aprobada. Un registro rechazado NO lo saca de aquí.
  const pendientes = orders.filter(
    (o) =>
      (o.status === 'imprimiendo' || o.status === 'lista') &&
      !registros.some((r) => r.order_id === o.id && r.passed),
  );

  return (
    <section class="mt-12">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="m-0 text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
          Calidad
        </h2>
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          onClick={() => token && void load(token)}
        >
          Actualizar
        </button>
      </div>
      <p class="meta-caps m-0 mt-1 text-[var(--text-faint)]">
        {loading && registros.length === 0 && orders.length === 0
          ? 'cargando…'
          : `${pendientes.length} por revisar`}
      </p>

      {error && (
        <p class="mt-3 text-sm text-[var(--support)]" role="alert">
          {error}
        </p>
      )}
      {aviso && <p class="mt-3 text-sm text-[var(--support)]">{aviso}</p>}

      {revisando && token && checklists ? (
        <Revision
          token={token}
          order={revisando}
          items={checklists[revisando.production]}
          onRegistrado={(registro) => {
            setRegistros((prev) => [registro, ...prev]);
            setRevisando(null);
            // El veredicto lo dicta la respuesta del worker, no la UI.
            setAviso(`Revisión registrada: ${passedLabel(registro.passed)}.`);
          }}
          onCancelar={() => setRevisando(null)}
        />
      ) : (
        <>
          <h3 class="meta-caps mt-6 mb-0 text-[var(--text-muted)]">Por revisar</h3>
          {!loading && !error && pendientes.length === 0 && (
            <p class="mt-2 text-sm text-[var(--text-muted)]">
              Nada pendiente de revisión.
            </p>
          )}
          {pendientes.length > 0 && (
            <ul aria-label="Por revisar" class="m-0 mt-3 grid list-none gap-4 p-0 md:grid-cols-2">
              {pendientes.map((o) => (
                <li key={o.id} class={CARD}>
                  <p class="m-0 text-sm font-semibold">
                    {describePedido(o.product_id, o.customer.name ?? o.customer.email)}
                  </p>
                  <p class="meta-caps m-0 mt-1 text-[var(--text-faint)]">
                    {formatSync(o.created_at)}
                  </p>
                  <button
                    type="button"
                    class="btn btn-primary mt-3"
                    onClick={() => {
                      setAviso(null);
                      setRevisando(o);
                    }}
                  >
                    Revisar
                  </button>
                </li>
              ))}
            </ul>
          )}

          <h3 class="meta-caps mt-8 mb-0 text-[var(--text-muted)]">Historial</h3>
          {!loading && !error && registros.length === 0 && (
            <p class="mt-2 text-sm text-[var(--text-muted)]">
              Aún no hay revisiones registradas.
            </p>
          )}
          {registros.length > 0 && (
            <ul aria-label="Historial" class="m-0 mt-3 grid list-none gap-4 p-0 md:grid-cols-2">
              {registros.map((r) => (
                <li key={r.id} class={CARD}>
                  <div class="flex flex-wrap items-baseline justify-between gap-2">
                    <p class="m-0 text-sm font-semibold">
                      {describePedido(
                        r.pedido?.product_id ?? null,
                        r.pedido?.customer_name ?? r.order_id,
                      )}
                    </p>
                    <span class="meta-caps text-[var(--support)]">{passedLabel(r.passed)}</span>
                  </div>
                  <p class="meta-caps m-0 mt-1 text-[var(--text-faint)]">
                    {r.part ? (PART_CHOICE_LABEL[r.part] ?? r.part) : PART_CHOICE_LABEL.completa}
                    {' · '}
                    {formatSync(r.created_at)}
                  </p>
                  {r.notes && (
                    <p class="m-0 mt-2 text-sm text-[var(--text-muted)]">{r.notes}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

// Formulario de una revisión: cada item del checklist es una fila grande
// táctil con respuesta obligatoria Bien/Mal — sin estado inicial, para que
// "responder todo" sea detectable y Registrar quede deshabilitado hasta
// entonces. El veredicto no se muestra aquí: lo dicta el worker al guardar.
function Revision({
  token,
  order,
  items,
  onRegistrado,
  onCancelar,
}: {
  token: string;
  order: Order;
  items: ChecklistItem[];
  onRegistrado: (registro: QcRegistro) => void;
  onCancelar: () => void;
}) {
  const [respuestas, setRespuestas] = useState<Record<string, boolean>>({});
  const [parte, setParte] = useState('completa');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const completo = items.length > 0 && items.every((i) => typeof respuestas[i.id] === 'boolean');

  function responder(id: string, valor: boolean) {
    setRespuestas((prev) => ({ ...prev, [id]: valor }));
  }

  async function registrar() {
    if (!completo) return;
    setGuardando(true);
    setAviso(null);
    try {
      const registro = await createRegistro(token, {
        order_id: order.id,
        checklist: respuestas,
        // "Pieza completa" viaja sin part (part = null en el registro).
        ...(order.production === 'impresion_3d' && parte !== 'completa' ? { part: parte } : {}),
        ...(notas.trim() ? { notes: notas.trim() } : {}),
      });
      onRegistrado(registro);
    } catch {
      setAviso('No se pudo registrar la revisión.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div class={`${CARD} mt-4`}>
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h3 class="meta-caps m-0 text-[var(--text-muted)]">
          Revisión · {describePedido(order.product_id, order.customer.name ?? order.customer.email)}
        </h3>
        <button type="button" class="btn btn-ghost btn-sm" onClick={onCancelar}>
          Cancelar
        </button>
      </div>

      {order.production === 'impresion_3d' && (
        <div class="mt-3 flex flex-wrap gap-2">
          {Object.entries(PART_CHOICE_LABEL).map(([id, label]) => (
            <button
              key={id}
              type="button"
              class={`chip ${parte === id ? 'activo' : ''}`}
              onClick={() => setParte(id)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <ul class="m-0 mt-3 list-none p-0">
        {items.map((item) => (
          <li
            key={item.id}
            class="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-soft)] py-3"
          >
            <p class="m-0 text-sm">{item.label}</p>
            <div class="flex gap-2">
              <button
                type="button"
                class={`btn ${respuestas[item.id] === true ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => responder(item.id, true)}
              >
                Bien
              </button>
              <button
                type="button"
                class={`btn ${respuestas[item.id] === false ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => responder(item.id, false)}
              >
                Mal
              </button>
            </div>
          </li>
        ))}
      </ul>

      <textarea
        class="input-brand mt-3 w-full"
        rows={3}
        placeholder="Notas de la revisión (opcional)"
        value={notas}
        onInput={(e) => setNotas((e.target as HTMLTextAreaElement).value)}
      />
      <div class="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          class="btn btn-primary disabled:cursor-default disabled:opacity-60"
          disabled={guardando || !completo}
          onClick={() => void registrar()}
        >
          Registrar
        </button>
        {!completo && (
          <p class="m-0 text-sm text-[var(--text-muted)]">Responde todos los puntos.</p>
        )}
        {aviso && <p class="m-0 text-sm text-[var(--support)]">{aviso}</p>}
      </div>
    </div>
  );
}
