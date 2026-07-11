import type { PrintJob } from '../../../lib/taller';
import { JOB_STATUS_LABEL, PART_LABEL } from './labels';

// Estado de las piezas en la impresora, con barra de progreso.
export function JobsStrip({ jobs, onRetry }: { jobs: PrintJob[]; onRetry: (job: PrintJob) => void }) {
  return (
    <div class="flex flex-col gap-1.5 rounded-[var(--radius-s)] bg-[var(--crema)] p-2.5">
      {jobs.map((job) => (
        <div key={job.id} class="flex flex-col gap-1">
          <div class="flex items-center gap-2.5">
            <span class="meta-caps w-24 shrink-0 text-[10px] text-[var(--text-muted)]">
              {PART_LABEL[job.part]}
            </span>
            <div class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--crema-oscuro)]">
              <div
                class={`h-full rounded-[var(--radius-pill)] ${
                  job.status === 'failed' ? 'bg-[var(--naranja)]' : 'bg-[var(--support)]'
                }`}
                style={{
                  width: `${job.status === 'done' ? 100 : (job.progress_pct ?? 0)}%`,
                  transition: 'width 300ms var(--ease-out)',
                }}
              />
            </div>
            <span class="meta-caps w-20 shrink-0 text-right text-[10px] text-[var(--text-faint)]">
              {JOB_STATUS_LABEL[job.status]}
              {job.status === 'printing' && job.progress_pct != null ? ` ${job.progress_pct}%` : ''}
            </span>
          </div>
          {/* El motivo y Reintentar van en su propia línea: en móvil el
              renglón de arriba no tiene espacio y el botón quedaba cortado. */}
          {job.status === 'failed' && (
            <div class="flex items-center justify-between gap-2">
              <p
                class="m-0 min-w-0 flex-1 text-[10px] text-[var(--naranja-oscuro)]"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {job.message ?? 'falló sin detalle'}
              </p>
              <button
                type="button"
                class="btn btn-sm btn-ghost shrink-0"
                onClick={() => onRetry(job)}
              >
                Reintentar
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
