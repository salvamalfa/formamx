"""Loop del agente: pregunta por trabajos, los imprime y reporta el desenlace.

Uso:  python -m formamx_agent [ruta\\a\\config.toml]
(por defecto busca config.toml en el directorio actual)
"""

from __future__ import annotations

import logging
import logging.handlers
import sys
import time
import tomllib
from pathlib import Path

from .api import TallerApi
from .mapping import FilamentoFaltante, compute_mapping, pick_file

log = logging.getLogger('formamx')

# Tras un error de impresora/red se espera esto antes de volver a intentar,
# para no martillar ni la API ni la impresora.
ERROR_BACKOFF_SECONDS = 300

# Cada cuánto se sube al taller lo que la impresora dice tener en el AMS.
AMS_SYNC_SECONDS = 300


def setup_logging(log_file: str | None) -> None:
    fmt = logging.Formatter('%(asctime)s %(levelname)s %(name)s: %(message)s')
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    console = logging.StreamHandler()
    console.setFormatter(fmt)
    root.addHandler(console)
    if log_file:
        rotating = logging.handlers.RotatingFileHandler(
            log_file, maxBytes=2_000_000, backupCount=3, encoding='utf-8'
        )
        rotating.setFormatter(fmt)
        root.addHandler(rotating)


def process_job(job: dict, spools: list[dict], api: TallerApi, printer, files_dir: Path, dry: bool) -> None:
    job_id = job['id']
    subtask = f"{job['order_id']} {job['part']}"
    log.info('trabajo %s: %s (colores %s)', job_id, subtask, job['colors'])

    # 1. Mapear colores → ranuras ANTES de tocar la impresora.
    try:
        ams_mapping = compute_mapping(job['colors'], spools)
    except FilamentoFaltante as err:
        api.report(job_id, 'failed', message=str(err))
        log.warning('trabajo %s sin filamentos: %s', job_id, err)
        return

    # 2. Localizar el 3MF rebanado. El material de la ranura mapeada decide la
    #    variante (p. ej. PETG usa tessera.petg.gcode.3mf); si no hay variante
    #    se usa el archivo genérico. En ensayo no es obligatorio que exista.
    material = next(
        (s.get('material') for s in spools if s['slot'] == ams_mapping[0]),
        None,
    )
    local_file, es_variante = pick_file(files_dir, job['file_key'], material)
    if material and not es_variante:
        log.info(
            'sin variante %s para %s; uso el archivo genérico %s',
            material, job['file_key'], local_file.name,
        )
    if not local_file.exists():
        if dry:
            log.warning('[ensayo] falta %s; continúo de todos modos', local_file)
        else:
            api.report(job_id, 'failed', message=f'no encuentro {local_file}')
            return

    # 3. Subir y arrancar; el progreso se reporta cada >=5 % para no gastar
    #    cuota de la base de datos.
    last_reported = -5

    def on_progress(pct: int) -> None:
        nonlocal last_reported
        if pct - last_reported >= 5 or pct == 100:
            last_reported = pct
            try:
                api.report(job_id, 'printing', progress_pct=pct)
            except Exception as err:
                log.warning('no pude reportar progreso: %s', err)

    printer.upload(local_file, 'model.3mf')
    api.report(job_id, 'printing', progress_pct=0)
    ok, error = printer.print_file('model.3mf', subtask, ams_mapping, on_progress)
    # La impresión tocó la cama (bien o mal): se activa el candado y no llegan
    # más trabajos hasta que confirmes en /taller que la despejaste.
    if ok:
        api.report(job_id, 'done', progress_pct=100, bed_dirty=True)
        log.info('trabajo %s terminado; esperando confirmación de cama despejada', job_id)
    else:
        api.report(job_id, 'failed', message=error or 'fallo sin detalle', bed_dirty=True)
        log.error('trabajo %s falló: %s', job_id, error)


def main() -> None:
    cfg_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('config.toml')
    cfg = tomllib.loads(cfg_path.read_text(encoding='utf-8'))
    setup_logging(cfg.get('log_file'))

    dry = bool(cfg.get('dry_run', False))
    if dry:
        from .dryrun import DryPrinter

        printer = DryPrinter(float(cfg.get('dry_run_seconds', 20)))
        log.info('modo ENSAYO: no se toca la impresora')
    else:
        from .printer import BambuPrinter

        p = cfg['printer']
        printer = BambuPrinter(p['ip'], p['serial'], p['access_code'])

    api = TallerApi(cfg['api_base'], cfg['agent_token'])
    files_dir = Path(cfg.get('files_dir', '.'))
    poll = float(cfg.get('poll_seconds', 20))
    last_ams_sync = 0.0
    log.info('agente listo; preguntando cada %ss a %s', poll, cfg['api_base'])

    while True:
        try:
            # Sincroniza lo que la impresora dice tener en el AMS (material y
            # color por ranura) para que /taller lo muestre solo.
            if time.monotonic() - last_ams_sync >= AMS_SYNC_SECONDS:
                try:
                    trays = printer.read_ams()
                    if trays:
                        api.sync_ams(trays)
                        log.info('AMS sincronizado: %s', trays)
                except Exception as err:
                    log.warning('no pude sincronizar el AMS: %s', err)
                last_ams_sync = time.monotonic()

            # En real, no reclamar si la impresora ya está trabajando (por
            # ejemplo, algo lanzado a mano desde Bambu Studio).
            if not dry and printer.current_state() == 'RUNNING':
                log.info('impresora ocupada; espero')
                time.sleep(poll)
                continue

            nxt = api.next_job()
            if not nxt:
                time.sleep(poll)
                continue
            process_job(nxt['job'], nxt['spools'], api, printer, files_dir, dry)
        except KeyboardInterrupt:
            log.info('detenido a mano')
            return
        except Exception as err:
            # Impresora apagada, sin internet, API caída…: pausa larga y reintento.
            log.error('error del ciclo: %s; reintento en %ss', err, ERROR_BACKOFF_SECONDS)
            time.sleep(ERROR_BACKOFF_SECONDS)


if __name__ == '__main__':
    main()
