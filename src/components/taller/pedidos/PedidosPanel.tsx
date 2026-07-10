import type { LampImageManifest } from '../../../config/lamps';
import { useTallerCore } from '../coreData';
import { ImpresoraPanel } from '../impresora/ImpresoraPanel';
import { OrderCard } from './OrderCard';

// Módulo "Pedidos": la línea de producción completa, separada en lo que pasa
// por la impresora y lo que se hace a mano.
export function PedidosPanel({ manifest }: { manifest: LampImageManifest }) {
  const core = useTallerCore();

  return (
    <>
      {(['impresion_3d', 'manual'] as const).map((production) => {
        const grupo = core.orders.filter((o) => o.production === production);
        const es3d = production === 'impresion_3d';
        return (
          <section key={production} class="mt-12">
            <h2 class="m-0 text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
              {es3d ? 'Impresión 3D' : 'Taller manual'}
            </h2>
            <p class="meta-caps m-0 mt-1 text-[var(--text-faint)]">
              {core.loading ? 'cargando…' : `${grupo.length} en curso`}
            </p>

            {es3d && <ImpresoraPanel />}

            {grupo.length === 0 && !core.loading && (
              <p class="mt-4 text-sm text-[var(--text-muted)]">
                {es3d ? 'Nada en la impresora.' : 'Nada en el taller manual.'}
              </p>
            )}
            <div class="mt-4 grid gap-5 md:grid-cols-2">
              {grupo.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  manifest={manifest}
                  spools={core.spools}
                  onAdvance={() => core.advance(order)}
                  onDispatch={() => core.dispatch(order)}
                  onRetry={core.retry}
                />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
