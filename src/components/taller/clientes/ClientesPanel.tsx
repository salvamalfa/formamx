import { useEffect, useState } from 'preact/hooks';
import { getClientes, type Cliente, type Mensaje } from '../../../lib/taller';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useSession } from '../hooks/useSession';
import { personasDe, useMensajes, type Persona } from '../mensajesData';
import { navigate } from '../router';
import { ChatThread } from './ChatThread';
import { PersonaList } from './PersonaList';
import { PersonaFicha } from './PersonaFicha';

const CARD =
  'flex h-full min-h-0 items-center justify-center rounded-[var(--radius-m)] border border-[var(--border-soft)] bg-[var(--surface-card)] p-6 text-center text-[13px] text-[var(--text-faint)] shadow-[var(--shadow-card)]';

// Vista "Clientes": fusiona el CRM con la mensajería en una vista de tres
// columnas (lista de personas · chat · ficha). Es el orquestador: trae los
// clientes (fetch + polling propios), cruza con los mensajes del
// MensajesProvider para armar las personas y reparte el estado a las columnas.
// La persona seleccionada vive en el hash (#clientes/<persona>); en móvil el
// flujo lista → chat → ficha es estado local.
export function ClientesPanel({ persona }: { persona?: string }) {
  const { token } = useSession();
  const { mensajes, sinResponder, enviando, enviar, registrarEntrante, archivar } = useMensajes();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [fCiudad, setFCiudad] = useState('todas');
  const [fActivos, setFActivos] = useState(false);
  const [nuevo, setNuevo] = useState(false);
  const [movil, setMovil] = useState<'lista' | 'chat' | 'ficha'>(persona ? 'chat' : 'lista');

  const esDesktop = useMediaQuery('(min-width: 1024px)');

  async function load(t: string) {
    try {
      setClientes(await getClientes(t));
      setError(null);
    } catch {
      setError('No se pudo cargar. Reintenta.');
    }
  }

  useEffect(() => {
    if (!token) return;
    void load(token);
    const timer = setInterval(() => void load(token), 30_000);
    return () => clearInterval(timer);
  }, [token]);

  // Sincroniza el flujo móvil con la persona del hash: al abrir/cerrar una
  // persona (deep-link, hilo desde Resumen, botón atrás) salta a 'chat' o
  // 'lista'. Solo reacciona a cambios de `persona`, así que ver la ficha
  // (setMovil('ficha')) dentro de la misma persona no se pisa.
  useEffect(() => {
    setMovil(persona ? 'chat' : 'lista');
  }, [persona]);

  const todas = personasDe(clientes, mensajes);

  // Ciudades más frecuentes (hasta 4) para los chips de filtro.
  const freq = new Map<string, number>();
  for (const c of clientes) {
    if (c.city) freq.set(c.city, (freq.get(c.city) ?? 0) + 1);
  }
  const ciudades = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([c]) => c);

  const busq = busqueda.trim().toLowerCase();
  // Los filtros de ciudad/activo solo aplican a clientes; los contactos sueltos
  // aparecen únicamente con filtros neutros (como en el mockup).
  function visible(p: Persona): boolean {
    if (busq) {
      // Cliente: busca por nombre, correo o teléfono; contacto suelto: por nombre.
      const campos =
        p.kind === 'cliente'
          ? [p.cliente.name, p.cliente.email, p.cliente.phone]
          : [p.nombre];
      if (!campos.some((v) => v?.toLowerCase().includes(busq))) return false;
    }
    if (p.kind === 'contacto') return fCiudad === 'todas' && !fActivos;
    if (fCiudad !== 'todas' && p.cliente.city !== fCiudad) return false;
    if (fActivos && p.cliente.active_order_count <= 0) return false;
    return true;
  }
  const visibles = todas.filter(visible);

  // Selección: la del hash; en desktop, si no hay, la primera visible.
  const selKey = persona ?? (esDesktop ? visibles[0]?.key : undefined);
  const selPersona = selKey ? todas.find((p) => p.key === selKey) : undefined;

  function abrir(key: string) {
    setNuevo(false);
    navigate({ vista: 'clientes', persona: key });
    if (!esDesktop) setMovil('chat');
  }

  function iniciarNuevo() {
    setNuevo(true);
    if (!esDesktop) setMovil('chat');
  }

  async function crearContacto(opts: { nombre?: string; canal: string; body: string }) {
    const nombre = opts.nombre?.trim();
    if (!nombre) return;
    await registrarEntrante({ nombre, canal: opts.canal, body: opts.body });
    setNuevo(false);
    navigate({ vista: 'clientes', persona: `ext:${nombre}` });
    if (!esDesktop) setMovil('chat');
  }

  const lista = (
    <PersonaList
      personas={visibles}
      selKey={selKey}
      onSelect={abrir}
      onNuevoContacto={iniciarNuevo}
    />
  );

  const chat = nuevo ? (
    <ChatThread
      nuevoContacto
      onEnviar={() => undefined}
      onRegistrarEntrante={(opts) => void crearContacto(opts)}
      onArchivar={() => undefined}
      onVolver={esDesktop ? undefined : () => setMovil('lista')}
    />
  ) : selPersona ? (
    <ChatThread
      persona={selPersona}
      enviando={enviando}
      onEnviar={(body) => void enviar(selPersona, body)}
      onRegistrarEntrante={(opts) =>
        void registrarEntrante({ persona: selPersona, canal: opts.canal, body: opts.body })
      }
      onArchivar={(m: Mensaje) => void archivar(m)}
      onVolver={esDesktop ? undefined : () => setMovil('lista')}
      onVerFicha={esDesktop ? undefined : () => setMovil('ficha')}
    />
  ) : (
    <div class={CARD}>Elige a alguien de la lista para ver su conversación.</div>
  );

  const ficha =
    !nuevo && selPersona && token ? (
      <PersonaFicha
        persona={selPersona}
        token={token}
        onVolver={esDesktop ? undefined : () => setMovil('chat')}
      />
    ) : (
      <div class={CARD}>
        {nuevo ? 'Registra el mensaje para crear el contacto.' : 'Aquí va la ficha de la persona.'}
      </div>
    );

  return (
    <div>
      <header class="mb-4">
        <div class="flex items-baseline justify-between gap-4">
          <h1
            class="m-0 text-[32px] font-bold"
            style={{ fontFamily: 'var(--font-display)', letterSpacing: 'var(--tracking-display)' }}
          >
            Clientes
          </h1>
          <span class="meta-caps text-[var(--text-faint)]">
            {sinResponder ? `${sinResponder} sin responder · ` : ''}
            {todas.length} {todas.length === 1 ? 'persona' : 'personas'}
          </span>
        </div>

        {error && (
          <p class="mt-2 text-sm text-[var(--support)]" role="alert">
            {error}
          </p>
        )}

        <div class="mt-4 flex flex-wrap items-center gap-2">
          <input
            type="search"
            class="w-52 rounded-full border border-[var(--border-soft)] bg-[var(--blanco)] px-4 py-1.5 text-[13px] outline-none focus:border-[var(--support)]"
            placeholder="Buscar…"
            value={busqueda}
            onInput={(e) => setBusqueda((e.target as HTMLInputElement).value)}
          />
          <span class="mx-1 hidden h-5 w-px bg-[var(--border-strong)] sm:block" />
          <button
            type="button"
            class={`chip-claro ${fCiudad === 'todas' ? 'activo' : ''}`}
            onClick={() => setFCiudad('todas')}
          >
            todas
          </button>
          {ciudades.map((c) => (
            <button
              key={c}
              type="button"
              class={`chip-claro ${fCiudad === c ? 'activo' : ''}`}
              onClick={() => setFCiudad(c)}
            >
              {c}
            </button>
          ))}
          <button
            type="button"
            class={`chip-claro ${fActivos ? 'activo' : ''}`}
            onClick={() => setFActivos((v) => !v)}
          >
            con pedido activo
          </button>
        </div>
      </header>

      {esDesktop ? (
        <div
          class="grid h-[calc(100dvh-240px)] min-h-[460px] gap-4"
          style={{
            gridTemplateColumns: 'minmax(150px,230px) minmax(240px,1fr) minmax(170px,250px)',
          }}
        >
          {lista}
          {chat}
          {ficha}
        </div>
      ) : (
        <div class="h-[calc(100dvh-230px)] min-h-[420px]">
          {movil === 'lista' && lista}
          {movil === 'chat' && chat}
          {movil === 'ficha' && ficha}
        </div>
      )}
    </div>
  );
}
