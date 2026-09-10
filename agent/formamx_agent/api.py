"""Cliente de la API del taller (workers/api), autenticado con AGENT_TOKEN."""

from __future__ import annotations

from pathlib import Path

import requests

# Trozo de descarga del STL. Los archivos de cliente llegan a decenas de MB.
CHUNK = 1024 * 1024


class TallerApi:
    def __init__(self, base: str, token: str, timeout: int = 20):
        self.base = base.rstrip('/')
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers['Authorization'] = f'Bearer {token}'

    def next_job(self) -> dict | None:
        """Reclama el siguiente trabajo. None = cola vacía.

        Devuelve {'job': {...}, 'spools': [{'slot', 'color_id'}, ...]} — las
        bobinas vienen en cada claim para calcular el ams_mapping con datos
        frescos del dashboard.
        """
        r = self.session.get(f'{self.base}/api/agent/jobs/next', timeout=self.timeout)
        if r.status_code == 204:
            return None
        r.raise_for_status()
        return r.json()

    def sync_ams(self, trays: list[dict]) -> None:
        """Sube lo que la impresora dice tener en el AMS (material y color hex)."""
        r = self.session.post(
            f'{self.base}/api/agent/ams', json={'slots': trays}, timeout=self.timeout
        )
        r.raise_for_status()

    def report(
        self,
        job_id: str,
        status: str,
        progress_pct: int | None = None,
        message: str | None = None,
        bed_dirty: bool = False,
        dry: bool = False,
    ) -> None:
        body: dict = {'status': status}
        if progress_pct is not None:
            body['progress_pct'] = progress_pct
        if message is not None:
            body['message'] = message
        if bed_dirty:
            body['bed_dirty'] = True
        # En modo ensayo (DryPrinter) no hubo impresión real: el worker no debe
        # sumar horas de máquina ni descontar gramos de ninguna bobina por esto.
        if dry:
            body['dry_run'] = True
        r = self.session.post(
            f'{self.base}/api/agent/jobs/{job_id}/status', json=body, timeout=self.timeout
        )
        r.raise_for_status()

    # ---- Piezas STL de clientes (rebanado) ---------------------------------

    def next_slice(self) -> dict | None:
        """Reclama la siguiente pieza por rebanar. None = nada pendiente."""
        r = self.session.get(f'{self.base}/api/agent/custom-prints/next', timeout=self.timeout)
        if r.status_code == 204:
            return None
        r.raise_for_status()
        return r.json()['print']

    def download_stl(self, print_id: str, dest: Path) -> None:
        """Baja el STL o proyecto 3MF a `dest`. Por trozos: los archivos de cliente pesan."""
        dest.parent.mkdir(parents=True, exist_ok=True)
        with self.session.get(
            f'{self.base}/api/agent/custom-prints/{print_id}/stl',
            stream=True,
            timeout=(self.timeout, 300),
        ) as r:
            r.raise_for_status()
            with dest.open('wb') as f:
                for trozo in r.iter_content(chunk_size=CHUNK):
                    f.write(trozo)

    def report_slice(
        self,
        print_id: str,
        ok: bool,
        seconds: int | None = None,
        grams: float | None = None,
        message: str | None = None,
    ) -> bool:
        """Reporta el desenlace del rebanado.

        Devuelve False si el taller ya no espera este resultado (409: la pieza
        se canceló mientras se rebanaba). No es un error: el agente lo anota y
        sigue.
        """
        body: dict = {'ok': ok}
        if seconds is not None:
            body['seconds'] = seconds
        if grams is not None:
            body['grams'] = grams
        if message is not None:
            body['message'] = message
        r = self.session.post(
            f'{self.base}/api/agent/custom-prints/{print_id}/slice-result',
            json=body,
            timeout=self.timeout,
        )
        if r.status_code == 409:
            return False
        r.raise_for_status()
        return True

    def upload_preview(self, print_id: str, png: Path) -> None:
        """Sube la imagen del plato. Es un extra: el llamador tolera el fallo."""
        r = self.session.post(
            f'{self.base}/api/agent/custom-prints/{print_id}/preview',
            data=png.read_bytes(),
            headers={'Content-Type': 'image/png'},
            timeout=self.timeout,
        )
        r.raise_for_status()
