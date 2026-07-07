import { useEffect, useState } from 'preact/hooks';
import { API_BASE } from '../config/api';
import { startCheckout } from '../lib/checkout';

type State = 'cargando' | 'disponible' | 'comprando' | 'error' | 'vendida';

// CTA de compra de una pieza única. Consulta la disponibilidad al montar
// (la página es estática y no puede saberlo en build); la verificación real
// vuelve a pasar en el servidor al crear el checkout y al confirmar el pago.
export default function BuyBanca({ productId = 'banca-001' }: { productId?: string }) {
  const [state, setState] = useState<State>('cargando');

  useEffect(() => {
    fetch(`${API_BASE}/api/products/${productId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((p: { available: boolean }) => setState(p.available ? 'disponible' : 'vendida'))
      // Si la API no contesta, dejamos comprar: el checkout revalida.
      .catch(() => setState('disponible'));
  }, []);

  const buy = async () => {
    setState('comprando');
    try {
      await startCheckout({ product: productId });
    } catch (err) {
      setState(err instanceof Error && err.message === 'checkout_409' ? 'vendida' : 'error');
    }
  };

  const mailto = (
    <a
      href="mailto:hola@forma.mx"
      class="text-xs text-[var(--naranja-oscuro)] underline underline-offset-[3px] hover:text-[var(--naranja)]"
      style="font-family: var(--font-mono)"
    >
      ¿una a tu medida?
    </a>
  );

  if (state === 'vendida') {
    return (
      <div class="flex flex-col items-center gap-2.5 text-center">
        <span class="meta-caps text-[var(--text-faint)]">Vendida — vive en otro jardín</span>
        {mailto}
      </div>
    );
  }

  return (
    <div class="flex flex-col items-center gap-2.5">
      <button
        type="button"
        class="btn btn-primary disabled:cursor-default disabled:opacity-60"
        disabled={state === 'cargando' || state === 'comprando'}
        onClick={buy}
      >
        {state === 'comprando' ? 'Abriendo el pago…' : 'Comprar'}
      </button>
      {state === 'error' && (
        <p class="m-0 max-w-40 text-center text-xs text-[var(--text-muted)]" role="alert">
          No se pudo abrir el pago. Inténtalo otra vez.
        </p>
      )}
      {mailto}
    </div>
  );
}
