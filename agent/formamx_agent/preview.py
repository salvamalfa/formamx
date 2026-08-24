"""Dibuja la vista del rebanado a partir del G-code, sin depender de la GPU.

Bambu Studio incrusta miniaturas del plato en el 3MF, pero solo cuando puede
renderizar con una sesión gráfica; en una máquina sin pantalla el 3MF viene sin
ellas. Y la bandera `--export-png` del CLI no es alternativa: incluirla hace
que el rebanador rechace todos los parámetros (ver docs/STL_CLIENTES.md).

Así que aquí se dibuja el recorrido real del extrusor leyendo el G-code que el
propio 3MF lleva dentro. Es el rebanado de verdad: sale la pieza en la
orientación con la que se va a imprimir y con sus soportes, porque son
extrusiones como cualquier otra.
"""

from __future__ import annotations

import logging
import math
import re
import zipfile
from pathlib import Path

from .lienzo import Lienzo

log = logging.getLogger('formamx.preview')

LIENZO = (900, 700)
MARGEN = 24
FONDO = (247, 247, 245)  # --hueso
# Degradado por altura para que se lea el volumen: abajo azul, arriba tinta.
COLOR_ABAJO = (46, 109, 164)  # --azul
COLOR_ARRIBA = (26, 26, 24)  # --tinta

# Techo de segmentos a dibujar. Una pieza grande puede traer millones; pasado
# este número se saltan capas de forma pareja (la silueta no cambia).
MAX_SEGMENTOS = 250_000

_EJES = re.compile(r'([XYZEF])(-?\d*\.?\d+)')


def _valores(linea: str) -> dict[str, float]:
    return {eje: float(valor) for eje, valor in _EJES.findall(linea)}


def leer_segmentos(gcode: str) -> list[tuple[float, float, float, float, float, float]]:
    """Saca los segmentos que extruyen material: (x0,y0,z0, x1,y1,z1)."""
    x = y = z = 0.0
    relativo = True  # Bambu emite M83; se respeta M82 por si acaso
    e_previa = 0.0
    segmentos: list[tuple[float, float, float, float, float, float]] = []

    for linea in gcode.splitlines():
        if not linea or linea[0] == ';':
            continue
        codigo = linea.split(' ', 1)[0]
        if codigo == 'M83':
            relativo = True
            continue
        if codigo == 'M82':
            relativo = False
            continue
        if codigo == 'G92':
            v = _valores(linea)
            if 'E' in v:
                e_previa = v['E']
            continue
        # G2/G3 son arcos; se dibujan como recta a su destino: a esta escala la
        # diferencia no se ve y evita implementar interpolación circular.
        if codigo not in ('G0', 'G1', 'G2', 'G3'):
            continue

        v = _valores(linea)
        nx, ny, nz = v.get('X', x), v.get('Y', y), v.get('Z', z)
        e = v.get('E')
        if e is not None:
            extruye = e > 0 if relativo else e > e_previa
            if not relativo:
                e_previa = e
        else:
            extruye = False

        if extruye and (nx != x or ny != y):
            segmentos.append((x, y, z, nx, ny, nz))
        x, y, z = nx, ny, nz

    return segmentos


def _adelgazar(segmentos: list, tope: int = MAX_SEGMENTOS) -> list:
    if len(segmentos) <= tope:
        return segmentos
    paso = math.ceil(len(segmentos) / tope)
    return segmentos[::paso]


def dibujar(segmentos: list, destino: Path) -> Path | None:
    """Proyecta los segmentos en isométrica y guarda el PNG."""
    if not segmentos:
        return None

    # Isométrica clásica: X y Y se abren en 30°. La fórmula ya devuelve
    # coordenadas de pantalla (el eje vertical crece hacia abajo), así que
    # restar Z hace que lo más alto de la pieza quede arriba en la imagen.
    cos30, sin30 = math.cos(math.radians(30)), math.sin(math.radians(30))

    def proyectar(px: float, py: float, pz: float) -> tuple[float, float]:
        return (px - py) * cos30, (px + py) * sin30 - pz

    puntos = [proyectar(*s[:3]) for s in segmentos] + [proyectar(*s[3:]) for s in segmentos]
    xs = [p[0] for p in puntos]
    ys = [p[1] for p in puntos]
    min_x, max_x, min_y, max_y = min(xs), max(xs), min(ys), max(ys)
    ancho, alto = max(max_x - min_x, 1e-6), max(max_y - min_y, 1e-6)
    escala = min((LIENZO[0] - 2 * MARGEN) / ancho, (LIENZO[1] - 2 * MARGEN) / alto)
    off_x = (LIENZO[0] - ancho * escala) / 2 - min_x * escala
    off_y = (LIENZO[1] - alto * escala) / 2 - min_y * escala

    zs = [s[2] for s in segmentos]
    z_min, z_max = min(zs), max(zs)
    rango_z = max(z_max - z_min, 1e-6)

    lienzo = Lienzo(LIENZO[0], LIENZO[1], FONDO)
    # De abajo hacia arriba: las capas altas tapan a las bajas y la pieza se
    # ve sólida en vez de como una maraña de alambre.
    for x0, y0, z0, x1, y1, z1 in sorted(segmentos, key=lambda s: s[2]):
        a = proyectar(x0, y0, z0)
        b = proyectar(x1, y1, z1)
        t = (z0 - z_min) / rango_z
        color = tuple(
            round(COLOR_ABAJO[i] + (COLOR_ARRIBA[i] - COLOR_ABAJO[i]) * t) for i in range(3)
        )
        lienzo.linea(
            a[0] * escala + off_x,
            a[1] * escala + off_y,
            b[0] * escala + off_x,
            b[1] * escala + off_y,
            color,
        )

    return lienzo.guardar_png(destino)


def render_desde_3mf(tmf_path: Path, destino: Path) -> Path | None:
    """Lee el G-code de dentro del 3MF y devuelve el PNG dibujado."""
    try:
        with zipfile.ZipFile(tmf_path) as z:
            nombres = [n for n in z.namelist() if n.startswith('Metadata/') and n.endswith('.gcode')]
            if not nombres:
                log.warning('el 3MF no trae G-code; sin vista previa')
                return None
            gcode = z.read(sorted(nombres)[0]).decode('utf-8', 'ignore')
    except (zipfile.BadZipFile, OSError) as err:
        log.warning('no pude leer el 3MF para la vista previa: %s', err)
        return None

    segmentos = _adelgazar(leer_segmentos(gcode))
    if not segmentos:
        log.warning('el G-code no trae extrusiones; sin vista previa')
        return None
    return dibujar(segmentos, destino)
