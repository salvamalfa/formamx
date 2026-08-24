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


# ---- Vista del plato (la que incrusta Bambu Studio) -------------------------


def _tresemefe(tmp_path, nombres):
    import zipfile

    ruta = tmp_path / 'pieza.gcode.3mf'
    with zipfile.ZipFile(ruta, 'w') as z:
        z.writestr('Metadata/plate_1.gcode', 'G1 X0 Y0\n')
        for n in nombres:
            z.writestr(n, b'\x89PNG-falso-' + n.encode())
    return ruta


def test_prefiere_la_miniatura_grande(tmp_path):
    from formamx_agent.slicer import _extraer_preview

    # Bambu deja plate_1.png y plate_1_small.png; queremos la grande.
    ruta = _tresemefe(tmp_path, ['Metadata/plate_1_small.png', 'Metadata/plate_1.png'])
    destino = _extraer_preview(ruta)
    assert destino.is_file()
    assert b'Metadata/plate_1.png' in destino.read_bytes()


def test_ignora_las_imagenes_auxiliares_del_visor(tmp_path):
    from formamx_agent.slicer import _extraer_preview

    # pick_ y top_ son para el visor de la impresora, no son la vista del plato.
    ruta = _tresemefe(tmp_path, ['Metadata/pick_1.png', 'Metadata/top_1.png'])
    assert _extraer_preview(ruta) is None


def test_sin_miniatura_no_hay_vista_y_no_revienta(tmp_path):
    from formamx_agent.slicer import _extraer_preview

    # Caso de una máquina que rebanó sin sesión gráfica: la pieza se revisa
    # con los estimados (el reemplazo dibujado vive en agent/apendice/).
    assert _extraer_preview(_tresemefe(tmp_path, [])) is None
