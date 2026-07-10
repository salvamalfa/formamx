import pytest

from formamx_agent.mapping import FilamentoFaltante, compute_mapping

SPOOLS = [
    {'slot': 0, 'color_id': 'blanco'},
    {'slot': 1, 'color_id': 'rojo'},
    {'slot': 2, 'color_id': 'azul'},
    {'slot': 3, 'color_id': None},
]


def test_pantalla_un_filamento():
    assert compute_mapping(['rojo'], SPOOLS) == [1]


def test_cuerpo_tapa_dos_filamentos_en_orden():
    # F1 = blanco (cuerpo), F2 = color de tapa: el orden del 3MF se respeta.
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
