import { useEffect, useState } from 'preact/hooks';
import { getPricingConfig, patchPricingConfig, type PricingConfig } from '../../../lib/taller';
import { useSession } from '../hooks/useSession';
import { Modal } from '../ui/Modal';

// Popup "Configuración" de la sub-pestaña Impresora (ícono junto a las
// pestañas de Proyectos, visible solo en Impresora). Menú lateral para poder
// sumar secciones más adelante sin rediseñar — hoy solo vive la calculadora
// de costos; la conexión física de la impresora (IP, serial, access_code)
// se queda en config.toml del agente a propósito: es config de red/credencial
// local, no algo que tenga sentido sincronizar por la nube.
type Seccion = 'calculadora';

const SECCIONES: { id: Seccion; label: string }[] = [{ id: 'calculadora', label: 'Calculadora de costos' }];

export function ConfiguracionImpresora({ onClose }: { onClose: () => void }) {
  const [seccion, setSeccion] = useState<Seccion>('calculadora');
  return (
    <Modal title="Configuración de Impresora" onClose={onClose} wide>
      <div class="flex gap-4">
        <nav class="w-40 shrink-0 border-r border-[var(--border-soft)] pr-3">
          {SECCIONES.map((s) => (
            <button
              key={s.id}
              type="button"
              class={`block w-full rounded-[var(--radius-s)] px-2 py-1.5 text-left text-[13px] ${
                seccion === s.id
                  ? 'bg-[var(--azul-claro)] font-semibold text-[var(--azul-oscuro)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--hueso)]'
              }`}
              onClick={() => setSeccion(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <div class="min-w-0 flex-1">{seccion === 'calculadora' && <ConfigCostos />}</div>
      </div>
    </Modal>
  );
}

// Config de costos de la calculadora de precio (Fase 3e): los valores que
// antes vivían fijos en el Apps Script de Salva, ahora editables aquí. Cada
// campo se guarda solo (blur), sin botón único de "guardar todo" — así un
// cambio no se pierde si se edita otro campo antes de confirmar el primero.
function ConfigCostos() {
  const { token } = useSession();
  const [config, setConfig] = useState<PricingConfig | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getPricingConfig(token)
      .then(setConfig)
      .catch(() => {
        /* sin config todavía (worker viejo): el formulario no aparece */
      });
  }, [token]);

  if (!config) return null;

  const CAMPOS: Array<{
    key: keyof Omit<PricingConfig, 'updated_at'>;
    label: string;
    unidad: string;
    // Los montos de dinero se muestran/editan en pesos; se guardan en centavos.
    pesos?: boolean;
  }> = [
    { key: 'costo_kwh_mxn', label: 'Costo kWh', unidad: '$/kWh', pesos: true },
    { key: 'consumo_w', label: 'Consumo de la impresora', unidad: 'W' },
    { key: 'costo_hora_mano_obra_mxn', label: 'Mano de obra', unidad: '$/h', pesos: true },
    { key: 'minutos_mano_obra_default', label: 'Mano de obra por pieza', unidad: 'min' },
    { key: 'precio_impresora_mxn', label: 'Costo de la impresora', unidad: '$', pesos: true },
    { key: 'vida_util_horas_estimada', label: 'Vida útil estimada', unidad: 'h' },
    { key: 'rep_percent', label: 'Mantenimiento/reparación', unidad: '%' },
    { key: 'margen_default_pct', label: 'Margen sobre costo', unidad: '%' },
  ];

  async function guardar(key: keyof Omit<PricingConfig, 'updated_at'>, valorMostrado: number, pesos?: boolean) {
    if (!token || !Number.isFinite(valorMostrado) || valorMostrado < 0) return;
    const valor = Math.round(pesos ? valorMostrado * 100 : valorMostrado);
    setGuardando(key);
    try {
      const actualizado = await patchPricingConfig(token, { [key]: valor });
      setConfig(actualizado);
    } catch {
      /* el campo vuelve a su valor guardado en el próximo render */
    } finally {
      setGuardando(null);
    }
  }

  return (
    <div>
      <p class="m-0 mb-3 text-[12px] text-[var(--text-muted)]">
        Usados para el costo/precio automático de piezas de clientes (desglose "›" en Piezas de
        clientes).
      </p>
      <div class="grid gap-3 sm:grid-cols-2">
        {CAMPOS.map(({ key, label, unidad, pesos }) => (
          <CampoCosto
            key={key}
            label={label}
            unidad={unidad}
            valor={pesos ? config[key] / 100 : config[key]}
            guardando={guardando === key}
            onGuardar={(v) => void guardar(key, v, pesos)}
          />
        ))}
      </div>
    </div>
  );
}

function CampoCosto({
  label,
  unidad,
  valor,
  guardando,
  onGuardar,
}: {
  label: string;
  unidad: string;
  valor: number;
  guardando: boolean;
  onGuardar: (v: number) => void;
}) {
  const [texto, setTexto] = useState(String(valor));
  return (
    <label class="flex flex-col gap-1">
      <span class="text-[12px] text-[var(--text-muted)]">{label}</span>
      <span class="flex items-center gap-1.5">
        <input
          type="number"
          min="0"
          class="w-24 rounded border border-[var(--border-soft)] bg-[var(--surface-card)] px-2 py-1.5 text-sm disabled:opacity-60"
          value={texto}
          disabled={guardando}
          onInput={(e) => setTexto((e.target as HTMLInputElement).value)}
          onBlur={() => onGuardar(Number(texto))}
        />
        <span class="text-[11px] text-[var(--text-faint)]">{unidad}</span>
      </span>
    </label>
  );
}
