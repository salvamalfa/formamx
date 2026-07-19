import { useEffect, useRef, useState } from 'preact/hooks';
import type { Mensaje } from '../../../lib/taller';
import type { Persona } from '../mensajesData';
import { formatSync } from '../ui/format';
import { nombrePersona } from './PersonaList';

// Columna central de Clientes: el chat. Burbujas de la conversación (out a la
// derecha en naranja, in a la izquierda en blanco) + composer con Enter, y un
// <details> discreto para registrar un mensaje recibido a mano. En modo
// "contacto nuevo" (sin persona) el <details> pide además el nombre.

const CANALES = ['email', 'whatsapp', 'web', 'manual'];

function Burbuja({ mensaje, onArchivar }: { mensaje: Mensaje; onArchivar: () => void }) {
  const out = mensaje.direction === 'out';
  return (
    <div class={`flex max-w-full flex-col ${out ? 'items-end' : 'items-start'}`}>
      <div
        class="text-sm"
        style={{
          maxWidth: '78%',
          background: out ? 'var(--naranja)' : 'var(--blanco)',
          color: out ? 'var(--blanco)' : 'var(--text-body)',
          border: out ? 'none' : '1px solid var(--border-soft)',
          borderRadius: out ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          padding: '10px 14px',
          lineHeight: 'var(--leading-tight)',
        }}
      >
        {mensaje.body}
      </div>
      <div class="mt-1 flex items-center gap-2">
        <span class="text-[10px] text-[var(--text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
          {formatSync(mensaje.created_at)}
        </span>
        <button
          type="button"
          class="text-[10px] text-[var(--text-faint)] uppercase transition-colors hover:text-[var(--text-muted)]"
          style={{ fontFamily: 'var(--font-mono)' }}
          onClick={onArchivar}
        >
          archivar
        </button>
      </div>
    </div>
  );
}

function RegistrarEntrante({
  nuevoContacto,
  onRegistrar,
}: {
  nuevoContacto: boolean;
  onRegistrar: (opts: { nombre?: string; canal: string; body: string }) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [canal, setCanal] = useState('whatsapp');
  const [cuerpo, setCuerpo] = useState('');

  function registrar() {
    const texto = cuerpo.trim();
    if (!texto) return;
    if (nuevoContacto && !nombre.trim()) return;
    onRegistrar({ ...(nuevoContacto ? { nombre: nombre.trim() } : {}), canal, body: texto });
    setNombre('');
    setCuerpo('');
  }

  return (
    <div class="mt-3 flex flex-col gap-3">
      {nuevoContacto && (
        <input
          type="text"
          class="input-brand"
          placeholder="Nombre del contacto"
          aria-label="Nombre del contacto"
          value={nombre}
          onInput={(e) => setNombre((e.target as HTMLInputElement).value)}
        />
      )}
      <select
        class="input-brand"
        aria-label="Canal"
        value={canal}
        onChange={(e) => setCanal((e.target as HTMLSelectElement).value)}
      >
        {CANALES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <textarea
        class="input-brand min-h-20"
        placeholder="Lo que escribió"
        aria-label="Cuerpo del mensaje recibido"
        value={cuerpo}
        onInput={(e) => setCuerpo((e.target as HTMLTextAreaElement).value)}
      />
      <button
        type="button"
        class="btn btn-primary btn-sm self-start disabled:cursor-default disabled:opacity-60"
        disabled={!cuerpo.trim() || (nuevoContacto && !nombre.trim())}
        onClick={registrar}
      >
        Registrar
      </button>
    </div>
  );
}

export function ChatThread({
  persona,
  nuevoContacto = false,
  onEnviar,
  onRegistrarEntrante,
  onArchivar,
  onVolver,
  onVerFicha,
}: {
  persona?: Persona;
  nuevoContacto?: boolean;
  onEnviar: (body: string) => void;
  onRegistrarEntrante: (opts: { nombre?: string; canal: string; body: string }) => void;
  onArchivar: (mensaje: Mensaje) => void;
  onVolver?: () => void;
  onVerFicha?: () => void;
}) {
  const [borrador, setBorrador] = useState('');
  const zonaRef = useRef<HTMLDivElement>(null);

  const mensajes = persona?.mensajes ?? [];
  const ultimoId = mensajes.length ? mensajes[mensajes.length - 1].id : null;
  const canal = persona
    ? persona.kind === 'contacto'
      ? persona.canal
      : (mensajes[mensajes.length - 1]?.channel ?? 'directo')
    : 'nuevo';
  const nombre = persona ? nombrePersona(persona) : 'Contacto nuevo';

  // Auto-scroll al fondo cuando cambia el hilo o llega un mensaje.
  useEffect(() => {
    const el = zonaRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [ultimoId, persona?.key]);

  function enviar() {
    const texto = borrador.trim();
    if (!texto) return;
    onEnviar(texto);
    setBorrador('');
  }

  return (
    <div class="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-m)] border border-[var(--border-soft)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
      <div class="flex items-center gap-3 border-b border-[var(--border-soft)] px-4 py-3 sm:px-5">
        {onVolver && (
          <button
            type="button"
            class="shrink-0 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-body)] lg:hidden"
            onClick={onVolver}
          >
            ‹ Volver
          </button>
        )}
        <button
          type="button"
          class="min-w-0 truncate text-left text-[15px] font-medium disabled:cursor-default"
          disabled={!onVerFicha}
          onClick={onVerFicha}
        >
          {nombre}
        </button>
        <span
          class="shrink-0 rounded-full bg-[var(--crema-oscuro)] px-2 py-0.5 text-[10px] uppercase text-[var(--text-faint)]"
          style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}
        >
          {canal}
        </span>
      </div>

      <div
        ref={zonaRef}
        data-testid="chat-mensajes"
        class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 sm:p-5"
        style={{ background: 'var(--crema-claro)' }}
      >
        {mensajes.length === 0 ? (
          <p class="m-auto text-center text-[13px] text-[var(--text-faint)]">
            {nuevoContacto
              ? 'Registra abajo lo que te escribió para empezar el hilo.'
              : 'Sin mensajes todavía. Escríbele aquí abajo.'}
          </p>
        ) : (
          mensajes.map((m) => (
            <Burbuja key={m.id} mensaje={m} onArchivar={() => onArchivar(m)} />
          ))
        )}
      </div>

      {!nuevoContacto && persona && (
        <div class="flex gap-2 border-t border-[var(--border-soft)] px-3 py-3 sm:px-4">
          <input
            type="text"
            class="min-w-0 flex-1 rounded-full border border-[var(--border-soft)] bg-[var(--crema-claro)] px-4 py-2.5 text-sm outline-none focus:border-[var(--support)]"
            placeholder="Escribe un mensaje…"
            aria-label="Escribe un mensaje"
            value={borrador}
            onInput={(e) => setBorrador((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                enviar();
              }
            }}
          />
          <button
            type="button"
            class="btn btn-primary disabled:cursor-default disabled:opacity-60"
            disabled={!borrador.trim()}
            onClick={enviar}
          >
            Enviar
          </button>
        </div>
      )}

      <details class="border-t border-[var(--border-soft)] px-3 py-2 sm:px-4" open={nuevoContacto}>
        <summary class="cursor-pointer text-[13px] text-[var(--text-muted)]">
          Registrar entrante
        </summary>
        <RegistrarEntrante nuevoContacto={nuevoContacto} onRegistrar={onRegistrarEntrante} />
      </details>
    </div>
  );
}
