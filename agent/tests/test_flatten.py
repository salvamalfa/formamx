"""Aplanado de perfiles para el CLI de Bambu Studio.

Los perfiles de verdad no viven en el repo (los trae la instalación de Bambu
Studio), así que aquí se arma una cadena mínima que reproduce las tres mañas
que importan: herencia, templates de G-code y tipo de placa.
"""

import json

import pytest

from formamx_agent.flatten_profiles import (
    BED_TYPE,
    PerfilFaltante,
    aplanar,
    fusionar_templates,
    generar,
)


def escribir(carpeta, kind, name, datos):
    destino = carpeta / kind
    destino.mkdir(parents=True, exist_ok=True)
    (destino / f'{name}.json').write_text(json.dumps(datos), encoding='utf-8')


@pytest.fixture
def perfiles(tmp_path):
    """Cadena abuelo → padre → hijo, más el template del G-code de arranque."""
    escribir(tmp_path, 'machine', 'abuelo', {'name': 'abuelo', 'cama': '35', 'boquilla': '200'})
    escribir(tmp_path, 'machine', 'padre', {'name': 'padre', 'inherits': 'abuelo', 'cama': '55'})
    escribir(tmp_path, 'machine', 'A1', {'name': 'A1', 'inherits': 'padre', 'cama': '65'})
    escribir(
        tmp_path,
        'machine',
        'A1 template machine_start_gcode',
        {'name': 'plantilla', 'machine_start_gcode': 'G28\nM970 Q1\n'},
    )
    escribir(tmp_path, 'process', '0.20mm', {'name': '0.20mm', 'capa': '0.2'})
    escribir(tmp_path, 'filament', 'PLA', {'name': 'PLA', 'densidad': '1.26'})
    return tmp_path


def test_el_hijo_pisa_al_padre_y_al_abuelo(perfiles):
    perfil = aplanar(perfiles, 'machine', 'A1')
    assert perfil['cama'] == '65'  # el hijo manda
    assert perfil['boquilla'] == '200'  # heredado del abuelo


def test_el_perfil_aplanado_no_conserva_inherits(perfiles):
    # Si quedara, el CLI intentaría resolverlo y volvería a los defaults.
    assert 'inherits' not in aplanar(perfiles, 'machine', 'A1')


def test_perfil_inexistente_avisa_cual(perfiles):
    with pytest.raises(PerfilFaltante, match='machine/fantasma.json'):
        aplanar(perfiles, 'machine', 'fantasma')


def test_herencia_circular_no_cuelga(tmp_path):
    escribir(tmp_path, 'machine', 'uno', {'inherits': 'dos'})
    escribir(tmp_path, 'machine', 'dos', {'inherits': 'uno'})
    with pytest.raises(PerfilFaltante, match='circular'):
        aplanar(tmp_path, 'machine', 'uno')


def test_fusiona_el_gcode_de_los_templates(perfiles):
    # Sin esto el 3MF sale sin la secuencia real de arranque de la A1.
    perfil = fusionar_templates(perfiles, 'A1', aplanar(perfiles, 'machine', 'A1'))
    assert 'M970' in perfil['machine_start_gcode']


def test_generar_fija_el_tipo_de_placa(perfiles, tmp_path, monkeypatch):
    import formamx_agent.flatten_profiles as fp

    monkeypatch.setattr(
        fp,
        'PERFILES',
        {
            'machine.json': ('machine', 'A1'),
            'process_estandar.json': ('process', '0.20mm'),
            'filament_pla.json': ('filament', 'PLA'),
        },
    )
    salida = tmp_path / 'generados'
    generar(perfiles, salida)

    proceso = json.loads((salida / 'process_estandar.json').read_text(encoding='utf-8'))
    # Sin esto el CLI rebana para Cool Plate: el PLA sale con la cama a 35 °C
    # y la pieza se despega a media impresión.
    assert proceso['curr_bed_type'] == BED_TYPE

    maquina = json.loads((salida / 'machine.json').read_text(encoding='utf-8'))
    assert 'M970' in maquina['machine_start_gcode']
    assert maquina['cama'] == '65'
