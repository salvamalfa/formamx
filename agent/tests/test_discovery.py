from formamx_agent.discovery import discover_ip, parse_ssdp_response

NOTIFY = (
    'NOTIFY * HTTP/1.1\r\n'
    'HOST: 239.255.255.250:2021\r\n'
    'Server: UPnP/1.0\r\n'
    'Location: 192.168.1.42\r\n'
    'NT: urn:bambulab-com:device:3dprinter:1\r\n'
    'USN: 01234567890ABC\r\n'
    'Cache-Control: max-age=1800\r\n'
    'DevModel.bambu.com: C11\r\n'
    '\r\n'
).encode()


def test_parse_ssdp_response_extrae_headers_relevantes():
    headers = parse_ssdp_response(NOTIFY)
    assert headers['location'] == '192.168.1.42'
    assert headers['usn'] == '01234567890ABC'
    assert headers['devmodel.bambu.com'] == 'C11'


def test_parse_ssdp_response_con_basura_no_lanza():
    assert parse_ssdp_response(b'\x00\x01no es texto SSDP\xff') == {}


def test_discover_ip_sin_impresora_en_la_red_devuelve_none_tras_el_timeout():
    # Nadie en 239.255.255.250:2021 en esta máquina de pruebas: debe agotar
    # el timeout (breve) y devolver None en vez de colgarse o lanzar.
    assert discover_ip('UN-SERIAL-QUE-NO-EXISTE', timeout=0.3) is None
