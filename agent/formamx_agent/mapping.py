"""Cálculo del ams_mapping: color de cada filamento del 3MF → ranura del AMS.

En el comando de impresión de Bambu, `ams_mapping` es una lista donde el
índice es el número de filamento del 3MF rebanado (0-based) y el valor es la
ranura global del AMS (0-3). Ejemplo: un cuerpo_tapa rebanado con F1=blanco y
F2=rojo, con blanco en la ranura 0 y rojo en la 2, produce [0, 2].
"""

from __future__ import annotations

from pathlib import Path


class FilamentoFaltante(Exception):
    def __init__(self, faltantes: list[str], material: str | None = None):
        self.faltantes = faltantes
        self.material = material
        detalle = ', '.join(faltantes)
        if material:
            detalle += f' en {material}'
        super().__init__('faltan en el AMS: ' + detalle)


def compute_mapping(
    colors: list[str], spools: list[dict], material: str | None = None
) -> list[int]:
    """colors: colores en el orden de filamentos del 3MF.
    spools: las 4 ranuras del dashboard ({'slot': 0-3, 'color_id': str | None}).
    Si un color está en varias ranuras se usa la de número menor.

    `material` acota la búsqueda a las ranuras de ese material. Hace falta
    cuando el archivo ya se rebanó para un material concreto (las piezas de
    cliente): si hay azul en PETG en la ranura 0 y azul en PLA en la 2, sin
    acotar se elegiría la 0 y se buscaría un 3MF de PETG que no existe.
    """
    candidatas = sorted(spools, key=lambda s: s['slot'])
    if material is not None:
        candidatas = [s for s in candidatas if s.get('material') == material]

    slot_por_color: dict[str, int] = {}
    for s in candidatas:
        color = s.get('color_id')
        if color is not None and color not in slot_por_color:
            slot_por_color[color] = s['slot']

    faltantes = sorted({c for c in colors if c not in slot_por_color})
    if faltantes:
        raise FilamentoFaltante(faltantes, material)
    return [slot_por_color[c] for c in colors]


def pick_file(files_dir, file_key: str, material: str):
    """Ruta del 3MF a imprimir: el material va explícito en el nombre
    (tessera.petg.gcode.3mf). No existen archivos genéricos: el G-code fija
    temperaturas al rebanar, así que un archivo sin material es ambiguo.

    Contención: la ruta resuelta debe quedar dentro de files_dir. Hoy file_key
    lo genera el server desde un catálogo cerrado, pero el agente no confía en
    la API: un file_key con '..' o una ruta absoluta (si la API se
    comprometiera) no puede sacar al agente de su carpeta de archivos.
    """
    if not material:
        raise ValueError('material requerido para elegir el archivo')
    base = Path(files_dir).resolve()
    target = base / f'{file_key}.{material.lower()}.gcode.3mf'
    resolved = target.resolve()
    if resolved != base and base not in resolved.parents:
        raise ValueError(f'ruta fuera de files_dir: {file_key!r}')
    return target
