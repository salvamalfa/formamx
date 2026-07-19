import { createContext, type ComponentChildren } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import {
  createMensaje,
  getMensajes,
  patchMensaje,
  type Cliente,
  type Mensaje,
} from '../../lib/taller';

// Estado compartido de mensajería: lo consumen el Sidebar (badge de sin
// responder), Resumen (hilos pendientes) y Clientes (chat + mutaciones). Es la
// excepción de "store compartido" prevista en docs/ROADMAP_ARQUITECTURA.md §9:
// varios módulos NO-core necesitan los mismos datos. Lectura con polling +
// mutaciones optimistas con rollback (las usa Clientes).

// Una "persona" es la unidad del CRM/mensajería: un cliente con ficha, o un
// contacto suelto (mensajes sin customer_id). Convención de captura del
// contacto: `subject` = nombre del contacto (así los mensajes sueltos con el
// mismo nombre se agrupan en un solo hilo). Documentado también en
// workers/api/README.md (sección inbox).
export type Persona =
  | { kind: 'cliente'; key: string; cliente: Cliente; mensajes: Mensaje[]; pendiente: boolean }
  | {
      kind: 'contacto';
      key: string; // 'ext:'+nombre — casa con el `persona` del router
      nombre: string;
      canal: string;
      mensajes: Mensaje[];
      pendiente: boolean;
    };

export interface MensajesState {
  mensajes: Mensaje[];
  sinResponder: number;
  loading: boolean;
  error: string | null;
  reload(): void;
  // Responder cierra el hilo: POST out + PATCH 'respondido' de todos los `in`
  // pendientes. Optimista con rollback.
  enviar(persona: Persona, body: string): Promise<void>;
  // Registrar un mensaje recibido a mano (mientras no hay integración real).
  registrarEntrante(opts: {
    persona?: Persona;
    nombre?: string;
    canal: string;
    body: string;
  }): Promise<void>;
  // Acción secundaria: sacar un mensaje de la vista (el worker lo filtra por
  // defecto, así que no vuelve en el siguiente reload).
  archivar(mensaje: Mensaje): Promise<void>;
}

const Ctx = createContext<MensajesState | null>(null);

export function useMensajes(): MensajesState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useMensajes fuera de MensajesProvider');
  return ctx;
}

// Sin responder = entrantes que aún esperan respuesta (nuevo o leído). Abrir
// un mensaje no lo saca de la cuenta; solo responderlo lo hace.
function contarSinResponder(mensajes: Mensaje[]): number {
  return mensajes.filter(
    (m) => m.direction === 'in' && (m.status === 'nuevo' || m.status === 'leido'),
  ).length;
}

function tienePendiente(mensajes: Mensaje[]): boolean {
  return mensajes.some(
    (m) => m.direction === 'in' && (m.status === 'nuevo' || m.status === 'leido'),
  );
}

// Nombre visible de un contacto suelto: su `subject`, o "Sin nombre (<canal>)"
// cuando el mensaje llegó sin asunto.
function nombreContacto(m: Mensaje): string {
  const subject = m.subject?.trim();
  return subject ? subject : `Sin nombre (${m.channel})`;
}

// Recencia de una persona para ordenar la lista: su último mensaje o, para un
// cliente sin mensajes, la fecha de su último pedido.
function recencia(p: Persona): string {
  const ultimo = p.mensajes.length ? p.mensajes[p.mensajes.length - 1].created_at : '';
  if (p.kind === 'cliente') {
    const pedido = p.cliente.last_order_at ?? '';
    return ultimo > pedido ? ultimo : pedido;
  }
  return ultimo;
}

// Construye la lista de personas cruzando clientes y mensajes. Reglas:
// - los mensajes con customer_id van al cliente correspondiente;
// - TODOS los clientes son personas, aunque no tengan mensajes;
// - los mensajes sin customer_id se agrupan por `subject` (contacto sin ficha),
//   o por canal si no hay subject;
// - cada hilo va en orden cronológico ASC;
// - orden final: pendientes primero, luego por recencia.
export function personasDe(clientes: Cliente[], mensajes: Mensaje[]): Persona[] {
  const asc = [...mensajes].sort((a, b) => a.created_at.localeCompare(b.created_at));

  const porCliente = new Map<string, Mensaje[]>();
  const porContacto = new Map<string, { nombre: string; canal: string; mensajes: Mensaje[] }>();

  for (const m of asc) {
    if (m.customer_id) {
      const lista = porCliente.get(m.customer_id) ?? [];
      lista.push(m);
      porCliente.set(m.customer_id, lista);
    } else {
      const nombre = nombreContacto(m);
      const key = `ext:${nombre}`;
      const grupo = porContacto.get(key) ?? { nombre, canal: m.channel, mensajes: [] };
      grupo.mensajes.push(m);
      grupo.canal = m.channel; // canal del último mensaje del hilo
      porContacto.set(key, grupo);
    }
  }

  const personas: Persona[] = [];
  for (const cliente of clientes) {
    const msgs = porCliente.get(cliente.id) ?? [];
    personas.push({
      kind: 'cliente',
      key: cliente.id,
      cliente,
      mensajes: msgs,
      pendiente: tienePendiente(msgs),
    });
  }
  for (const [key, grupo] of porContacto) {
    personas.push({
      kind: 'contacto',
      key,
      nombre: grupo.nombre,
      canal: grupo.canal,
      mensajes: grupo.mensajes,
      pendiente: tienePendiente(grupo.mensajes),
    });
  }

  return personas.sort((a, b) => {
    if (a.pendiente !== b.pendiente) return a.pendiente ? -1 : 1;
    return recencia(b).localeCompare(recencia(a));
  });
}

// Timestamp SQL-UTC ('YYYY-MM-DD HH:MM:SS') para los mensajes optimistas, en
// el mismo formato que guarda D1 (formatSync le añade la 'Z').
function nowSql(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

// Canal con el que responder: el del último mensaje del hilo, o 'manual' si el
// hilo está vacío (cliente sin mensajes todavía).
function canalDe(persona: Persona): string {
  const ultimo = persona.mensajes[persona.mensajes.length - 1];
  return ultimo?.channel ?? 'manual';
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

  // enviar: nace un `out` (nace 'respondido' en el worker) y se cierran todos
  // los `in` pendientes del hilo. La burbuja aparece de inmediato; si algo
  // falla, se restaura el estado previo.
  async function enviar(persona: Persona, body: string): Promise<void> {
    const texto = body.trim();
    if (!texto) return;
    const canal = canalDe(persona);
    const customerId = persona.kind === 'cliente' ? persona.cliente.id : undefined;
    const subject = persona.kind === 'contacto' ? persona.nombre : undefined;
    const pendientes = persona.mensajes
      .filter((m) => m.direction === 'in' && (m.status === 'nuevo' || m.status === 'leido'))
      .map((m) => m.id);
    const tempId = `tmp_${Date.now()}`;
    const optimista: Mensaje = {
      id: tempId,
      channel: canal,
      direction: 'out',
      customer_id: customerId ?? null,
      order_id: null,
      subject: subject ?? null,
      body: texto,
      status: 'respondido',
      created_at: nowSql(),
      customer_name: null,
    };

    const previos = mensajes;
    setMensajes((prev) => [
      ...prev.map((m) => (pendientes.includes(m.id) ? { ...m, status: 'respondido' } : m)),
      optimista,
    ]);

    try {
      const creado = await createMensaje(token, {
        direction: 'out',
        channel: canal,
        body: texto,
        ...(customerId ? { customer_id: customerId } : {}),
        ...(subject ? { subject } : {}),
      });
      await Promise.all(pendientes.map((id) => patchMensaje(token, id, 'respondido')));
      setMensajes((prev) => prev.map((m) => (m.id === tempId ? creado : m)));
    } catch {
      setMensajes(previos);
      setError('No se pudo enviar el mensaje.');
    }
  }

  // registrarEntrante: alta manual de un `in`. Para un contacto (existente o
  // nuevo por nombre) se manda `subject` para agrupar el hilo.
  async function registrarEntrante(opts: {
    persona?: Persona;
    nombre?: string;
    canal: string;
    body: string;
  }): Promise<void> {
    const texto = opts.body.trim();
    if (!texto) return;
    const customerId = opts.persona?.kind === 'cliente' ? opts.persona.cliente.id : undefined;
    const subject =
      opts.persona?.kind === 'contacto'
        ? opts.persona.nombre
        : opts.nombre?.trim()
          ? opts.nombre.trim()
          : undefined;
    const tempId = `tmp_${Date.now()}`;
    const optimista: Mensaje = {
      id: tempId,
      channel: opts.canal,
      direction: 'in',
      customer_id: customerId ?? null,
      order_id: null,
      subject: subject ?? null,
      body: texto,
      status: 'nuevo',
      created_at: nowSql(),
      customer_name: null,
    };

    const previos = mensajes;
    setMensajes((prev) => [...prev, optimista]);

    try {
      const creado = await createMensaje(token, {
        direction: 'in',
        channel: opts.canal,
        body: texto,
        ...(customerId ? { customer_id: customerId } : {}),
        ...(subject ? { subject } : {}),
      });
      setMensajes((prev) => prev.map((m) => (m.id === tempId ? creado : m)));
    } catch {
      setMensajes(previos);
      setError('No se pudo registrar el mensaje.');
    }
  }

  // archivar: saca el mensaje de la vista. El worker filtra los archivados por
  // defecto, así que no reaparece en el siguiente reload.
  async function archivar(mensaje: Mensaje): Promise<void> {
    const previos = mensajes;
    setMensajes((prev) => prev.filter((m) => m.id !== mensaje.id));
    try {
      await patchMensaje(token, mensaje.id, 'archivado');
    } catch {
      setMensajes(previos);
      setError('No se pudo archivar el mensaje.');
    }
  }

  const state: MensajesState = {
    mensajes,
    sinResponder: contarSinResponder(mensajes),
    loading,
    error,
    reload: () => void load(),
    enviar,
    registrarEntrante,
    archivar,
  };

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}
