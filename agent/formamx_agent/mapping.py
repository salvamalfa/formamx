"""Cálculo del ams_mapping: color de cada filamento del 3MF → ranura del AMS.

En el comando de impresión de Bambu, `ams_mapping` es una lista donde el
índice es el número de filamento del 3MF rebanado (0-based) y el valor es la
ranura global del AMS (0-3). Ejemplo: un cuerpo_tapa rebanado con F1=blanco y
F2=rojo, con blanco en la ranura 0 y rojo en la 2, produce [0, 2].
"""

from __future__ import annotations


class FilamentoFaltante(Exception):
    def __init__(self, faltantes: list[str]):
        self.faltantes = faltantes
        super().__init__('faltan en el AMS: ' + ', '.join(faltantes))


def compute_mapping(colors: list[str], spools: list[dict]) -> list[int]:
    """colors: colores en el orden de filamentos del 3MF.
    spools: las 4 ranuras del dashboard ({'slot': 0-3, 'color_id': str | None}).
    Si un color está en varias ranuras se usa la de número menor.
    """
    slot_por_color: dict[str, int] = {}
    for s in sorted(spools, key=lambda s: s['slot']):
        color = s.get('color_id')
        if color is not None and color not in slot_por_color:
            slot_por_color[color] = s['slot']

    faltantes = sorted({c for c in colors if c not in slot_por_color})
    if faltantes:
        raise FilamentoFaltante(faltantes)
    return [slot_por_color[c] for c in colors]


def pick_file(files_dir, file_key: str, material: str):
    """Ruta del 3MF a imprimir: el material va explícito en el nombre
    (tessera.petg.gcode.3mf). No existen archivos genéricos: el G-code fija
    temperaturas al rebanar, así que un archivo sin material es ambiguo.
    """
    if not material:
        raise ValueError('material requerido para elegir el archivo')
    return files_dir / f'{file_key}.{material.lower()}.gcode.3mf'
