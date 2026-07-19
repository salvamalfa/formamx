import { useState } from 'preact/hooks';
import type { LampImageManifest } from '../../config/lamps';
import { ClientesPanel } from './clientes/ClientesPanel';
import { TallerCoreProvider, useTallerCore } from './coreData';
import { useSession } from './hooks/useSession';
import { BedAlert } from './impresora/ImpresoraPanel';
import { InboxPanel } from './inbox/InboxPanel';
import { MensajesProvider } from './mensajesData';
import { ProyectosPanel } from './proyectos/ProyectosPanel';
import { navigate, useTallerRoute, type TallerRoute } from './router';
import { Sidebar } from './Sidebar';

// Shell del taller: gate de token + layout con sidebar y contenido enrutado
// por hash (ver router.ts). Los paneles hacen su propio fetch; el estado
// core (pedidos/impresora) y el de mensajes viven en providers arriba.
export default function TallerShell({ manifest }: { manifest: LampImageManifest }) {
  const session = useSession();
  const [tokenInput, setTokenInput] = useState('');

  if (!session.token) {
    return (
      <div class="mx-auto max-w-sm px-6 py-24">
        <h1 class="text-xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
          Taller
        </h1>
        <p class="mt-2 text-sm text-[var(--text-muted)]">Pega tu token de taller para entrar.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            session.save(tokenInput);
            setTokenInput('');
          }}
          class="mt-5 flex flex-col gap-3"
        >
          <input
            type="password"
            class="input-brand"
            placeholder="token"
            value={tokenInput}
            onInput={(e) => setTokenInput((e.target as HTMLInputElement).value)}
          />
          <button type="submit" class="btn btn-primary">
            Entrar
          </button>
          {session.gateError && <p class="text-xs text-[var(--support)]">{session.gateError}</p>}
        </form>
      </div>
    );
  }

  return (
    <TallerCoreProvider
      token={session.token}
      onUnauthorized={() => session.invalidate('Token inválido.')}
    >
      <MensajesProvider
        token={session.token}
        onUnauthorized={() => session.invalidate('Token inválido.')}
      >
        <ShellChrome manifest={manifest} onLogout={session.logout} />
      </MensajesProvider>
    </TallerCoreProvider>
  );
}

function ShellChrome({
  manifest,
  onLogout,
}: {
  manifest: LampImageManifest;
  onLogout: () => void;
}) {
  const core = useTallerCore();
  const route = useTallerRoute();

  return (
    <div class="lg:flex lg:min-h-dvh">
      <Sidebar route={route} onLogout={onLogout} />
      <main class="min-w-0 flex-1">
        <div class="mx-auto max-w-[1100px] px-6 py-8 sm:px-10 lg:px-12 lg:py-10">
          {core.error && (
            <p class="mb-3 text-sm text-[var(--support)]" role="alert">
              {core.error}
            </p>
          )}

          <BedAlert />

          <RouteView route={route} manifest={manifest} />
        </div>
      </main>
    </div>
  );
}

function RouteView({ route, manifest }: { route: TallerRoute; manifest: LampImageManifest }) {
  switch (route.vista) {
    case 'proyectos':
      return <ProyectosPanel sub={route.sub} manifest={manifest} />;
    case 'pedido':
      return <PedidoDetalleStub id={route.id} />;
    case 'clientes':
      return <ClientesPanel />;
    case 'inbox':
      return <InboxPanel />;
  }
}

// Detalle de pedido: F4 trae la vista completa. Por ahora un stub claro que
// deja volver a la lista.
function PedidoDetalleStub({ id }: { id: string }) {
  return (
    <section>
      <button
        type="button"
        class="btn btn-sm btn-ghost-claro"
        onClick={() => navigate({ vista: 'proyectos', sub: 'pedidos' })}
      >
        ← Proyectos
      </button>
      <h1
        class="mt-4 text-[32px] font-bold"
        style={{ fontFamily: 'var(--font-display)', letterSpacing: 'var(--tracking-display)' }}
      >
        Pedido {id}
      </h1>
      <p class="mt-2 text-sm text-[var(--text-muted)]">
        El detalle del pedido llega en la próxima fase.
      </p>
    </section>
  );
}
