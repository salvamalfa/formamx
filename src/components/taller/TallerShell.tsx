import { useEffect, useState } from 'preact/hooks';
import type { LampImageManifest } from '../../config/lamps';
import { TallerCoreProvider, useTallerCore } from './coreData';
import { useSession } from './hooks/useSession';
import { BedAlert } from './impresora/ImpresoraPanel';
import { MODULES } from './registry';

// Shell del taller: gate de token, encabezado con tabs por hash (#pedidos,
// #clientes...) y el módulo activo. Los módulos se registran en registry.ts.
export default function TallerShell({ manifest }: { manifest: LampImageManifest }) {
  const session = useSession();
  const [tokenInput, setTokenInput] = useState('');
  const [moduleId, setModuleId] = useState(readHash());

  useEffect(() => {
    const onHash = () => setModuleId(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

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

  const activeModule = MODULES.find((m) => m.id === moduleId) ?? MODULES[0];

  return (
    <TallerCoreProvider
      token={session.token}
      onUnauthorized={() => session.invalidate('Token inválido.')}
    >
      <ShellChrome
        manifest={manifest}
        activeId={activeModule.id}
        onLogout={session.logout}
      />
    </TallerCoreProvider>
  );
}

function ShellChrome({
  manifest,
  activeId,
  onLogout,
}: {
  manifest: LampImageManifest;
  activeId: string;
  onLogout: () => void;
}) {
  const core = useTallerCore();
  const activeModule = MODULES.find((m) => m.id === activeId) ?? MODULES[0];

  return (
    <div class="mx-auto max-w-[1100px] px-6 py-10 sm:px-12">
      <header class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-baseline gap-6">
          <h1 class="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
            Taller
          </h1>
          {MODULES.length > 1 && (
            <nav class="flex gap-2">
              {MODULES.map((m) => (
                <a
                  key={m.id}
                  href={`#${m.id}`}
                  class={`chip no-underline ${m.id === activeModule.id ? 'activo' : ''}`}
                >
                  {m.label}
                </a>
              ))}
            </nav>
          )}
        </div>
        <div class="flex items-center gap-3">
          <button type="button" class="btn btn-sm btn-ghost" onClick={core.reload}>
            Actualizar
          </button>
          <button type="button" class="btn btn-sm btn-ghost" onClick={onLogout}>
            Salir
          </button>
        </div>
      </header>

      {core.error && (
        <p class="mt-3 text-sm text-[var(--support)]" role="alert">
          {core.error}
        </p>
      )}

      <BedAlert />

      <activeModule.Panel manifest={manifest} />
    </div>
  );
}

function readHash(): string {
  if (typeof location === 'undefined') return 'pedidos';
  return location.hash.replace('#', '') || 'pedidos';
}
