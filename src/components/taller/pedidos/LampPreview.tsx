import {
  COLORS,
  MODELS,
  baseKey,
  pantallaKey,
  type LampImageManifest,
} from '../../../config/lamps';

// Preview con las MISMAS capas del configurador público.
export function LampPreview({
  config,
  manifest,
}: {
  config: { model: string; pantalla: string; tapa: string };
  manifest: LampImageManifest;
}) {
  const model = MODELS.find((m) => m.id === config.model) ?? MODELS[0];
  const pantalla = COLORS.find((c) => c.id === config.pantalla) ?? COLORS[0];
  const tapa = COLORS.find((c) => c.id === config.tapa) ?? COLORS[0];
  const base = manifest[baseKey(tapa)];
  const shade = manifest[pantallaKey(model, pantalla)];

  return (
    <div class="relative h-32 w-28 shrink-0 self-center rounded-[var(--radius-s)] bg-[var(--hueso)]">
      {base && (
        <img
          src={base.src}
          srcset={base.srcset}
          sizes="112px"
          alt=""
          class="absolute inset-1 h-[calc(100%-0.5rem)] w-[calc(100%-0.5rem)] object-contain"
        />
      )}
      {shade && (
        <img
          src={shade.src}
          srcset={shade.srcset}
          sizes="112px"
          alt=""
          class="absolute inset-1 h-[calc(100%-0.5rem)] w-[calc(100%-0.5rem)] object-contain"
        />
      )}
    </div>
  );
}
