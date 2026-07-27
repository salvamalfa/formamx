import { useEffect, useRef, useState } from 'preact/hooks';
import logoNegro from '../assets/brand/forma-negro.svg';
import { startCheckout } from '../lib/checkout';
import {
  ALL_IMAGE_KEYS,
  COLORS,
  DEFAULTS,
  MODELS,
  STEPS,
  baseKey,
  pantallaKey,
  type LampColor,
  type LampImage,
  type LampImageManifest,
  type LayerKey,
} from '../config/lamps';

// El <img> ocupa todo el ancho del preview (la lámpara se ajusta por altura
// con object-contain); el navegador elige el tamaño del srcset según esto.
const SIZES = '100vw';

// Capa de imagen con crossfade: al cambiar `image`, la anterior queda montada
// debajo y la nueva aparece encima con un fade CSS; al terminar la animación
// se desmonta la vieja (doble buffer, nunca más de 2 <img> por capa).
function CrossfadeLayer({ image, z }: { image: LampImage; z: number }) {
  const [prev, setPrev] = useState<LampImage | null>(null);
  const last = useRef(image);

  if (last.current.src !== image.src) {
    setPrev(last.current);
    last.current = image;
  }

  return (
    <div class="absolute inset-0" style={{ zIndex: z }}>
      {prev && (
        <img
          src={prev.src}
          srcset={prev.srcset}
          sizes={SIZES}
          class="layer-img"
          alt=""
          aria-hidden="true"
        />
      )}
      <img
        key={image.src}
        src={image.src}
        srcset={image.srcset}
        sizes={SIZES}
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
      class={`grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border-2 transition-transform hover:scale-108 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] ${
        checked ? 'border-[var(--tinta)]' : 'border-transparent'
      }`}
    >
      <span
        class="size-6.5 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.18)]"
        style={{ background: color.swatch }}
      />
    </button>
  );
}

export default function LampConfigurator({ manifest }: { manifest: LampImageManifest }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [modelId, setModelId] = useState(DEFAULTS.modelId);
  const [pantallaColorId, setPantallaColorId] = useState(DEFAULTS.pantallaColorId);
  const [tapaColorId, setTapaColorId] = useState(DEFAULTS.tapaColorId);
  const [buying, setBuying] = useState<'idle' | 'loading' | 'error'>('idle');

  // Abre el pago con la combinación elegida; si sale bien, la página navega a
  // Stripe y el estado loading se queda hasta el unload.
  const buy = async () => {
    setBuying('loading');
    try {
      await startCheckout({
        product: 'lampara',
        config: { model: modelId, pantalla: pantallaColorId, tapa: tapaColorId },
      });
    } catch {
      setBuying('error');
    }
  };

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
  // Se usa el mismo srcset/sizes que los <img> reales para que el navegador
  // pida (y cachee) exactamente el mismo recurso.
  useEffect(() => {
    for (const key of ALL_IMAGE_KEYS) {
      const entry = manifest[key];
      if (!entry) continue;
      const img = new Image();
      img.sizes = SIZES;
      img.srcset = entry.srcset;
      img.src = entry.src;
    }
  }, []);

  return (
    <div class="flex h-full flex-col">
      {/* Título y precio, discretos, estilo Nike */}
      <header class="absolute left-5 top-4 z-30 sm:left-8 sm:top-6">
        <a href="/" aria-label="forma — inicio">
          <img src={logoNegro.src} alt="forma" class="block h-6 w-auto" />
        </a>
        <h1
          class="mt-2.5 text-[15px] font-bold leading-tight"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Diseña tu lámpara
        </h1>
        <p class="meta-caps mt-0.5 text-[var(--text-muted)]">$499 MXN</p>
      </header>

      {/* Botón de compra */}
      <div class="absolute right-5 top-4 z-30 flex flex-col items-end gap-1.5 sm:right-8 sm:top-6">
        <button
          type="button"
          class="btn btn-primary disabled:cursor-default disabled:opacity-60"
          disabled={buying === 'loading'}
          onClick={buy}
        >
          {buying === 'loading' ? 'Abriendo el pago…' : 'Comprar'}
        </button>
        {buying === 'error' && (
          <p class="m-0 max-w-44 text-right text-xs text-[var(--text-muted)]" role="alert">
            No se pudo abrir el pago. Inténtalo otra vez.
          </p>
        )}
      </div>

      {/* Previsualización: capas superpuestas */}
      <div
        class="relative min-h-0 flex-1"
        role="img"
        aria-label={`Lámpara ${model.label} con pantalla ${pantallaColor.label.toLowerCase()}, cuerpo blanco y tapa ${tapaColor.label.toLowerCase()}`}
      >
        <CrossfadeLayer image={manifest[baseKey(tapaColor)]} z={10} />
        <CrossfadeLayer image={manifest[pantallaKey(model, pantallaColor)]} z={20} />
      </div>

      {/* Panel inferior estilo Nike By You */}
      <section
        class="relative z-30 border-t border-[var(--border-soft)] bg-[var(--blanco)]"
        aria-label="Opciones de personalización"
      >
        <div class="mx-auto max-w-3xl px-4 py-2 sm:px-6">
          <div class="flex items-center justify-center gap-3">
            <button type="button" aria-label="Pieza anterior" onClick={() => goto(-1)} class="nav-btn">
              <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
              </svg>
            </button>
            <p class="min-w-32 text-center text-sm font-semibold" aria-live="polite">
              {step.label}
              <span class="ml-1.5 font-normal text-[var(--text-muted)]">
                {stepIndex + 1}/{STEPS.length}
              </span>
            </p>
            <button type="button" aria-label="Pieza siguiente" onClick={() => goto(1)} class="nav-btn">
              <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

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
                    class={`shrink-0 cursor-pointer rounded-full border-[1.5px] px-4 py-1.5 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] ${
                      m.id === modelId
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hover)]'
                        : 'border-[var(--border-strong)] bg-transparent text-[var(--text-muted)] hover:border-[var(--accent)]'
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
              <p class="text-xs text-[var(--text-muted)]">{activeColorLabel}</p>
            </div>
          </div>
      </section>
    </div>
  );
}
