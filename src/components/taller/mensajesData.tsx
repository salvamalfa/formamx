import { createContext, type ComponentChildren } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import { getMensajes, type Mensaje } from '../../lib/taller';

// Estado compartido de mensajería: lo consumen el Sidebar (badge de sin
// responder) y —en fases siguientes— Resumen y Clientes. Es la excepción de
// "store compartido" prevista en docs/ROADMAP_ARQUITECTURA.md §9: dos módulos
// NO-core necesitan los mismos datos. Enfocado en LECTURA; las mutaciones de
// chat llegan en F7.
export interface MensajesState {
  mensajes: Mensaje[];
  sinResponder: number;
  loading: boolean;
  error: string | null;
  reload(): void;
}

const Ctx = createContext<MensajesState | null>(null);

export function useMensajes(): MensajesState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useMensajes fuera de MensajesProvider');
  return ctx;
}

// Sin responder = entrantes que aún esperan respuesta (nuevo o leído). Abrir
// un mensaje no lo saca de la cuenta; solo responderlo lo hace (F7).
function contarSinResponder(mensajes: Mensaje[]): number {
  return mensajes.filter(
    (m) => m.direction === 'in' && (m.status === 'nuevo' || m.status === 'leido'),
  ).length;
}

export function MensajesProvider({
  token,
  onUnauthorized,
  children,
}: {
  token: string;
  onUnauthorized: () => void;
  children: ComponentChildren;
}) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setMensajes(await getMensajes(token, { limit: 200 }));
      setError(null);
    } catch (err) {
      if (err instanceof Error && err.message === 'no_autorizado') {
        onUnauthorized();
      } else {
        setError('No se pudieron cargar los mensajes.');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [token]);

  const state: MensajesState = {
    mensajes,
    sinResponder: contarSinResponder(mensajes),
    loading,
    error,
    reload: () => void load(),
  };

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}
