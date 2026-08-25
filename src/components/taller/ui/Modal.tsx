import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';

// Popup mínimo: fondo oscuro + tarjeta centrada, sin portal (no hace falta:
// /taller no tiene overflow:hidden en el body que lo recorte). Se cierra con
// Escape o clic en el fondo. Un solo uso hoy (calculadora de precio en
// Piezas de clientes) pero vive aparte para no atar el patrón a esa card.
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        class="w-full max-w-sm rounded-[var(--radius-m)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-card)]"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div class="mb-3 flex items-center justify-between gap-3">
          <h3 class="m-0 text-sm font-bold" style={{ fontFamily: 'var(--font-display)' }}>
            {title}
          </h3>
          <button
            type="button"
            aria-label="Cerrar"
            class="text-[var(--text-faint)] hover:text-[var(--text-body)]"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
