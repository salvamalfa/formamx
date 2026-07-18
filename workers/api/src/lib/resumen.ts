// Agregados del dashboard /taller (vista Resumen). Lógica pura y testeable:
// `now` es inyectable para fijar la ventana de meses en pruebas. Todos los
// montos van en CENTAVOS (convención del repo). Sin grafo de estados: solo
// lecturas de conteo/suma sobre las tablas ya existentes.

// Umbral de "material bajo": una bobina con menos de esto se marca para
// reponer. Espejo del comentario en src/lib/taller/inventario.ts.
export const MATERIAL_BAJO_G = 200;

export interface ResumenVentasPunto {
  mes: string; // 'YYYY-MM'
  total_mxn: number; // centavos
}

export interface Resumen {
  ventas: {
    mes_mxn: number;
    mes_anterior_mxn: number;
    delta_pct: number | null;
    serie: ResumenVentasPunto[]; // 6 elementos ascendente, termina en el mes actual
  };
  pedidos: {
    activos: number;
    sin_empezar: number;
  };
  mensajes_sin_responder: number;
  material_bajo: number;
}

// Las 6 llaves 'YYYY-MM' desde `now` (UTC), ascendente, terminando en el mes
// actual. La misma ventana que filtra el SQL ('-5 months' desde start of month).
function ventanaMeses(now: Date): string[] {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-11
  const keys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

interface VentaMesRow {
  mes: string | null;
  total_mxn: number | null;
}
interface PedidosAggRow {
  activos: number | null;
  sin_empezar: number | null;
}
interface ConteoRow {
  n: number | null;
}

export async function getResumen(db: D1Database, now: Date = new Date()): Promise<Resumen> {
  const nowIso = now.toISOString();

  const [ventasRes, pedidosRes, mensajesRes, materialRes] = await db.batch([
    // Ventas por mes: usa paid_at (existe desde 0009, backfilleada). Se
    // agrupan los pagados no cancelados de los últimos 6 meses (start of month
    // - 5 meses cubre el mes actual + 5 anteriores).
    db
      .prepare(
        `SELECT strftime('%Y-%m', paid_at) AS mes, SUM(amount_mxn) AS total_mxn
         FROM orders
         WHERE paid_at IS NOT NULL AND status != 'cancelada'
           AND paid_at >= datetime(?, 'start of month', '-5 months')
         GROUP BY mes`,
      )
      .bind(nowIso),
    // Pedidos en curso: activos = lo que aún requiere trabajo; sin_empezar =
    // pagados que todavía no entran a producción.
    db.prepare(
      `SELECT
         SUM(CASE WHEN status IN ('pagada','en_cola','imprimiendo','lista') THEN 1 ELSE 0 END) AS activos,
         SUM(CASE WHEN status IN ('pagada','en_cola') THEN 1 ELSE 0 END) AS sin_empezar
       FROM orders`,
    ),
    // Mensajes recibidos sin responder (nuevos o leídos, pero no respondidos).
    db.prepare(
      "SELECT COUNT(*) AS n FROM messages WHERE direction = 'in' AND status IN ('nuevo','leido')",
    ),
    // Bobinas vivas por debajo del umbral de reposición.
    db
      .prepare("SELECT COUNT(*) AS n FROM bobinas WHERE status != 'agotada' AND weight_left_g < ?")
      .bind(MATERIAL_BAJO_G),
  ]);

  // Ventas: el lib genera las 6 llaves y rellena los meses sin ventas con 0.
  const totalesPorMes = new Map<string, number>();
  for (const row of (ventasRes.results ?? []) as VentaMesRow[]) {
    if (row.mes) totalesPorMes.set(row.mes, row.total_mxn ?? 0);
  }
  const meses = ventanaMeses(now);
  const serie: ResumenVentasPunto[] = meses.map((mes) => ({
    mes,
    total_mxn: totalesPorMes.get(mes) ?? 0,
  }));
  const mes_mxn = serie[serie.length - 1].total_mxn;
  const mes_anterior_mxn = serie[serie.length - 2].total_mxn;
  const delta_pct =
    mes_anterior_mxn === 0
      ? null
      : Math.round(((mes_mxn - mes_anterior_mxn) / mes_anterior_mxn) * 1000) / 10;

  const pedidosRow = (pedidosRes.results?.[0] ?? {}) as PedidosAggRow;
  const mensajesRow = (mensajesRes.results?.[0] ?? {}) as ConteoRow;
  const materialRow = (materialRes.results?.[0] ?? {}) as ConteoRow;

  return {
    ventas: { mes_mxn, mes_anterior_mxn, delta_pct, serie },
    pedidos: {
      activos: pedidosRow.activos ?? 0,
      sin_empezar: pedidosRow.sin_empezar ?? 0,
    },
    mensajes_sin_responder: mensajesRow.n ?? 0,
    material_bajo: materialRow.n ?? 0,
  };
}
