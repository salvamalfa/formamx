"""Cliente de la API del taller (workers/api), autenticado con AGENT_TOKEN."""

from __future__ import annotations

import requests


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

    def report(
        self,
        job_id: str,
        status: str,
        progress_pct: int | None = None,
        message: str | None = None,
    ) -> None:
        body: dict = {'status': status}
        if progress_pct is not None:
            body['progress_pct'] = progress_pct
        if message is not None:
            body['message'] = message
        r = self.session.post(
            f'{self.base}/api/agent/jobs/{job_id}/status', json=body, timeout=self.timeout
        )
        r.raise_for_status()
