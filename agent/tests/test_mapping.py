import os

import pytest

from formamx_agent.mapping import FilamentoFaltante, compute_mapping, pick_file

SPOOLS = [
    {'slot': 0, 'color_id': 'blanco'},
    {'slot': 1, 'color_id': 'rojo'},
    {'slot': 2, 'color_id': 'azul'},
    {'slot': 3, 'color_id': None},
]


def test_pantalla_un_filamento():
    assert compute_mapping(['rojo'], SPOOLS) == [1]


def test_dos_filamentos_en_orden():
    # El mapeo respeta el orden de filamentos del 3MF (soporta platos
    # multifilamento aunque hoy cada pieza vaya con uno solo).
    assert compute_mapping(['blanco', 'azul'], SPOOLS) == [0, 2]


def test_color_faltante():
    with pytest.raises(FilamentoFaltante) as exc:
        compute_mapping(['blanco', 'verde'], SPOOLS)
    assert exc.value.faltantes == ['verde']
    assert 'verde' in str(exc.value)


def test_color_repetido_usa_la_ranura_menor():
    spools = [
        {'slot': 0, 'color_id': 'rojo'},
        {'slot': 1, 'color_id': 'rojo'},
        {'slot': 2, 'color_id': None},
        {'slot': 3, 'color_id': None},
    ]
    assert compute_mapping(['rojo'], spools) == [0]


def test_mismo_color_en_ambos_filamentos():
    # Tapa blanca sobre cuerpo blanco: ambos filamentos a la misma ranura.
    assert compute_mapping(['blanco', 'blanco'], SPOOLS) == [0, 0]


def test_ams_vacio():
    vacio = [{'slot': s, 'color_id': None} for s in range(4)]
    with pytest.raises(FilamentoFaltante) as exc:
        compute_mapping(['rojo'], vacio)
    assert exc.value.faltantes == ['rojo']


def test_pick_file_lleva_el_material_en_el_nombre(tmp_path):
    ruta = pick_file(tmp_path, 'pantalla/tessera', 'PETG')
    assert ruta == tmp_path / 'pantalla' / 'tessera.petg.gcode.3mf'


def test_pick_file_pla_en_minusculas(tmp_path):
    ruta = pick_file(tmp_path, 'cuerpo/cuerpo', 'PLA')
    assert ruta.name == 'cuerpo.pla.gcode.3mf'


def test_pick_file_sin_material_es_error(tmp_path):
    # No existen archivos genéricos: sin material no hay archivo que elegir.
    with pytest.raises(ValueError):
        pick_file(tmp_path, 'tapa/tapa', None)


def test_pick_file_rechaza_traversal_relativo(tmp_path):
    # Un file_key con '..' no puede sacar al agente de files_dir.
    with pytest.raises(ValueError):
        pick_file(tmp_path, '../../etc/passwd', 'PLA')


def test_pick_file_rechaza_ruta_absoluta(tmp_path):
    # Una ruta absoluta en file_key colapsaría fuera de files_dir; se rechaza.
    absoluta = '/etc/passwd' if os.name != 'nt' else 'C:/Windows/System32/x'
    with pytest.raises(ValueError):
        pick_file(tmp_path, absoluta, 'PLA')
