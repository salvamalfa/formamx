import { useTallerCore } from '../coreData';
import { PedidosTable } from './PedidosTable';

// Sub-pestaña "Pedidos": una sola tabla con todos los pedidos en curso (el
// tipo de pieza va en el subtítulo de cada fila). El estado de carga y los
// datos vienen del core; cada fila abre el detalle del pedido.
export function PedidosPanel() {
  const core = useTallerCore();

  return (
    <div class="mt-4">
      {core.loading && core.orders.length === 0 ? (
        <p class="text-sm text-[var(--text-muted)]">Cargando…</p>
      ) : (
        <PedidosTable orders={core.orders} />
      )}
    </div>
  );
}
