import pytest

from formamx_agent.printer import BambuPrinter, PrinterError


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
