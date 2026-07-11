import pytest

from formamx_agent.printer import BambuPrinter, PrinterError


def test_upload_con_impresora_inalcanzable_lanza_printererror(tmp_path):
    # Puerto cerrado en localhost: el error real de red debe salir como
    # PrinterError con causa, no como TypeError del propio except (regresión
    # del bug "catching classes that do not inherit from BaseException").
    archivo = tmp_path / 'model.3mf'
    archivo.write_bytes(b'x')
    printer = BambuPrinter('127.0.0.1', 'SERIAL', '0000')
    with pytest.raises(PrinterError):
        printer.upload(archivo)
