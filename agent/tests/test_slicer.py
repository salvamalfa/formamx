"""Lectura del result.json del CLI y comportamiento de slice_stl ante fallos.

El rebanado de verdad se prueba a mano con Bambu Studio instalado (ver
agent/README.md); aquí se cubre lo que sí es lógica nuestra: interpretar el
result.json y no dar por bueno un rebanado que no dejó archivo.
"""

import json

import pytest

from formamx_agent.slicer import CAMA_MM, parse_result, slice_stl

# Recorte de un result.json real (rebanado del cubo de 20 mm en PLA).
EXITO = {
    'return_code': 0,
    'error_string': 'Success.',
    'sliced_plates': [
        {
            'main_predication': 771.31,
            'filaments': [{'id': 1, 'total_used_g': 3.69}],
            'objects': [{'name': 'cubo.stl', 'bbox': {'width': 20.0, 'depth': 20.0, 'height': 20.0}}],
        }
    ],
}


def test_saca_tiempo_y_gramos():
    res = parse_result(EXITO)
    assert res.ok
    assert res.seconds == 771  # entero: los segundos con decimales no aportan
    assert res.grams == 3.69


def test_suma_los_gramos_de_todos_los_filamentos():
    datos = json.loads(json.dumps(EXITO))
    datos['sliced_plates'][0]['filaments'] = [
        {'id': 1, 'total_used_g': 3.69},
        {'id': 2, 'total_used_g': 1.31},
    ]
    assert parse_result(datos).grams == 5.0


def test_el_error_del_rebanador_llega_legible():
    res = parse_result({'return_code': -2, 'error_string': 'Invalid parameters to the slicer.'})
    assert not res.ok
    assert res.error == 'Invalid parameters to the slicer.'


def test_codigo_de_error_sin_texto_no_deja_mensaje_vacio():
    res = parse_result({'return_code': -9, 'error_string': ''})
    assert not res.ok
    assert '-9' in res.error


def test_pieza_mas_grande_que_la_cama():
    datos = json.loads(json.dumps(EXITO))
    datos['sliced_plates'][0]['objects'][0]['bbox'] = {
        'width': 300.0,
        'depth': 20.0,
        'height': 20.0,
    }
    res = parse_result(datos)
    assert not res.ok
    assert 'no cabe en la cama' in res.error


def test_una_pieza_del_tamano_justo_de_la_cama_pasa():
    # El STL trae decimales: 256.0000001 no es motivo para rechazarla.
    datos = json.loads(json.dumps(EXITO))
    datos['sliced_plates'][0]['objects'][0]['bbox'] = {
        'width': CAMA_MM,
        'depth': CAMA_MM,
        'height': 20.0,
    }
    assert parse_result(datos).ok


def test_sin_platos_no_se_da_por_bueno():
    assert not parse_result({'return_code': 0, 'sliced_plates': []}).ok


def test_material_sin_perfil_falla_antes_de_ejecutar_nada(tmp_path):
    res = slice_stl('/no/existe', tmp_path, tmp_path / 'x.stl', tmp_path / 'y.3mf', 'NYLON')
    assert not res.ok
    assert 'NYLON' in res.error


def test_ejecutable_inexistente_no_revienta(tmp_path):
    (tmp_path / 'filament_pla.json').write_text('{}', encoding='utf-8')
    (tmp_path / 'process_estandar.json').write_text('{}', encoding='utf-8')
    res = slice_stl('/no/existe/bambu-studio', tmp_path, tmp_path / 'x.stl', tmp_path / 'y.3mf', 'PLA')
    assert not res.ok
    assert 'rebanador' in res.error


def test_sin_result_json_no_se_da_por_bueno(tmp_path):
    # El codigo de salida y stdout del CLI no son fiables (en Windows no hay
    # consola): si no dejó result.json, el rebanado no cuenta.
    falso = tmp_path / 'falso.sh'
    falso.write_text('#!/bin/sh\nexit 0\n', encoding='utf-8')
    falso.chmod(0o755)
    (tmp_path / 'filament_pla.json').write_text('{}', encoding='utf-8')
    (tmp_path / 'process_estandar.json').write_text('{}', encoding='utf-8')
    res = slice_stl(str(falso), tmp_path, tmp_path / 'x.stl', tmp_path / 'y.3mf', 'PLA')
    assert not res.ok
    assert 'result.json' in res.error


@pytest.mark.parametrize('soportes', ['auto', 'no'])
def test_los_soportes_solo_se_encienden_cuando_toca(tmp_path, soportes):
    """El perfil temporal con soportes se arma sin tocar el perfil original."""
    from formamx_agent.slicer import _process_con_soportes

    (tmp_path / 'process_estandar.json').write_text(
        json.dumps({'enable_support': '0', 'support_type': 'tree(auto)'}), encoding='utf-8'
    )
    if soportes == 'auto':
        copia = _process_con_soportes(tmp_path, tmp_path / 'copia.json')
        datos = json.loads(copia.read_text(encoding='utf-8'))
        assert datos['enable_support'] == '1'
        # El tipo y el ángulo salen del perfil de Bambu, no se inventan.
        assert datos['support_type'] == 'tree(auto)'
    original = json.loads((tmp_path / 'process_estandar.json').read_text(encoding='utf-8'))
    assert original['enable_support'] == '0'


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
    from formamx_agent.preview import leer_segmentos

    segmentos = leer_segmentos(GCODE_MINIMO)
    # 3 con E; el viaje sin E (X30 Y30) y el cambio de capa no cuentan.
    assert len(segmentos) == 3
    assert segmentos[0][:2] == (10.0, 10.0)
    assert segmentos[0][3:5] == (20.0, 10.0)


def test_extrusion_absoluta_tambien_se_entiende():
    from formamx_agent.preview import leer_segmentos

    # Con M82 la E es acumulada: extruye solo si sube respecto a la anterior.
    absoluto = 'M82\nG1 X0 Y0 Z0.2\nG1 X10 Y0 E5\nG1 X20 Y0 E5\nG1 X30 Y0 E9\n'
    assert len(leer_segmentos(absoluto)) == 2


def test_los_arcos_cuentan_como_segmento():
    from formamx_agent.preview import leer_segmentos

    assert len(leer_segmentos('M83\nG1 X0 Y0 Z0.2\nG2 X10 Y10 I5 J5 E1\n')) == 1


def test_dibuja_un_png_de_verdad(tmp_path):
    from formamx_agent.preview import dibujar, leer_segmentos

    destino = dibujar(leer_segmentos(GCODE_MINIMO), tmp_path / 'v.png')
    assert destino.is_file()
    assert destino.read_bytes()[:8] == b'\x89PNG\r\n\x1a\n'


def test_sin_extrusiones_no_inventa_imagen(tmp_path):
    from formamx_agent.preview import dibujar

    assert dibujar([], tmp_path / 'v.png') is None


def test_un_3mf_sin_gcode_no_revienta(tmp_path):
    import zipfile

    from formamx_agent.preview import render_desde_3mf

    vacio = tmp_path / 'vacio.3mf'
    with zipfile.ZipFile(vacio, 'w') as z:
        z.writestr('3D/3dmodel.model', '<model/>')
    assert render_desde_3mf(vacio, tmp_path / 'v.png') is None
