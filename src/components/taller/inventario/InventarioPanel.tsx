import { useEffect, useState } from 'preact/hooks';
import { COLORS, DEFAULTS, MODELS } from '../../../config/lamps';
import {
  createBobina,
  createPieza,
  getBobinas,
  getPiezas,
  MATERIAL_BAJO_G,
  patchBobina,
  patchPieza,
  type Bobina,
  type Pieza,
} from '../../../lib/taller';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useSession } from '../hooks/useSession';
import { colorLabel, colorSwatch, familiaDeHex, SPOOL_COLORS } from '../ui/colores';
import { formatSync } from '../ui/format';
import {
  BOBINA_STATUS_LABEL,
  MATERIALS,
  PIEZA_STATUS_LABEL,
  PRODUCT_LABEL,
  QC_LABEL,
} from './labels';

const FORM_CARD =
  'rounded-[var(--radius-m)] border border-[var(--border-soft)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-card)]';

const TABLE_CARD =
  'rounded-[var(--radius-m)] border border-[var(--border-soft)] bg-[var(--surface-card)] p-2 shadow-[var(--shadow-card)] sm:p-4';

// Badge pill "bajo": mismo par de tokens en toda la vista Proyectos
// (inventario aquí, el Resumen futuro lo reusará para su KPI).
function BadgeBajo() {
  return (
    <span class="meta-caps shrink-0 rounded-[var(--radius-pill)] bg-[var(--naranja-claro)] px-2 py-0.5 text-[10px] text-[var(--naranja-oscuro)]">
      bajo
    </span>
  );
}

// Módulo "Inventario": el almacén del taller en dos secciones — bobinas de
// filamento y piezas terminadas. Cada sección hace su propio fetch (no entra
// a TallerCoreData); si el worker aún no tiene las rutas del módulo, muestra
// el error genérico y no rompe nada. El AMS físico vive en Impresora: aquí
// solo está lo que hay en la repisa.
export function InventarioPanel() {
  const [seccion, setSeccion] = useState<'bobinas' | 'piezas'>('bobinas');

  return (
    <section class="mt-12">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="m-0 text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
          Inventario
        </h2>
        <div class="flex gap-2">
          {(['bobinas', 'piezas'] as const).map((s) => (
            <button
              key={s}
              type="button"
              class={`chip ${seccion === s ? 'activo' : ''}`}
              onClick={() => setSeccion(s)}
            >
              {s === 'bobinas' ? 'Bobinas' : 'Piezas'}
            </button>
          ))}
        </div>
      </div>
      {seccion === 'bobinas' ? <Bobinas /> : <Piezas />}
    </section>
  );
}

// ---- Bobinas ---------------------------------------------------------------

// El botón primario del siguiente paso por estado; agotarla siempre es
// explícito (el worker no auto-agota al llegar a 0 g). El texto es un verbo
// ("Marcar…"), no el nombre del estado destino: si el botón dice lo mismo
// que el badge al que se convierte, parece que el botón "renombra" el badge
// en vez de avanzar la bobina.
const NEXT_STEP_BOBINA: Record<string, { status: string; label: string }> = {
  nueva: { status: 'en_uso', label: 'Marcar en uso' },
  en_uso: { status: 'agotada', label: 'Marcar agotada' },
};

const BOBINAS_COLS = '1.5fr 90px 110px 230px 1.2fr';

function Bobinas() {
  const { token } = useSession();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [bobinas, setBobinas] = useState<Bobina[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [formAbierto, setFormAbierto] = useState(false);

  async function load(t: string) {
    setLoading(true);
    try {
      setBobinas(await getBobinas(t));
      setError(null);
    } catch {
      setError('No se pudo cargar. Reintenta.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    void load(token);
    const timer = setInterval(() => void load(token), 30_000);
    return () => clearInterval(timer);
  }, [token]);

  // Cambio de estado optimista con rollback; agotada sale de la lista
  // (el worker la filtra por default).
  async function avanzar(bobina: Bobina, status: string) {
    if (!token) return;
    const previas = bobinas;
    setAviso(null);
    setBobinas((prev) =>
      status === 'agotada'
        ? prev.filter((b) => b.id !== bobina.id)
        : prev.map((b) => (b.id === bobina.id ? { ...b, status } : b)),
    );
    try {
      const actualizada = await patchBobina(token, bobina.id, { status });
      if (status !== 'agotada') {
        setBobinas((prev) => prev.map((b) => (b.id === bobina.id ? actualizada : b)));
      }
    } catch {
      setBobinas(previas);
      setAviso('No se pudo actualizar la bobina.');
    }
  }

  // Peso restante optimista con rollback (Salva la pesa y corrige a mano).
  async function guardarPeso(bobina: Bobina, weight_left_g: number) {
    if (!token) return;
    const previas = bobinas;
    setAviso(null);
    setBobinas((prev) => prev.map((b) => (b.id === bobina.id ? { ...b, weight_left_g } : b)));
    try {
      const actualizada = await patchBobina(token, bobina.id, { weight_left_g });
      setBobinas((prev) => prev.map((b) => (b.id === bobina.id ? actualizada : b)));
    } catch {
      setBobinas(previas);
      setAviso('No se pudo guardar el peso.');
    }
  }

  return (
    <>
      <div class="mt-3 flex flex-wrap items-baseline justify-between gap-2">
        <p class="meta-caps m-0 text-[var(--text-faint)]">
          {loading && bobinas.length === 0 ? 'cargando…' : `${bobinas.length} en el almacén`}
        </p>
        <div class="flex gap-2">
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            onClick={() => token && void load(token)}
          >
            Actualizar
          </button>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            onClick={() => setFormAbierto((v) => !v)}
          >
            Nueva bobina
          </button>
        </div>
      </div>

      {error && (
        <p class="mt-3 text-sm text-[var(--support)]" role="alert">
          {error}
        </p>
      )}
      {aviso && <p class="mt-3 text-sm text-[var(--support)]">{aviso}</p>}

      {formAbierto && token && (
        <NuevaBobina
          token={token}
          onCreada={(bobina) => {
            setBobinas((prev) => [bobina, ...prev]);
            setFormAbierto(false);
          }}
        />
      )}

      {!loading && !error && bobinas.length === 0 && (
        <p class="mt-4 text-sm text-[var(--text-muted)]">
          Aún no hay bobinas registradas. Da de alta las que tengas en la repisa.
        </p>
      )}

      {bobinas.length > 0 && (
        <div class={`${TABLE_CARD} mt-4`}>
          {isDesktop && (
            <div
              class="meta-caps grid gap-3 px-2 py-2 text-[11px] text-[var(--text-faint)]"
              style={{ gridTemplateColumns: BOBINAS_COLS }}
            >
              <span>Color</span>
              <span>Material</span>
              <span>Marca</span>
              <span>Restante</span>
              <span class="justify-self-end">Estado</span>
            </div>
          )}
          <div class="flex flex-col">
            {bobinas.map((b) =>
              isDesktop ? (
                <BobinaRow
                  key={b.id}
                  bobina={b}
                  onAvanzar={(status) => void avanzar(b, status)}
                  onGuardarPeso={(peso) => void guardarPeso(b, peso)}
                />
              ) : (
                <BobinaCard
                  key={b.id}
                  bobina={b}
                  onAvanzar={(status) => void avanzar(b, status)}
                  onGuardarPeso={(peso) => void guardarPeso(b, peso)}
                />
              ),
            )}
          </div>
        </div>
      )}

    </>
  );
}

function BobinaRow({
  bobina,
  onAvanzar,
  onGuardarPeso,
}: {
  bobina: Bobina;
  onAvanzar: (status: string) => void;
  onGuardarPeso: (peso: number) => void;
}) {
  const [peso, setPeso] = useState(String(bobina.weight_left_g));
  const siguiente = NEXT_STEP_BOBINA[bobina.status];
  const pesoNum = Number(peso);
  const pesoValido = Number.isInteger(pesoNum) && pesoNum >= 0;
  const bajo = bobina.weight_left_g < MATERIAL_BAJO_G;

  return (
    <div
      class="grid items-center gap-3 border-t border-[var(--border-soft)] px-2 py-3"
      style={{ gridTemplateColumns: BOBINAS_COLS }}
    >
      <span class="flex min-w-0 items-center gap-2">
        <span
          class="size-4 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.18)]"
          style={{ background: bobina.color_hex ?? (bobina.color_id ? colorSwatch(bobina.color_id) : '#ccc') }}
        />
        <span class="truncate text-sm font-semibold">{colorLabel(bobina.color_id)}</span>
      </span>
      <span class="text-[12px] text-[var(--text-muted)]">
        {bobina.material}
      </span>
      <span class="truncate text-sm text-[var(--text-muted)]">{bobina.brand ?? '—'}</span>
      <span class="flex flex-nowrap items-center gap-1.5 whitespace-nowrap">
        <input
          type="number"
          class="w-16 shrink-0 rounded border border-[var(--border-soft)] bg-[var(--surface-card)] px-1.5 py-1 text-sm"
          aria-label="Peso restante en gramos"
          min="0"
          step="1"
          value={peso}
          onInput={(e) => setPeso((e.target as HTMLInputElement).value)}
        />
        <span class="shrink-0 text-[11px] text-[var(--text-faint)]">/ {bobina.weight_g} g</span>
        <button
          type="button"
          class="btn btn-ghost-claro btn-sm shrink-0 disabled:cursor-default disabled:opacity-60"
          disabled={!pesoValido || pesoNum === bobina.weight_left_g}
          onClick={() => pesoValido && onGuardarPeso(pesoNum)}
        >
          Guardar
        </button>
      </span>
      <span class="flex flex-wrap items-center justify-end gap-1.5">
        {bajo && <BadgeBajo />}
        <span class="meta-caps shrink-0 text-[var(--text-muted)]">
          {BOBINA_STATUS_LABEL[bobina.status] ?? bobina.status}
        </span>
        {siguiente && (
          <button
            type="button"
            class="btn btn-primary btn-sm shrink-0"
            onClick={() => onAvanzar(siguiente.status)}
          >
            {siguiente.label}
          </button>
        )}
        {bobina.status === 'nueva' && (
          <button
            type="button"
            class="btn btn-ghost-claro btn-sm shrink-0"
            onClick={() => onAvanzar('agotada')}
          >
            Marcar agotada
          </button>
        )}
      </span>
    </div>
  );
}

// Card apilada de móvil: mismos datos y acciones que la fila de escritorio,
// en el layout de antes de F5 (una sola representación en el DOM a la vez,
// elegida por useMediaQuery — ver hooks/useMediaQuery.ts).
function BobinaCard({
  bobina,
  onAvanzar,
  onGuardarPeso,
}: {
  bobina: Bobina;
  onAvanzar: (status: string) => void;
  onGuardarPeso: (peso: number) => void;
}) {
  const [peso, setPeso] = useState(String(bobina.weight_left_g));
  const siguiente = NEXT_STEP_BOBINA[bobina.status];
  const pesoNum = Number(peso);
  const pesoValido = Number.isInteger(pesoNum) && pesoNum >= 0;
  const bajo = bobina.weight_left_g < MATERIAL_BAJO_G;

  return (
    <div class="flex flex-col gap-2 border-t border-[var(--border-soft)] px-2 py-3 first:border-t-0">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span
            class="size-5 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.18)]"
            style={{ background: bobina.color_hex ?? (bobina.color_id ? colorSwatch(bobina.color_id) : '#ccc') }}
          />
          <p class="m-0 text-sm font-semibold">{colorLabel(bobina.color_id)}</p>
        </div>
        <div class="flex items-center gap-2">
          {bajo && <BadgeBajo />}
          <span class="meta-caps text-[var(--text-muted)]">
            {BOBINA_STATUS_LABEL[bobina.status] ?? bobina.status}
          </span>
        </div>
      </div>
      <p class="meta-caps m-0 text-[var(--text-faint)]">
        {bobina.brand ? `${bobina.brand} · ` : ''}
        {bobina.material} · {formatSync(bobina.created_at)}
      </p>
      <p class="m-0 text-sm">
        {bobina.weight_left_g} g / {bobina.weight_g} g
      </p>
      <div class="mt-1 flex flex-wrap items-center gap-2">
        <input
          type="number"
          class="w-20 rounded border border-[var(--border-soft)] bg-[var(--surface-card)] px-2 py-1 text-sm"
          aria-label="Peso restante en gramos"
          min="0"
          step="1"
          value={peso}
          onInput={(e) => setPeso((e.target as HTMLInputElement).value)}
        />
        <button
          type="button"
          class="btn btn-ghost disabled:cursor-default disabled:opacity-60"
          disabled={!pesoValido || pesoNum === bobina.weight_left_g}
          onClick={() => pesoValido && onGuardarPeso(pesoNum)}
        >
          Guardar
        </button>
        {siguiente && (
          <button type="button" class="btn btn-primary" onClick={() => onAvanzar(siguiente.status)}>
            {siguiente.label}
          </button>
        )}
        {bobina.status === 'nueva' && (
          <button type="button" class="btn btn-ghost" onClick={() => onAvanzar('agotada')}>
            Marcar agotada
          </button>
        )}
      </div>
    </div>
  );
}

function NuevaBobina({
  token,
  onCreada,
}: {
  token: string;
  onCreada: (b: Bobina) => void;
}) {
  // El color va en dos piezas: la familia (para agrupar y etiquetar) y el tono
  // exacto, que es lo que de verdad empareja con lo que reporta el AMS. Elegir
  // la familia siembra el tono con su swatch, y de ahí se afina al color real
  // del filamento que Salva tiene en la mano.
  const [colorId, setColorId] = useState('');
  const [colorHex, setColorHex] = useState('');
  const [material, setMaterial] = useState('PLA');
  const [marca, setMarca] = useState('');
  const [pesoG, setPesoG] = useState('1000');
  const [costo, setCosto] = useState('');
  const [creando, setCreando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const pesoNum = Number(pesoG);
  const pesoValido = Number.isInteger(pesoNum) && pesoNum > 0;

  async function crear() {
    if (!pesoValido) return;
    setCreando(true);
    setAviso(null);
    const costoNum = Number(costo);
    try {
      const bobina = await createBobina(token, {
        ...(colorId ? { color_id: colorId } : {}),
        ...(colorHex ? { color_hex: colorHex } : {}),
        ...(material.trim() ? { material: material.trim() } : {}),
        ...(marca.trim() ? { brand: marca.trim() } : {}),
        weight_g: pesoNum,
        // El costo se captura en pesos y viaja en centavos, como amount_mxn.
        ...(costo.trim() && Number.isFinite(costoNum)
          ? { cost_mxn: Math.round(costoNum * 100) }
          : {}),
      });
      onCreada(bobina);
    } catch {
      setAviso('No se pudo registrar la bobina.');
    } finally {
      setCreando(false);
    }
  }

  return (
    <div class={`${FORM_CARD} mt-4`}>
      <h3 class="meta-caps m-0 text-[var(--text-muted)]">Nueva bobina</h3>
      <div class="mt-3 flex flex-col gap-3">
        <div class="flex items-center gap-2">
          <select
            class="input-brand min-w-0 flex-1"
            aria-label="Color"
            value={colorId}
            onChange={(e) => {
              const id = (e.target as HTMLSelectElement).value;
              setColorId(id);
              setColorHex(id ? colorSwatch(id).toUpperCase() : '');
            }}
          >
            <option value="">Elige el color</option>
            {SPOOL_COLORS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            type="color"
            aria-label="Tono exacto"
            title="Tono exacto del filamento"
            class="size-9 shrink-0 cursor-pointer rounded border border-[var(--border-soft)] bg-[var(--surface-card)] p-0.5 disabled:cursor-default disabled:opacity-50"
            disabled={!colorId}
            value={colorHex || '#FFFFFF'}
            onInput={(e) => {
              // El tono manda: si Salva lo arrastra hasta otra familia, el
              // select la sigue. El worker deriva la familia del hex de todas
              // formas, así que dejarlos discrepar solo mentiría en pantalla.
              const v = (e.target as HTMLInputElement).value.toUpperCase();
              setColorHex(v);
              const familia = familiaDeHex(v);
              if (familia) setColorId(familia);
            }}
          />
        </div>
        <input
          type="text"
          class="input-brand"
          placeholder="Material"
          list="materiales-inventario"
          value={material}
          onInput={(e) => setMaterial((e.target as HTMLInputElement).value)}
        />
        <datalist id="materiales-inventario">
          {MATERIALS.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <input
          type="text"
          class="input-brand"
          placeholder="Marca"
          value={marca}
          onInput={(e) => setMarca((e.target as HTMLInputElement).value)}
        />
        <label class="flex flex-col gap-1">
          <span class="text-[12px] text-[var(--text-muted)]">Peso de la bobina</span>
          <span class="flex items-center gap-1.5">
            <input
              type="number"
              class="input-brand"
              aria-label="Peso en gramos"
              min="1"
              step="1"
              value={pesoG}
              onInput={(e) => setPesoG((e.target as HTMLInputElement).value)}
            />
            <span class="shrink-0 text-[12px] text-[var(--text-faint)]">g</span>
          </span>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-[12px] text-[var(--text-muted)]">Costo (opcional)</span>
          <span class="flex items-center gap-1.5">
            <span class="shrink-0 text-[12px] text-[var(--text-faint)]">$</span>
            <input
              type="number"
              class="input-brand"
              aria-label="Costo en pesos"
              min="0"
              value={costo}
              onInput={(e) => setCosto((e.target as HTMLInputElement).value)}
            />
            <span class="shrink-0 text-[12px] text-[var(--text-faint)]">MXN</span>
          </span>
        </label>
        <div class="flex flex-wrap items-center gap-3">
          <button
            type="button"
            class="btn btn-primary disabled:cursor-default disabled:opacity-60"
            disabled={creando || !pesoValido}
            onClick={() => void crear()}
          >
            Agregar bobina
          </button>
          {aviso && <p class="m-0 text-sm text-[var(--support)]">{aviso}</p>}
        </div>
      </div>
    </div>
  );
}

// ---- Piezas ----------------------------------------------------------------

// Acciones por estado; vendida y merma sacan la pieza de la lista.
const PIEZA_ACCIONES: Record<string, { status: string; label: string; primary?: boolean }[]> = {
  en_stock: [
    { status: 'reservada', label: 'Reservar', primary: true },
    { status: 'vendida', label: 'Vendida' },
    { status: 'merma', label: 'Merma' },
  ],
  reservada: [
    { status: 'vendida', label: 'Vendida', primary: true },
    { status: 'en_stock', label: 'A stock' },
    { status: 'merma', label: 'Merma' },
  ],
};

const PIEZAS_COLS = '1.6fr 110px 100px 160px 1.3fr';

function Piezas() {
  const { token } = useSession();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [piezas, setPiezas] = useState<Pieza[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [formAbierto, setFormAbierto] = useState(false);

  async function load(t: string) {
    setLoading(true);
    try {
      setPiezas(await getPiezas(t));
      setError(null);
    } catch {
      setError('No se pudo cargar. Reintenta.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    void load(token);
    const timer = setInterval(() => void load(token), 30_000);
    return () => clearInterval(timer);
  }, [token]);

  // Cambio de estado optimista con rollback; vendida y merma salen de la
  // lista (el worker las filtra por default).
  async function avanzar(pieza: Pieza, status: string) {
    if (!token) return;
    const previas = piezas;
    const sale = status === 'vendida' || status === 'merma';
    setAviso(null);
    setPiezas((prev) =>
      sale
        ? prev.filter((p) => p.id !== pieza.id)
        : prev.map((p) => (p.id === pieza.id ? { ...p, status } : p)),
    );
    try {
      const actualizada = await patchPieza(token, pieza.id, { status });
      if (!sale) {
        setPiezas((prev) => prev.map((p) => (p.id === pieza.id ? actualizada : p)));
      }
    } catch {
      setPiezas(previas);
      setAviso('No se pudo actualizar la pieza.');
    }
  }

  // Ubicación optimista con rollback; cadena vacía la borra.
  async function guardarUbicacion(pieza: Pieza, location: string) {
    if (!token) return;
    const previas = piezas;
    setAviso(null);
    setPiezas((prev) =>
      prev.map((p) => (p.id === pieza.id ? { ...p, location: location.trim() || null } : p)),
    );
    try {
      const actualizada = await patchPieza(token, pieza.id, { location });
      setPiezas((prev) => prev.map((p) => (p.id === pieza.id ? actualizada : p)));
    } catch {
      setPiezas(previas);
      setAviso('No se pudo guardar la ubicación.');
    }
  }

  return (
    <>
      <div class="mt-3 flex flex-wrap items-baseline justify-between gap-2">
        <p class="meta-caps m-0 text-[var(--text-faint)]">
          {loading && piezas.length === 0 ? 'cargando…' : `${piezas.length} en el taller`}
        </p>
        <div class="flex gap-2">
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            onClick={() => token && void load(token)}
          >
            Actualizar
          </button>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            onClick={() => setFormAbierto((v) => !v)}
          >
            Nueva pieza
          </button>
        </div>
      </div>

      {error && (
        <p class="mt-3 text-sm text-[var(--support)]" role="alert">
          {error}
        </p>
      )}
      {aviso && <p class="mt-3 text-sm text-[var(--support)]">{aviso}</p>}

      {formAbierto && token && (
        <NuevaPieza
          token={token}
          onCreada={(pieza) => {
            setPiezas((prev) => [pieza, ...prev]);
            setFormAbierto(false);
          }}
        />
      )}

      {!loading && !error && piezas.length === 0 && (
        <p class="mt-4 text-sm text-[var(--text-muted)]">
          Sin piezas en stock. Registra las que vayas terminando.
        </p>
      )}

      {piezas.length > 0 && (
        <div class={`${TABLE_CARD} mt-4`}>
          {isDesktop && (
            <div
              class="meta-caps grid gap-3 px-2 py-2 text-[11px] text-[var(--text-faint)]"
              style={{ gridTemplateColumns: PIEZAS_COLS }}
            >
              <span>Producto</span>
              <span>Estado</span>
              <span>QC</span>
              <span>Ubicación</span>
              <span class="justify-self-end">Acciones</span>
            </div>
          )}
          <div class="flex flex-col">
            {piezas.map((p) =>
              isDesktop ? (
                <PiezaRow
                  key={p.id}
                  pieza={p}
                  onAvanzar={(status) => void avanzar(p, status)}
                  onGuardarUbicacion={(location) => void guardarUbicacion(p, location)}
                />
              ) : (
                <PiezaCard
                  key={p.id}
                  pieza={p}
                  onAvanzar={(status) => void avanzar(p, status)}
                  onGuardarUbicacion={(location) => void guardarUbicacion(p, location)}
                />
              ),
            )}
          </div>
        </div>
      )}
    </>
  );
}

function describePieza(p: Pieza): string {
  const base = PRODUCT_LABEL[p.product_id] ?? p.product_id;
  if (!p.config) return base;
  const modelo = MODELS.find((m) => m.id === p.config!.model)?.label ?? p.config.model;
  return `${base} ${modelo}`;
}

function PiezaRow({
  pieza,
  onAvanzar,
  onGuardarUbicacion,
}: {
  pieza: Pieza;
  onAvanzar: (status: string) => void;
  onGuardarUbicacion: (location: string) => void;
}) {
  const [ubicacion, setUbicacion] = useState(pieza.location ?? '');
  const acciones = PIEZA_ACCIONES[pieza.status] ?? [];

  return (
    <div
      class="grid items-center gap-3 border-t border-[var(--border-soft)] px-2 py-3"
      style={{ gridTemplateColumns: PIEZAS_COLS }}
    >
      <span class="min-w-0">
        <span class="block truncate text-sm font-semibold">{describePieza(pieza)}</span>
        {pieza.config && (
          <span
            class="mt-0.5 block truncate text-[11px] text-[var(--text-faint)]"
          >
            pantalla {colorLabel(pieza.config.pantalla)} · tapa {colorLabel(pieza.config.tapa)}
          </span>
        )}
      </span>
      <span class="meta-caps text-[var(--text-muted)]">
        {PIEZA_STATUS_LABEL[pieza.status] ?? pieza.status}
      </span>
      <span class="meta-caps text-[var(--text-muted)]">
        {pieza.qc_status ? (QC_LABEL[pieza.qc_status] ?? pieza.qc_status) : '—'}
      </span>
      <span class="flex items-center gap-2">
        <input
          type="text"
          class="input-brand w-32"
          placeholder="Ubicación"
          aria-label="Ubicación"
          value={ubicacion}
          onInput={(e) => setUbicacion((e.target as HTMLInputElement).value)}
        />
        <button
          type="button"
          class="btn btn-ghost-claro btn-sm disabled:cursor-default disabled:opacity-60"
          disabled={ubicacion.trim() === (pieza.location ?? '')}
          onClick={() => onGuardarUbicacion(ubicacion)}
        >
          Guardar
        </button>
      </span>
      <span class="flex flex-wrap items-center justify-end gap-2">
        {acciones.map((a) => (
          <button
            key={a.status}
            type="button"
            class={`btn btn-sm ${a.primary ? 'btn-primary' : 'btn-ghost-claro'}`}
            onClick={() => onAvanzar(a.status)}
          >
            {a.label}
          </button>
        ))}
      </span>
    </div>
  );
}

// Card apilada de móvil: mismo layout que antes de F5.
function PiezaCard({
  pieza,
  onAvanzar,
  onGuardarUbicacion,
}: {
  pieza: Pieza;
  onAvanzar: (status: string) => void;
  onGuardarUbicacion: (location: string) => void;
}) {
  const [ubicacion, setUbicacion] = useState(pieza.location ?? '');
  const acciones = PIEZA_ACCIONES[pieza.status] ?? [];

  return (
    <div class="flex flex-col gap-2 border-t border-[var(--border-soft)] px-2 py-3 first:border-t-0">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <p class="m-0 text-sm font-semibold">{describePieza(pieza)}</p>
        <div class="flex gap-2">
          <span class="meta-caps text-[var(--text-muted)]">
            {PIEZA_STATUS_LABEL[pieza.status] ?? pieza.status}
          </span>
          {pieza.qc_status && (
            <span class="meta-caps text-[var(--text-muted)]">
              {QC_LABEL[pieza.qc_status] ?? pieza.qc_status}
            </span>
          )}
        </div>
      </div>
      <p class="meta-caps m-0 text-[var(--text-faint)]">
        {pieza.config
          ? `pantalla ${colorLabel(pieza.config.pantalla)} · tapa ${colorLabel(pieza.config.tapa)} · `
          : ''}
        {formatSync(pieza.created_at)}
      </p>
      <div class="mt-1 flex flex-wrap items-center gap-2">
        <input
          type="text"
          class="input-brand w-40"
          placeholder="Ubicación"
          aria-label="Ubicación"
          value={ubicacion}
          onInput={(e) => setUbicacion((e.target as HTMLInputElement).value)}
        />
        <button
          type="button"
          class="btn btn-ghost disabled:cursor-default disabled:opacity-60"
          disabled={ubicacion.trim() === (pieza.location ?? '')}
          onClick={() => onGuardarUbicacion(ubicacion)}
        >
          Guardar
        </button>
      </div>
      {acciones.length > 0 && (
        <div class="flex flex-wrap gap-2">
          {acciones.map((a) => (
            <button
              key={a.status}
              type="button"
              class={`btn ${a.primary ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => onAvanzar(a.status)}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NuevaPieza({
  token,
  onCreada,
}: {
  token: string;
  onCreada: (p: Pieza) => void;
}) {
  const [productId, setProductId] = useState('lampara');
  const [modelId, setModelId] = useState(DEFAULTS.modelId);
  const [pantalla, setPantalla] = useState(DEFAULTS.pantallaColorId);
  const [tapa, setTapa] = useState(DEFAULTS.tapaColorId);
  const [ubicacion, setUbicacion] = useState('');
  const [creando, setCreando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function crear() {
    setCreando(true);
    setAviso(null);
    try {
      const pieza = await createPieza(token, {
        product_id: productId,
        ...(productId === 'lampara'
          ? { config: { model: modelId, pantalla, tapa } }
          : {}),
        ...(ubicacion.trim() ? { location: ubicacion.trim() } : {}),
      });
      onCreada(pieza);
    } catch {
      setAviso('No se pudo registrar la pieza.');
    } finally {
      setCreando(false);
    }
  }

  return (
    <div class={`${FORM_CARD} mt-4`}>
      <h3 class="meta-caps m-0 text-[var(--text-muted)]">Nueva pieza</h3>
      <div class="mt-3 flex flex-col gap-3">
        <select
          class="input-brand"
          aria-label="Producto"
          value={productId}
          onChange={(e) => setProductId((e.target as HTMLSelectElement).value)}
        >
          {Object.entries(PRODUCT_LABEL).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        {productId === 'lampara' && (
          <>
            <select
              class="input-brand"
              aria-label="Modelo"
              value={modelId}
              onChange={(e) => setModelId((e.target as HTMLSelectElement).value)}
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <select
              class="input-brand"
              aria-label="Color de pantalla"
              value={pantalla}
              onChange={(e) => setPantalla((e.target as HTMLSelectElement).value)}
            >
              {COLORS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              class="input-brand"
              aria-label="Color de tapa"
              value={tapa}
              onChange={(e) => setTapa((e.target as HTMLSelectElement).value)}
            >
              {COLORS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </>
        )}
        <input
          type="text"
          class="input-brand"
          placeholder="Ubicación (opcional)"
          value={ubicacion}
          onInput={(e) => setUbicacion((e.target as HTMLInputElement).value)}
        />
        <div class="flex flex-wrap items-center gap-3">
          <button
            type="button"
            class="btn btn-primary disabled:cursor-default disabled:opacity-60"
            disabled={creando}
            onClick={() => void crear()}
          >
            Agregar pieza
          </button>
          {aviso && <p class="m-0 text-sm text-[var(--support)]">{aviso}</p>}
        </div>
      </div>
    </div>
  );
}
