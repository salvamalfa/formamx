import { useEffect, useState } from 'preact/hooks';
import { getResumen, type Mensaje, type Resumen } from '../../../lib/taller';
import { useTallerCore } from '../coreData';
import { useSession } from '../hooks/useSession';
import { nombreContacto, personaKeyDeMensaje, useMensajes } from '../mensajesData';
import { PedidosTable } from '../pedidos/PedidosTable';
import { navigate } from '../router';
import { money } from '../ui/format';
import { BarChart, mesCorto } from './BarChart';

const CARD =
  'rounded-[var(--radius-m)] border border-[var(--border-soft)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-card)]';

const MESES_LARGOS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

function mesLargo(mes: string): string {
  const idx = Number(mes.slice(5, 7)) - 1;
  return MESES_LARGOS[idx] ?? mes;
}

function saludo(): string {
  const hora = new Date().getHours();
  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

// Semana ISO 8601 (lunes-domingo, la semana 1 es la que contiene el primer
// jueves del año). Estándar del calendario en español.
function semanaISO(fecha: Date): number {
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const dia = (d.getUTCDay() + 6) % 7; // lunes = 0
  d.setUTCDate(d.getUTCDate() - dia + 3);
  const primerJueves = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const diffDias = Math.round((d.getTime() - primerJueves.getTime()) / 86_400_000);
  return 1 + Math.round(diffDias / 7);
}

function rangoSerie(mes1: string, mes2: string): string {
  const [anio1] = mes1.split('-');
  const [anio2] = mes2.split('-');
  const a = mesCorto(mes1);
  const b = mesCorto(mes2);
  return anio1 === anio2 ? `${a} — ${b} ${anio2}` : `${a} ${anio1} — ${b} ${anio2}`;
}

interface Hilo {
  key: string;
  nombre: string;
  canal: string;
  preview: string;
  persona: string;
  created_at: string;
}

// Agrupa los mensajes entrantes sin responder por persona, toma el más
// reciente de cada grupo y devuelve hasta 2, ordenados por recencia. La llave
// de persona (`cus_…` o `ext:<nombre>`) sale de personaKeyDeMensaje, la misma
// convención que usa personasDe y el router, para no duplicarla aquí.
function hilosPendientes(mensajes: Mensaje[]): Hilo[] {
  const pendientes = mensajes.filter(
    (m) => m.direction === 'in' && (m.status === 'nuevo' || m.status === 'leido'),
  );
  const grupos = new Map<string, Mensaje[]>();
  for (const m of pendientes) {
    const key = personaKeyDeMensaje(m);
    const lista = grupos.get(key) ?? [];
    lista.push(m);
    grupos.set(key, lista);
  }
  return [...grupos.values()]
    .map((lista) => {
      const ultimo = [...lista].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      const persona = personaKeyDeMensaje(ultimo);
      return {
        key: persona,
        nombre: ultimo.customer_name ?? nombreContacto(ultimo),
        canal: ultimo.channel,
        preview: ultimo.body,
        persona,
        created_at: ultimo.created_at,
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 2);
}

// Vista "Resumen": el aterrizaje del taller. KPIs de la semana, ventas por
// mes, los hilos que faltan por responder y el top de pedidos activos. Hace
// su propio fetch a /resumen (refresco cada 60s, igual que el resto de los
// paneles); "Pedidos activos" reusa PedidosTable directamente sobre el core
// (no necesita esperar a /resumen) y "Sin responder" reusa MensajesProvider
// (para cuadrar exacto con el badge del sidebar).
export function ResumenPanel() {
  const { token } = useSession();
  const core = useTallerCore();
  const { mensajes, sinResponder } = useMensajes();
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(t: string) {
    setLoading(true);
    try {
      setResumen(await getResumen(t));
      setError(null);
    } catch {
      setError('No se pudo cargar el resumen. Reintenta.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    void load(token);
    const timer = setInterval(() => void load(token), 60_000);
    return () => clearInterval(timer);
  }, [token]);

  const ahora = new Date();
  const metaHeader = `${MESES_LARGOS[ahora.getMonth()]} ${ahora.getFullYear()} · semana ${semanaISO(ahora)}`;
  const hilos = hilosPendientes(mensajes);

  const serie = resumen?.ventas.serie ?? [];
  const mesActual = serie.length > 0 ? serie[serie.length - 1].mes : null;
  const mesAnterior = serie.length > 1 ? serie[serie.length - 2].mes : null;
  const delta = resumen?.ventas.delta_pct ?? null;

  return (
    <div>
      <header class="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1
            class="m-0 text-[32px] font-bold"
            style={{ fontFamily: 'var(--font-display)', letterSpacing: 'var(--tracking-display)' }}
          >
            {saludo()}
          </h1>
          <p class="m-0 mt-2 text-sm text-[var(--text-muted)]">Así va el taller esta semana.</p>
        </div>
        <span class="meta-caps text-[var(--text-faint)]">{metaHeader}</span>
      </header>

      {error && (
        <p class="mt-4 text-sm text-[var(--support)]" role="alert">
          {error}
        </p>
      )}

      {!resumen && loading && <p class="meta-caps mt-6 text-[var(--text-faint)]">cargando…</p>}

      {resumen && (
        <>
          <div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label={mesActual ? `Ventas de ${mesLargo(mesActual)}` : 'Ventas del mes'}
              valor={money(resumen.ventas.mes_mxn)}
              meta={
                delta === null
                  ? '—'
                  : `${delta >= 0 ? '+' : ''}${delta}% vs ${mesAnterior ? mesLargo(mesAnterior) : 'mes anterior'}`
              }
              metaColor={delta === null ? undefined : delta >= 0 ? 'var(--support)' : 'var(--naranja-oscuro)'}
            />
            <Kpi
              label="Pedidos activos"
              valor={String(resumen.pedidos.activos)}
              meta={`${resumen.pedidos.sin_empezar} sin empezar`}
            />
            <Kpi label="Sin responder" valor={String(sinResponder)} meta="en clientes" />
            <Kpi
              label="Material bajo"
              valor={String(resumen.material_bajo)}
              meta={resumen.material_bajo > 0 ? 'revisar inventario' : 'todo en orden'}
              metaColor={resumen.material_bajo > 0 ? 'var(--naranja-oscuro)' : 'var(--support)'}
            />
          </div>

          <div class="mt-5 grid gap-4 lg:grid-cols-[2fr_1fr]">
            <div class={CARD}>
              <div class="mb-5 flex flex-wrap items-baseline justify-between gap-2">
                <h2 class="m-0 text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                  Ventas por mes
                </h2>
                {serie.length > 1 && (
                  <span class="meta-caps text-[var(--text-faint)]">
                    {rangoSerie(serie[0].mes, serie[serie.length - 1].mes)}
                  </span>
                )}
              </div>
              <BarChart serie={serie} />
            </div>

            <div
              class="flex flex-col rounded-[var(--radius-m)] p-5 text-[var(--blanco)] shadow-[var(--shadow-card)]"
              style={{ background: 'var(--bosque)' }}
            >
              <h2 class="m-0 mb-2 text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                Sin responder
              </h2>
              {sinResponder > 0 ? (
                <>
                  <p class="m-0 mb-4 text-[13px]" style={{ color: 'rgba(255,255,255,0.7)' }}>
                    {sinResponder === 1
                      ? 'Un mensaje espera respuesta.'
                      : `${sinResponder} mensajes esperan respuesta.`}
                  </p>
                  <div class="flex flex-1 flex-col gap-3">
                    {hilos.map((h) => (
                      <button
                        key={h.key}
                        type="button"
                        class="rounded-[var(--radius-s)] bg-[rgba(255,255,255,0.08)] p-3 text-left transition-colors hover:bg-[rgba(255,255,255,0.16)]"
                        onClick={() => navigate({ vista: 'clientes', persona: h.persona })}
                      >
                        <div class="flex items-center justify-between gap-2">
                          <span class="truncate text-[13px] font-medium">{h.nombre}</span>
                          <span
                            class="shrink-0 text-[10px] uppercase"
                            style={{ color: 'rgba(255,255,255,0.55)' }}
                          >
                            {h.canal}
                          </span>
                        </div>
                        <div
                          class="mt-1 line-clamp-2 text-[13px]"
                          style={{ color: 'rgba(255,255,255,0.75)' }}
                        >
                          {h.preview}
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p class="m-0 flex-1 text-[13px]" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  Nada pendiente por responder.
                </p>
              )}
              <button
                type="button"
                class="mt-4 self-start text-[13px] font-medium text-[var(--blanco)]"
                onClick={() => navigate({ vista: 'clientes' })}
              >
                Ir a clientes →
              </button>
            </div>
          </div>
        </>
      )}

      <div class="mt-5">
        <div class="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 class="m-0 text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
            Pedidos activos
          </h2>
          <button
            type="button"
            class="text-[13px] font-medium text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)]"
            onClick={() => navigate({ vista: 'proyectos', sub: 'pedidos' })}
          >
            Ver todos →
          </button>
        </div>
        <PedidosTable orders={core.orders} limit={4} />
      </div>
    </div>
  );
}

function Kpi({
  label,
  valor,
  meta,
  metaColor,
}: {
  label: string;
  valor: string;
  meta: string;
  metaColor?: string;
}) {
  return (
    <div class="rounded-[var(--radius-m)] border border-[var(--border-soft)] bg-[var(--surface-card)] px-5 py-4 shadow-[var(--shadow-card)]">
      <div class="meta-caps text-[var(--text-faint)]">{label}</div>
      <div class="mt-2 text-[24px] font-bold" style={{ fontFamily: 'var(--font-display)' }}>
        {valor}
      </div>
      <div class="mt-1 text-[13px]" style={{ color: metaColor ?? 'var(--text-muted)' }}>
        {meta}
      </div>
    </div>
  );
}
