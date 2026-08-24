"""Lienzo mínimo para dibujar líneas y guardar un PNG, sin dependencias.

Se escribe a mano en vez de usar Pillow para que el agente no pida instalar
nada nuevo en la PC del taller: `zlib` y `struct` vienen con Python. Es lo justo
para la vista del rebanado (líneas de un píxel sobre un fondo liso), no una
librería de gráficos.
"""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

Color = tuple[int, int, int]


class Lienzo:
    def __init__(self, ancho: int, alto: int, fondo: Color):
        self.ancho = ancho
        self.alto = alto
        self.pixeles = bytearray(bytes(fondo) * (ancho * alto))

    def _punto(self, x: int, y: int, color: bytes) -> None:
        if 0 <= x < self.ancho and 0 <= y < self.alto:
            i = (y * self.ancho + x) * 3
            self.pixeles[i : i + 3] = color

    def linea(self, x0: float, y0: float, x1: float, y1: float, color: Color) -> None:
        """Bresenham entero: suficiente para un trazo de un píxel."""
        crudo = bytes(color)
        x0, y0, x1, y1 = round(x0), round(y0), round(x1), round(y1)
        dx = abs(x1 - x0)
        dy = -abs(y1 - y0)
        paso_x = 1 if x0 < x1 else -1
        paso_y = 1 if y0 < y1 else -1
        error = dx + dy
        while True:
            self._punto(x0, y0, crudo)
            if x0 == x1 and y0 == y1:
                return
            doble = 2 * error
            if doble >= dy:
                error += dy
                x0 += paso_x
            if doble <= dx:
                error += dx
                y0 += paso_y

    def guardar_png(self, destino: Path) -> Path:
        # Cada fila del PNG va precedida por su byte de filtro; 0 = sin filtro.
        crudo = bytearray()
        ancho_fila = self.ancho * 3
        for y in range(self.alto):
            crudo.append(0)
            crudo += self.pixeles[y * ancho_fila : (y + 1) * ancho_fila]

        def trozo(tipo: bytes, datos: bytes) -> bytes:
            return (
                struct.pack('>I', len(datos))
                + tipo
                + datos
                + struct.pack('>I', zlib.crc32(tipo + datos) & 0xFFFFFFFF)
            )

        # Color type 2 = RGB, 8 bits por canal, sin entrelazado.
        cabecera = struct.pack('>IIBBBBB', self.ancho, self.alto, 8, 2, 0, 0, 0)
        png = (
            b'\x89PNG\r\n\x1a\n'
            + trozo(b'IHDR', cabecera)
            + trozo(b'IDAT', zlib.compress(bytes(crudo), 6))
            + trozo(b'IEND', b'')
        )
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_bytes(png)
        return destino
