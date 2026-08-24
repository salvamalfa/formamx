"""Genera los perfiles autónomos que necesita el CLI de Bambu Studio.

El CLI NO resuelve la herencia de perfiles: si le pasas los JSON de
`resources/profiles/BBL/` tal cual, rebana con valores por defecto en silencio
(cama a 35 °C, densidad 0, peso 0 g) y saca piezas que se despegan. Tampoco lee
los archivos "template" donde vive el G-code de arranque real de la A1.

Este módulo aplana la cadena de herencia, fusiona esos templates y fija el tipo
de placa, dejando un JSON autónomo por perfil. Se corre UNA vez por instalación
o actualización de Bambu Studio; la salida vive junto al config del agente,
FUERA del repo:

    python -m formamx_agent.flatten_profiles "<...>/resources/profiles/BBL" <destino>

Detalle y porqué de cada maña en docs/STL_CLIENTES.md.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Placa que usa el taller. La temperatura de cama sale de aquí: con el default
# del CLI (Cool Plate) el PLA rebana a 35 °C y la pieza se despega.
BED_TYPE = 'Textured PEI Plate'

# Perfiles que se generan: archivo de salida → (subcarpeta, nombre del perfil).
# Los nombres son los de Bambu Studio; no se inventan perfiles propios.
PERFILES: dict[str, tuple[str, str]] = {
    'machine.json': ('machine', 'Bambu Lab A1 0.4 nozzle'),
    'process_estandar.json': ('process', '0.20mm Standard @BBL A1'),
    'filament_pla.json': ('filament', 'Bambu PLA Basic @BBL A1'),
    'filament_petg.json': ('filament', 'Bambu PETG Basic @BBL A1'),
}


class PerfilFaltante(Exception):
    """No existe un perfil con ese nombre en la instalación de Bambu Studio."""


def _leer(profiles_dir: Path, kind: str, name: str) -> dict:
    ruta = profiles_dir / kind / f'{name}.json'
    if not ruta.is_file():
        raise PerfilFaltante(f'no encuentro {kind}/{name}.json en {profiles_dir}')
    return json.loads(ruta.read_text(encoding='utf-8'))


def aplanar(profiles_dir: Path, kind: str, name: str) -> dict:
    """Resuelve `inherits` y devuelve un perfil autónomo (el hijo pisa al padre)."""
    cadena: list[dict] = []
    vistos: set[str] = set()
    actual: str | None = name
    while actual:
        if actual in vistos:
            raise PerfilFaltante(f'herencia circular en {kind}/{actual}')
        vistos.add(actual)
        perfil = _leer(profiles_dir, kind, actual)
        cadena.append(perfil)
        actual = perfil.get('inherits') or None

    fusionado: dict = {}
    for perfil in reversed(cadena):  # del ancestro más lejano al hijo
        fusionado.update(perfil)
    fusionado.pop('inherits', None)
    return fusionado


def fusionar_templates(profiles_dir: Path, name: str, perfil: dict) -> dict:
    """Mete el G-code real de la máquina, que vive en archivos aparte.

    Sin esto el 3MF sale con un arranque genérico: sin nivelado ni la secuencia
    propia de la A1 (M970/M1002). Verificación rápida: el gcode debe traer M970.
    """
    for ruta in sorted((profiles_dir / 'machine').glob(f'{name} template *.json')):
        plantilla = json.loads(ruta.read_text(encoding='utf-8'))
        for clave, valor in plantilla.items():
            if clave.endswith('_gcode'):
                perfil[clave] = valor
    return perfil


def generar(profiles_dir: Path, out_dir: Path) -> list[Path]:
    """Escribe los perfiles aplanados en out_dir y devuelve sus rutas."""
    out_dir.mkdir(parents=True, exist_ok=True)
    escritos: list[Path] = []
    for salida, (kind, name) in PERFILES.items():
        perfil = aplanar(profiles_dir, kind, name)
        if kind == 'machine':
            perfil = fusionar_templates(profiles_dir, name, perfil)
        if kind == 'process':
            perfil['curr_bed_type'] = BED_TYPE
        destino = out_dir / salida
        destino.write_text(json.dumps(perfil, indent=1, ensure_ascii=False), encoding='utf-8')
        escritos.append(destino)
    return escritos


def main() -> None:
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    profiles_dir, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    if not (profiles_dir / 'machine').is_dir():
        print(f'no parece la carpeta de perfiles de Bambu Studio: {profiles_dir}')
        sys.exit(1)
    for ruta in generar(profiles_dir, out_dir):
        print(f'{ruta}  ({len(json.loads(ruta.read_text(encoding="utf-8")))} claves)')
    print(f'\nlisto. Apunta profiles_dir del config del agente a: {out_dir}')


if __name__ == '__main__':
    main()
