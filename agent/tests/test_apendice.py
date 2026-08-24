"""Vista del rebanado dibujada desde el G-code (agent/apendice/).

Fuera del camino de producción —el agente usa la miniatura de Bambu Studio—,
pero se prueba con el resto para que no se pudra: es el reemplazo listo para
una máquina que rebane sin sesión gráfica. Ver agent/apendice/README.md.
"""

import struct
import zipfile
import zlib

from apendice.lienzo import Lienzo
from apendice.preview import dibujar, leer_segmentos, render_desde_3mf

# ---- Vista del rebanado -----------------------------------------------------

GCODE_MINIMO = """
;comentario que se ignora
M83
G1 X10 Y10 Z0.2 F600
G1 X20 Y10 E0.5
G1 X20 Y20 E0.5
G1 X30 Y30 F9000
G1 X10 Y10 Z0.4
G1 X20 Y20 E0.8
"""


def test_solo_cuentan_los_movimientos_que_extruyen():
    segmentos = leer_segmentos(GCODE_MINIMO)
    # 3 con E; el viaje sin E (X30 Y30) y el cambio de capa no cuentan.
    assert len(segmentos) == 3
    assert segmentos[0][:2] == (10.0, 10.0)
    assert segmentos[0][3:5] == (20.0, 10.0)


def test_extrusion_absoluta_tambien_se_entiende():
    # Con M82 la E es acumulada: extruye solo si sube respecto a la anterior.
    absoluto = 'M82\nG1 X0 Y0 Z0.2\nG1 X10 Y0 E5\nG1 X20 Y0 E5\nG1 X30 Y0 E9\n'
    assert len(leer_segmentos(absoluto)) == 2


def test_los_arcos_cuentan_como_segmento():
    assert len(leer_segmentos('M83\nG1 X0 Y0 Z0.2\nG2 X10 Y10 I5 J5 E1\n')) == 1


def test_dibuja_un_png_de_verdad(tmp_path):
    destino = dibujar(leer_segmentos(GCODE_MINIMO), tmp_path / 'v.png')
    assert destino.is_file()
    assert destino.read_bytes()[:8] == b'\x89PNG\r\n\x1a\n'


def test_sin_extrusiones_no_inventa_imagen(tmp_path):
    assert dibujar([], tmp_path / 'v.png') is None


def test_un_3mf_sin_gcode_no_revienta(tmp_path):
    vacio = tmp_path / 'vacio.3mf'
    with zipfile.ZipFile(vacio, 'w') as z:
        z.writestr('3D/3dmodel.model', '<model/>')
    assert render_desde_3mf(vacio, tmp_path / 'v.png') is None


def test_el_png_que_escribimos_es_valido(tmp_path):
    """El PNG se codifica a mano (sin Pillow): hay que comprobar la cabecera."""
    lienzo = Lienzo(12, 7, (247, 247, 245))
    lienzo.linea(0, 0, 11, 6, (46, 109, 164))
    datos = lienzo.guardar_png(tmp_path / 'v.png').read_bytes()

    assert datos[:8] == b'\x89PNG\r\n\x1a\n'
    largo = struct.unpack('>I', datos[8:12])[0]
    assert datos[12:16] == b'IHDR'
    ancho, alto, bits, tipo = struct.unpack('>IIBB', datos[16:16 + 10])
    assert (ancho, alto, bits, tipo) == (12, 7, 8, 2)  # RGB de 8 bits
    # El CRC del trozo tiene que cuadrar o el visor lo rechaza.
    crc = struct.unpack('>I', datos[16 + largo:20 + largo])[0]
    assert crc == zlib.crc32(datos[12:16 + largo]) & 0xFFFFFFFF


def test_la_linea_no_se_sale_del_lienzo(tmp_path):
    # Coordenadas fuera de rango se recortan en vez de reventar.
    lienzo = Lienzo(5, 5, (0, 0, 0))
    lienzo.linea(-50, -50, 60, 70, (255, 255, 255))
    assert lienzo.guardar_png(tmp_path / 'v.png').is_file()
