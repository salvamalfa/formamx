import { useEffect, useRef, useState } from 'preact/hooks';
import {
  ALL_IMAGE_SRCS,
  COLORS,
  DEFAULTS,
  MODELS,
  STEPS,
  baseSrc,
  pantallaSrc,
  type LampColor,
  type LayerKey,
} from '../config/lamps';

// Capa de imagen con crossfade: al cambiar `src`, la imagen anterior queda
// montada debajo y la nueva aparece encima con un fade CSS; al terminar la
// animación se desmonta la vieja (doble buffer, nunca más de 2 <img> por capa).
function CrossfadeLayer({ src, z }: { src: string; z: number }) {
  const [prev, setPrev] = useState<string | null>(null);
  const last = useRef(src);

  if (last.current !== src) {
    setPrev(last.current);
    last.current = src;
  }

  return (
    <div class="absolute inset-0" style={{ zIndex: z }}>
      {prev && <img src={prev} class="layer-img" alt="" aria-hidden="true" />}
      <img
        key={src}
        src={src}
        class="layer-img layer-fade"
        alt=""
        aria-hidden="true"
        draggable={false}
        onAnimationEnd={() => setPrev(null)}
      />
    </div>
  );
}

function Swatch({
  color,
  checked,
  onSelect,
}: {
  color: LampColor;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={color.label}
      title={color.label}
      onClick={onSelect}
      class={`grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border-2 transition-transform hover:scale-108 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${
        checked ? 'border-[var(--color-accent)]' : 'border-transparent'
      }`}
    >
      <span
        class="size-6.5 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.18)]"
        style={{ background: color.swatch }}
      />
    </button>
  );
}

export default function LampConfigurator() {
  const [stepIndex, setStepIndex] = useState(0);
  const [modelId, setModelId] = useState(DEFAULTS.modelId);
  const [pantallaColorId, setPantallaColorId] = useState(DEFAULTS.pantallaColorId);
  const [tapaColorId, setTapaColorId] = useState(DEFAULTS.tapaColorId);
  const [collapsed, setCollapsed] = useState(false);

  const step = STEPS[stepIndex];
  const model = MODELS.find((m) => m.id === modelId) ?? MODELS[0];
  const pantallaColor = COLORS.find((c) => c.id === pantallaColorId) ?? COLORS[0];
  const tapaColor = COLORS.find((c) => c.id === tapaColorId) ?? COLORS[0];

  const selectedColorId: Record<LayerKey | 'none', string> = {
    pantalla: pantallaColorId,
    base: tapaColorId,
    none: 'blanco',
  };
  const activeColorId = selectedColorId[step.layer ?? 'none'];
  const activeColorLabel =
    step.colors.find((c) => c.id === activeColorId)?.label ?? step.colors[0].label;

  const selectColor = (color: LampColor) => {
    if (step.layer === 'pantalla') setPantallaColorId(color.id);
    else if (step.layer === 'base') setTapaColorId(color.id);
    // layer null (Cuerpo): un solo color fijo, nada que cambiar.
  };

  const goto = (dir: 1 | -1) =>
    setStepIndex((i) => (i + dir + STEPS.length) % STEPS.length);

  // Precarga de todas las combinaciones para que el crossfade sea instantáneo.
  useEffect(() => {
    for (const src of ALL_IMAGE_SRCS) {
      const img = new Image();
      img.src = src;
    }
  }, []);

  return (
    <div class="flex h-full flex-col">
      {/* Nombre del producto, discreto, estilo Nike */}
      <header class="absolute left-5 top-4 z-30 sm:left-8 sm:top-6">
        <p class="text-sm font-semibold tracking-tight">Lámpara {model.label} — Forma</p>
        <p class="text-xs text-[var(--color-muted)]">Hecha a medida, pieza a pieza</p>
      </header>

      {/* Previsualización: capas superpuestas */}
      <div
        class="relative min-h-0 flex-1"
        role="img"
        aria-label={`Lámpara ${model.label} con pantalla ${pantallaColor.label.toLowerCase()}, cuerpo blanco y tapa ${tapaColor.label.toLowerCase()}`}
      >
        <CrossfadeLayer src={baseSrc(tapaColor)} z={10} />
        <CrossfadeLayer src={pantallaSrc(model, pantallaColor)} z={20} />
      </div>

      {/* Panel inferior estilo Nike By You */}
      <section
        class="relative z-30 border-t border-[var(--color-border)] bg-[var(--color-surface)]"
        aria-label="Opciones de personalización"
      >
        <div class="mx-auto grid max-w-3xl grid-cols-[2.5rem_1fr_2.5rem] items-center gap-2 px-4 py-2 sm:px-6">
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Mostrar opciones' : 'Ocultar opciones'}
            onClick={() => setCollapsed((c) => !c)}
            class="nav-btn"
          >
            <svg
              viewBox="0 0 24 24"
              class={`size-4 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          <div class="flex items-center justify-center gap-3">
            <button type="button" aria-label="Pieza anterior" onClick={() => goto(-1)} class="nav-btn">
              <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
              </svg>
            </button>
            <p class="min-w-32 text-center text-sm font-medium" aria-live="polite">
              {step.label}
              <span class="ml-1.5 text-[var(--color-muted)]">
                {stepIndex + 1}/{STEPS.length}
              </span>
            </p>
            <button type="button" aria-label="Pieza siguiente" onClick={() => goto(1)} class="nav-btn">
              <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
              </svg>
            </button>
          </div>

          <span aria-hidden="true" />
        </div>

        {!collapsed && (
          <div class="mx-auto flex max-w-3xl flex-col items-center gap-3 px-4 pb-4 sm:px-6">
            {step.showModels && (
              <div
                role="radiogroup"
                aria-label="Modelo de pantalla"
                class="flex max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none]"
              >
                {MODELS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={m.id === modelId}
                    onClick={() => setModelId(m.id)}
                    class={`shrink-0 cursor-pointer rounded-full border px-4 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${
                      m.id === modelId
                        ? 'border-[var(--color-accent)] font-medium'
                        : 'border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-accent)]'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}

            <div class="flex flex-col items-center gap-1.5">
              <div
                role="radiogroup"
                aria-label={`Color de ${step.label.toLowerCase()}`}
                class="flex max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none]"
              >
                {step.colors.map((color) => (
                  <Swatch
                    key={color.id}
                    color={color}
                    checked={color.id === activeColorId}
                    onSelect={() => selectColor(color)}
                  />
                ))}
              </div>
              <p class="text-xs text-[var(--color-muted)]">{activeColorLabel}</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
