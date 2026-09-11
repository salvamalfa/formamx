import pytest

from formamx_agent.printer import (
    BambuPrinter,
    PrinterError,
    SeguimientoImpresion,
    motivo_rechazo,
)


def test_upload_con_impresora_inalcanzable_lanza_printererror(tmp_path, monkeypatch):
    # Puerto cerrado en localhost: el error real de red debe salir como
    # PrinterError con causa, no como TypeError del propio except (regresión
    # del bug "catching classes that do not inherit from BaseException").
    # discover_ip se mockea para no depender de un broadcast SSDP real ni de
    # su timeout: lo que se prueba aquí es el manejo del error de FTPS.
    monkeypatch.setattr('formamx_agent.printer.discover_ip', lambda serial, timeout: '127.0.0.1')
    archivo = tmp_path / 'model.3mf'
    archivo.write_bytes(b'x')
    printer = BambuPrinter('SERIAL', '0000')
    with pytest.raises(PrinterError):
        printer.upload(archivo)


def test_sin_ip_fija_y_sin_respuesta_ssdp_lanza_printererror(monkeypatch):
    # Sin `ip` en el config y sin ninguna impresora respondiendo al broadcast:
    # debe fallar con un mensaje claro, no intentar conectar a algo.
    monkeypatch.setattr('formamx_agent.printer.discover_ip', lambda serial, timeout: None)
    printer = BambuPrinter('SERIAL', '0000', discover_timeout=0.01)
    with pytest.raises(PrinterError, match='SSDP'):
        printer._resolve_ip()


def test_ip_descubierta_se_cachea_hasta_un_fallo_de_conexion(monkeypatch):
    # Simula un ciclo completo: se descubre una vez, se reusa sin volver a
    # tocar la red, y tras una falla de conexión el siguiente resolve vuelve
    # a preguntar (la impresora pudo haber cambiado de IP).
    llamadas = []

    def fake_discover(serial, timeout):
        llamadas.append(serial)
        return '192.168.1.50'

    monkeypatch.setattr('formamx_agent.printer.discover_ip', fake_discover)
    printer = BambuPrinter('SERIAL', '0000')

    assert printer._resolve_ip() == '192.168.1.50'
    assert printer._resolve_ip() == '192.168.1.50'
    assert len(llamadas) == 1  # la segunda vino de la caché, no de un nuevo broadcast

    printer._forget_ip()
    assert printer._resolve_ip() == '192.168.1.50'
    assert len(llamadas) == 2


def test_ip_fija_es_respaldo_solo_si_ssdp_no_responde(monkeypatch):
    monkeypatch.setattr('formamx_agent.printer.discover_ip', lambda serial, timeout: None)
    printer = BambuPrinter('SERIAL', '0000', ip='10.0.0.9', discover_timeout=0.01)
    assert printer._resolve_ip() == '10.0.0.9'


# --- Seguimiento de la impresión ------------------------------------------
#
# El 11 de septiembre de 2026 una impresión rechazada por la impresora (Modo
# desarrollador apagado) se reportó en /taller como terminada al 100%: el
# agente tomó el `gcode_state: FINISH` que la impresora seguía arrastrando de
# la impresión ANTERIOR. Estos tests fijan que eso no vuelva a pasar.


def _status(**campos):
    return {'print': {'command': 'push_status', **campos}}


def test_finish_de_la_impresion_anterior_no_cuenta_como_terminada():
    s = SeguimientoImpresion('model.3mf', '123')
    # Lo que reportaba la impresora quieta: terminada, al 100%, pero con el
    # nombre del trabajo viejo y sin archivo en curso.
    s.mensaje(_status(gcode_state='FINISH', gcode_file='', subtask_name='PRUEBA.stl', mc_percent=100))
    assert s.arrancada is False
    assert s.done is None
    assert s.progreso is None


def test_finish_cuenta_cuando_la_impresion_ya_habia_arrancado():
    s = SeguimientoImpresion('model.3mf', '123')
    s.mensaje(_status(gcode_state='PREPARE'))
    assert s.arrancada is True
    s.mensaje(_status(gcode_state='RUNNING', mc_percent=40))
    assert s.progreso == 40
    s.mensaje(_status(gcode_state='FINISH', mc_percent=100))
    assert s.done is True


def test_el_archivo_en_curso_tambien_marca_el_arranque():
    s = SeguimientoImpresion('model.3mf', '123')
    s.mensaje(_status(gcode_file='model.3mf', subtask_name='ord_1 pantalla'))
    assert s.arrancada is True


def test_rechazo_de_la_orden_cierra_con_el_motivo_del_modo_desarrollador():
    s = SeguimientoImpresion('model.3mf', '123')
    s.mensaje(
        {'print': {'command': 'project_file', 'sequence_id': '123', 'err_code': 0x05024007}}
    )
    assert s.done is False
    assert 'Modo desarrollador' in s.error
    assert s.arrancada is False


def test_orden_aceptada_no_cierra_el_seguimiento():
    s = SeguimientoImpresion('model.3mf', '123')
    s.mensaje(
        {'print': {'command': 'project_file', 'sequence_id': '123', 'result': 'success'}}
    )
    assert s.done is None
    # Aceptada no es arrancada: eso lo dirá el primer reporte de estado.
    assert s.arrancada is False


def test_la_respuesta_a_otra_orden_no_se_confunde_con_la_nuestra():
    s = SeguimientoImpresion('model.3mf', '123')
    s.mensaje(
        {'print': {'command': 'project_file', 'sequence_id': '999', 'err_code': 0x05024007}}
    )
    assert s.done is None


def test_fallo_reportado_antes_del_arranque_es_del_trabajo_viejo():
    s = SeguimientoImpresion('model.3mf', '123')
    s.mensaje(_status(gcode_state='FAILED', gcode_file='', print_error=50348044))
    assert s.done is None


def test_motivo_rechazo_desconocido_lleva_el_codigo_crudo():
    assert '12345' in motivo_rechazo(12345)
