import { createContext, type ComponentChildren } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import {
  confirmBedClear,
  dispatchOrder,
  getOrders,
  getPrinter,
  getSpools,
  patchOrder,
  requeueJob,
  type Order,
  type PrintJob,
  type Spool,
} from '../../lib/taller';
import { NEXT_STEP } from './pedidos/labels';

// Datos "core" del taller: pedidos + estado de la impresora. Los comparten
// los módulos pedidos e impresora (una tarjeta necesita las bobinas; el
// candado de cama es global). Los módulos FUTUROS no entran aquí: cada uno
// hace su propio fetch (ver ROADMAP_ARQUITECTURA.md).
export interface TallerCore {
  orders: Order[];
  spools: Spool[];
  bedClear: boolean;
  amsSyncedAt: string | null;
  loading: boolean;
  error: string | null;
  reload(): void;
  advance(order: Order): Promise<void>;
  dispatch(order: Order): Promise<void>;
  retry(job: PrintJob): Promise<void>;
  bedCleared(): Promise<void>;
}

const Ctx = createContext<TallerCore | null>(null);

export function useTallerCore(): TallerCore {
  const core = useContext(Ctx);
  if (!core) throw new Error('useTallerCore fuera de TallerCoreProvider');
  return core;
}

export function TallerCoreProvider({
  token,
  onUnauthorized,
  children,
}: {
  token: string;
  onUnauthorized: () => void;
  children: ComponentChildren;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [spools, setSpools] = useState<Spool[]>([]);
  const [bedClear, setBedClear] = useState(true);
  const [amsSyncedAt, setAmsSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [o, s, p] = await Promise.all([getOrders(token), getSpools(token), getPrinter(token)]);
      setOrders(o);
      setSpools(s);
      setBedClear(p.bed_clear);
      setAmsSyncedAt(p.ams_synced_at);
    } catch (err) {
      if (err instanceof Error && err.message === 'no_autorizado') {
        onUnauthorized();
      } else {
        setError('No se pudo cargar. Reintenta.');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // Refresco periódico para ver avanzar las impresiones sin recargar.
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [token]);

  // Avanza el estado con actualización optimista; si falla, restaura.
  async function advance(order: Order) {
    const step = NEXT_STEP[order.status];
    if (!step) return;
    const prev = orders;
    setOrders((os) => os.map((o) => (o.id === order.id ? { ...o, status: step.status } : o)));
    try {
      await patchOrder(token, order.id, step.status);
      if (step.status === 'enviada') setOrders((os) => os.filter((o) => o.id !== order.id));
    } catch {
      setOrders(prev);
      setError('No se pudo cambiar el estado.');
    }
  }

  // Manda un pedido a la cola de impresión (crea sus trabajos).
  async function dispatch(order: Order) {
    try {
      const jobs = await dispatchOrder(token, order.id);
      setOrders((os) => os.map((o) => (o.id === order.id ? { ...o, jobs } : o)));
    } catch {
      setError('No se pudo despachar a la impresora.');
    }
  }

  // Reencola un trabajo fallido.
  async function retry(job: PrintJob) {
    try {
      const updated = await requeueJob(token, job.id);
      setOrders((os) =>
        os.map((o) =>
          o.id === job.order_id
            ? { ...o, jobs: o.jobs.map((j) => (j.id === job.id ? updated : j)) }
            : o,
        ),
      );
    } catch {
      setError('No se pudo reencolar el trabajo.');
    }
  }

  // Confirma que la cama quedó despejada: el agente vuelve a recibir trabajos.
  async function bedCleared() {
    setBedClear(true);
    try {
      await confirmBedClear(token);
    } catch {
      setBedClear(false);
      setError('No se pudo confirmar. Reintenta.');
    }
  }

  const core: TallerCore = {
    orders,
    spools,
    bedClear,
    amsSyncedAt,
    loading,
    error,
    reload: () => void load(),
    advance,
    dispatch,
    retry,
    bedCleared,
  };

  return <Ctx.Provider value={core}>{children}</Ctx.Provider>;
}
