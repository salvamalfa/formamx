"""Lectura del result.json del CLI y comportamiento de slice_stl ante fallos.

El rebanado de verdad se prueba a mano con Bambu Studio instalado (ver
agent/README.md); aquí se cubre lo que sí es lógica nuestra: interpretar el
result.json y no dar por bueno un rebanado que no dejó archivo.
"""

import json
from pathlib import Path

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


def test_un_filamento_en_cero_no_cuenta_como_color_extra():
    # Algunas ranuras del AMS aparecen en el result.json sin uso (0 g): no son
    # un segundo color, así que no deben disparar el rechazo de abajo, y su
    # peso (nulo) no cambia la suma.
    datos = json.loads(json.dumps(EXITO))
    datos['sliced_plates'][0]['filaments'] = [
        {'id': 1, 'total_used_g': 3.69},
        {'id': 2, 'total_used_g': 0},
    ]
    res = parse_result(datos)
    assert res.ok
    assert res.grams == 3.69


def test_varios_platos_se_rechaza():
    # printer.py siempre imprime plate_1.gcode: un proyecto con más de un
    # plato no tiene forma de imprimirse hoy.
    datos = json.loads(json.dumps(EXITO))
    datos['sliced_plates'] = [datos['sliced_plates'][0], datos['sliced_plates'][0]]
    res = parse_result(datos)
    assert not res.ok
    assert 'platos' in res.error


def test_mas_de_un_filamento_usado_se_rechaza():
    # `imprimir` arma colors_json de largo 1: un proyecto que de verdad usa
    # más de un color no se puede imprimir con esta fase.
    datos = json.loads(json.dumps(EXITO))
    datos['sliced_plates'][0]['filaments'] = [
        {'id': 1, 'total_used_g': 3.69},
        {'id': 2, 'total_used_g': 1.31},
    ]
    res = parse_result(datos)
    assert not res.ok
    assert 'filamentos' in res.error


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


# ---- Armado del comando (STL vs proyecto 3MF) --------------------------------


def test_comando_stl_conserva_la_receta(tmp_path):
    """La rama STL de _comando es la receta de siempre, sin cambios."""
    from formamx_agent.slicer import _SALIDA, _comando

    profiles_dir = tmp_path
    proceso = tmp_path / 'process.json'
    filamento = tmp_path / 'filament_pla.json'
    entrada = tmp_path / 'pieza.stl'
    salida_dir = tmp_path / 'out'

    cmd = _comando('bambu-studio', profiles_dir, entrada, proceso, filamento, salida_dir, 'stl', orient='auto')

    assert cmd == [
        'bambu-studio',
        '--load-settings', f'{profiles_dir / "machine.json"};{proceso}',
        '--load-filaments', str(filamento),
        '--slice', '0',
        '--arrange', '1',
        '--orient', '1',
        '--ensure-on-bed',
        '--export-3mf', _SALIDA,
        '--outputdir', str(salida_dir),
        str(entrada),
    ]


def test_comando_stl_respeta_la_orientacion_original(tmp_path):
    from formamx_agent.slicer import _comando

    cmd = _comando(
        'bambu-studio', tmp_path, tmp_path / 'x.stl', tmp_path / 'p.json', tmp_path / 'f.json', tmp_path, 'stl',
        orient='original',
    )
    assert cmd[cmd.index('--orient') + 1] == '0'


def test_comando_3mf_no_pisa_el_trabajo_del_proyecto(tmp_path):
    """El proyecto ya trae colocación/soportes: sin --load-settings, --arrange
    y --orient en 0, y sin --ensure-on-bed (nada que forzar a la cama)."""
    from formamx_agent.slicer import _SALIDA, _comando

    filamento = tmp_path / 'filament_pla.json'
    entrada = tmp_path / 'proyecto.3mf'
    salida_dir = tmp_path / 'out'

    cmd = _comando('bambu-studio', tmp_path, entrada, None, filamento, salida_dir, '3mf')

    assert cmd == [
        'bambu-studio',
        '--load-filaments', str(filamento),
        '--slice', '0',
        '--arrange', '0',
        '--orient', '0',
        '--export-3mf', _SALIDA,
        '--outputdir', str(salida_dir),
        str(entrada),
    ]
    assert '--load-settings' not in cmd
    assert '--ensure-on-bed' not in cmd
    assert cmd[-1].endswith('.3mf')


# ---- Validación de proyectos 3MF (Guardar proyecto de Bambu Studio) ---------


def _proyecto_zip(ruta, ajustes=None, incluye_modelo=True):
    """Arma un proyecto 3MF mínimo para las pruebas: 3D/3dmodel.model (lo que
    distingue un 3MF de proyecto de cualquier otro zip) y, si se dan, los
    project_settings.config que _validar_proyecto revisa."""
    import zipfile

    with zipfile.ZipFile(ruta, 'w') as z:
        if incluye_modelo:
            z.writestr('3D/3dmodel.model', '<model/>')
        if ajustes is not None:
            z.writestr('Metadata/project_settings.config', json.dumps(ajustes))
    return ruta


def test_valida_proyecto_bien_formado_pasa(tmp_path):
    from formamx_agent.slicer import _validar_proyecto

    proyecto = _proyecto_zip(
        tmp_path / 'ok.3mf', {'printer_model': 'Bambu Lab A1', 'curr_bed_type': 'Textured PEI Plate'}
    )
    assert _validar_proyecto(proyecto) is None


def test_proyecto_que_no_es_zip_se_rechaza(tmp_path):
    from formamx_agent.slicer import _validar_proyecto

    falso = tmp_path / 'no_es_zip.3mf'
    falso.write_text('esto no es un zip', encoding='utf-8')
    error = _validar_proyecto(falso)
    assert error is not None
    assert 'zip' in error


def test_proyecto_sin_3dmodel_se_rechaza(tmp_path):
    from formamx_agent.slicer import _validar_proyecto

    proyecto = _proyecto_zip(tmp_path / 'vacio.3mf', incluye_modelo=False)
    error = _validar_proyecto(proyecto)
    assert error is not None
    assert '3dmodel.model' in error


def test_proyecto_de_otra_impresora_se_rechaza(tmp_path):
    from formamx_agent.slicer import _validar_proyecto

    proyecto = _proyecto_zip(tmp_path / 'x1c.3mf', {'printer_model': 'Bambu Lab X1 Carbon'})
    error = _validar_proyecto(proyecto)
    assert error is not None
    assert 'X1 Carbon' in error


def test_a1_mini_no_pasa_por_contener_a1(tmp_path):
    # "Bambu Lab A1 mini" contiene "Bambu Lab A1" pero es otra impresora: la
    # comparación de _validar_proyecto es exacta, no un substring.
    from formamx_agent.slicer import _validar_proyecto

    proyecto = _proyecto_zip(tmp_path / 'mini.3mf', {'printer_model': 'Bambu Lab A1 mini'})
    assert _validar_proyecto(proyecto) is not None


def test_proyecto_sin_printer_model_no_se_rechaza(tmp_path):
    # Un proyecto puede no declarar impresora; sin dato no hay nada que
    # rechazar (no es lo mismo "no dice" que "dice que es otra").
    from formamx_agent.slicer import _validar_proyecto

    proyecto = _proyecto_zip(tmp_path / 'sin_dato.3mf', {'curr_bed_type': 'Textured PEI Plate'})
    assert _validar_proyecto(proyecto) is None


# ---- slice_stl con formato='3mf' ---------------------------------------------


def test_slice_stl_rechaza_proyecto_de_otra_impresora_sin_ejecutar_nada(tmp_path, monkeypatch):
    profiles_dir = tmp_path
    (profiles_dir / 'filament_pla.json').write_text('{}', encoding='utf-8')
    proyecto = _proyecto_zip(tmp_path / 'x1c.3mf', {'printer_model': 'Bambu Lab X1 Carbon'})

    llamadas = []
    monkeypatch.setattr('formamx_agent.slicer.subprocess.run', lambda *a, **k: llamadas.append((a, k)))

    res = slice_stl('bambu-studio', profiles_dir, proyecto, tmp_path / 'out.3mf', 'PLA', formato='3mf')

    assert not res.ok
    assert 'X1 Carbon' in res.error
    assert llamadas == []


def test_slice_stl_3mf_que_no_es_zip_falla_antes_de_ejecutar(tmp_path, monkeypatch):
    profiles_dir = tmp_path
    (profiles_dir / 'filament_pla.json').write_text('{}', encoding='utf-8')
    falso = tmp_path / 'no_es_zip.3mf'
    falso.write_text('esto no es un zip', encoding='utf-8')

    llamadas = []
    monkeypatch.setattr('formamx_agent.slicer.subprocess.run', lambda *a, **k: llamadas.append((a, k)))

    res = slice_stl('bambu-studio', profiles_dir, falso, tmp_path / 'out.3mf', 'PLA', formato='3mf')

    assert not res.ok
    assert llamadas == []


def test_proyecto_3mf_de_punta_a_punta_con_cli_falso(tmp_path, monkeypatch):
    """Simula el CLI entero: recibe el proyecto, escribe result.json (EXITO)
    y un pieza.gcode.3mf sintético en --outputdir, como haría Bambu Studio."""
    import subprocess

    from formamx_agent import slicer as slicer_mod

    profiles_dir = tmp_path / 'perfiles'
    profiles_dir.mkdir()
    (profiles_dir / 'filament_pla.json').write_text('{}', encoding='utf-8')

    proyecto = _proyecto_zip(
        tmp_path / 'prueba.3mf', {'printer_model': 'Bambu Lab A1', 'curr_bed_type': 'Textured PEI Plate'}
    )
    out_path = tmp_path / 'salida' / 'pieza.pla.gcode.3mf'

    llamada = {}

    def cli_falso(cmd, capture_output=True, timeout=None):
        llamada['cmd'] = cmd
        outputdir = Path(cmd[cmd.index('--outputdir') + 1])
        (outputdir / 'result.json').write_text(json.dumps(EXITO), encoding='utf-8')
        _tresemefe(outputdir, ['Metadata/plate_1.png'])  # deja pieza.gcode.3mf con miniatura
        return subprocess.CompletedProcess(cmd, 0)

    monkeypatch.setattr('formamx_agent.slicer.subprocess.run', cli_falso)

    res = slice_stl('bambu-studio', profiles_dir, proyecto, out_path, 'PLA', formato='3mf', timeout=5)

    assert res.ok
    assert out_path.is_file()
    assert res.preview is not None and res.preview.is_file()

    cmd = llamada['cmd']
    assert '--load-settings' not in cmd
    assert '--ensure-on-bed' not in cmd
    assert cmd[cmd.index('--arrange') + 1] == '0'
    assert cmd[cmd.index('--orient') + 1] == '0'
    assert cmd[cmd.index('--load-filaments') + 1] == str(profiles_dir / 'filament_pla.json')
    assert cmd[-1] == str(proyecto)
    assert cmd[0] == 'bambu-studio'
