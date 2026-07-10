"""Impresora falsa: ensaya el circuito completo sin tocar la Bambu.

Misma interfaz que BambuPrinter; "imprime" avanzando el progreso en
dry_run_seconds. No exige que el 3MF exista, para poder probar el flujo
antes de rebanar los archivos.
"""

from __future__ import annotations

import logging
import time

log = logging.getLogger('formamx.dryrun')


class DryPrinter:
    def __init__(self, seconds: float = 20):
        self.seconds = seconds

    def upload(self, local_path, remote_name: str = 'model.3mf') -> None:
        log.info('[ensayo] subiría %s como %s', local_path, remote_name)

    def current_state(self) -> str:
        return 'IDLE'

    def print_file(self, remote_name, subtask, ams_mapping, on_progress, max_hours=12):
        log.info('[ensayo] imprimiendo %s (ams_mapping=%s)', subtask, ams_mapping)
        steps = 10
        for i in range(steps + 1):
            on_progress(int(i * 100 / steps))
            time.sleep(self.seconds / steps)
        return True, None
