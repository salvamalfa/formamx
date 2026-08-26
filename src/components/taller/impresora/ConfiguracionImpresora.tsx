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
// antes vivían fijos en el Apps Script de Salva, ahora editables aquí.
//
// Los inputs escriben en un BORRADOR, no en el servidor: nada se guarda hasta
// dar clic en "Guardar". Antes cada campo se mandaba solo en su blur, así que
// abrir el popup y teclear ya cambiaba el precio de las piezas sin forma de
// arrepentirse — y como el input no se re-sincronizaba con la respuesta, un
// valor rechazado se quedaba a la vista mintiendo sobre lo guardado.
type Clave = keyof Omit<PricingConfig, 'updated_at'>;

const CAMPOS: Array<{
  key: Clave;
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

const ES_PESOS = new Map(CAMPOS.map((c) => [c.key, Boolean(c.pesos)]));

type Borrador = Record<Clave, string>;

// Lo guardado (centavos para el dinero) → el texto que ve Salva (pesos).
const aBorrador = (config: PricingConfig): Borrador =>
  Object.fromEntries(
    CAMPOS.map(({ key, pesos }) => [key, String(pesos ? config[key] / 100 : config[key])]),
  ) as Borrador;

// El texto de un campo → el entero que espera el worker, o null si no sirve.
// Los pesos se redondean a centavos; el resto tiene que ser entero de por sí
// (no existe "1.5 minutos de mano de obra" en la tabla).
function aGuardado(key: Clave, texto: string): number | null {
  const n = Number(texto.trim());
  if (texto.trim() === '' || !Number.isFinite(n) || n < 0) return null;
  const valor = ES_PESOS.get(key) ? Math.round(n * 100) : n;
  return Number.isInteger(valor) ? valor : null;
}

function ConfigCostos() {
  const { token } = useSession();
  const [config, setConfig] = useState<PricingConfig | null>(null);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [invalidos, setInvalidos] = useState<Clave[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    if (!token) return;
    getPricingConfig(token)
      .then((c) => {
        setConfig(c);
        setBorrador(aBorrador(c));
      })
      .catch(() => {
        /* sin config todavía (worker viejo): el formulario no aparece */
      });
  }, [token]);

  if (!config || !borrador) return null;

  // Un campo cuenta como cambiado solo si su valor NORMALIZADO difiere: pasar
  // de "300" a "300.0" no ensucia el formulario ni manda un PATCH inútil.
  const cambios = CAMPOS.reduce<Partial<Record<Clave, number>>>((acc, { key }) => {
    const valor = aGuardado(key, borrador[key]);
    if (valor !== null && valor !== config[key]) acc[key] = valor;
    return acc;
  }, {});
  const sucio = CAMPOS.some(({ key }) => aGuardado(key, borrador[key]) !== config[key]);

  function editar(key: Clave, texto: string) {
    setBorrador((b) => (b ? { ...b, [key]: texto } : b));
    setInvalidos((prev) => prev.filter((k) => k !== key));
    setGuardado(false);
    setError(null);
  }

  function descartar() {
    setBorrador(aBorrador(config!));
    setInvalidos([]);
    setError(null);
    setGuardado(false);
  }

  async function guardar() {
    if (!token || !borrador) return;
    // Se valida TODO antes de mandar nada: un campo malo no debe dejar a
    // medias los otros siete.
    const malos = CAMPOS.filter(({ key }) => aGuardado(key, borrador[key]) === null).map(
      ({ key }) => key,
    );
    if (malos.length) {
      setInvalidos(malos);
      setError('Revisa los campos marcados: van enteros de 0 en adelante.');
      return;
    }
    setInvalidos([]);
    setError(null);
    if (!Object.keys(cambios).length) return;
    setGuardando(true);
    try {
      const actualizado = await patchPricingConfig(token, cambios);
      setConfig(actualizado);
      setBorrador(aBorrador(actualizado));
      setGuardado(true);
    } catch {
      setError('No se pudo guardar la configuración.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <p class="m-0 mb-3 text-[12px] text-[var(--text-muted)]">
        Usados para el costo/precio automático de piezas de clientes (desglose "›" en Piezas de
        clientes).
      </p>
      <div class="grid gap-3 sm:grid-cols-2">
        {CAMPOS.map(({ key, label, unidad }) => (
          <CampoCosto
            key={key}
            label={label}
            unidad={unidad}
            valor={borrador[key]}
            invalido={invalidos.includes(key)}
            disabled={guardando}
            onCambio={(v) => editar(key, v)}
          />
        ))}
      </div>

      {error && (
        <p class="mt-3 mb-0 text-[12px] text-[var(--support)]" role="alert">
          {error}
        </p>
      )}

      <div class="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border-soft)] pt-3">
        <span class="mr-auto text-[11px] text-[var(--text-faint)]" aria-live="polite">
          {sucio ? 'cambios sin guardar' : guardado ? 'guardado' : ''}
        </span>
        {sucio && (
          <button type="button" class="btn btn-sm btn-ghost-claro" onClick={descartar}>
            Descartar
          </button>
        )}
        <button
          type="button"
          class="btn btn-sm btn-primary disabled:cursor-default disabled:opacity-60"
          disabled={guardando || !sucio}
          onClick={() => void guardar()}
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}

function CampoCosto({
  label,
  unidad,
  valor,
  invalido,
  disabled,
  onCambio,
}: {
  label: string;
  unidad: string;
  valor: string;
  invalido: boolean;
  disabled: boolean;
  onCambio: (v: string) => void;
}) {
  return (
    <label class="flex flex-col gap-1">
      <span class="text-[12px] text-[var(--text-muted)]">{label}</span>
      <span class="flex items-center gap-1.5">
        <input
          type="number"
          min="0"
          class={`w-24 rounded border bg-[var(--surface-card)] px-2 py-1.5 text-sm disabled:opacity-60 ${
            invalido ? 'border-[var(--support)]' : 'border-[var(--border-soft)]'
          }`}
          value={valor}
          disabled={disabled}
          aria-invalid={invalido || undefined}
          onInput={(e) => onCambio((e.target as HTMLInputElement).value)}
        />
        <span class="text-[11px] text-[var(--text-faint)]">{unidad}</span>
      </span>
    </label>
  );
}
