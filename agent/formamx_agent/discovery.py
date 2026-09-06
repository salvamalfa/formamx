"""Descubrimiento de la Bambu A1 en la LAN por SSDP, sin IP fija.

La impresora en modo LAN reanuncia su presencia cada pocos segundos por
multicast UDP a 239.255.255.250:2021 (así la encuentran Bambu Studio y
Home Assistant, sin mandar ningún M-SEARCH: basta con escuchar). El aviso es
texto tipo HTTP/SSDP con headers; los que importan aquí son `USN` (número de
serie de la impresora) y `Location` (su IP actual). Referencia cruzada:
forum.bambulab.com/t/use-ssdp-standards y varias reimplementaciones de
terceros (bambudiscovery.sh, bambulabs_api) coinciden en este formato:

    NOTIFY * HTTP/1.1
    HOST: 239.255.255.250:2021
    Server: UPnP/1.0
    Location: 192.168.1.42
    NT: urn:bambulab-com:device:3dprinter:1
    USN: 01234567890ABC
    Cache-Control: max-age=1800
    DevModel.bambu.com: C11
    ...
"""

from __future__ import annotations

import logging
import socket
import struct
import time

log = logging.getLogger('formamx.discovery')

DISCOVERY_GROUP = '239.255.255.250'
DISCOVERY_PORT = 2021
# La impresora reanuncia cada ~5s: un timeout de un solo ciclo pierde el
# anuncio por mala suerte si empezamos a escuchar justo después de uno.
# Con margen para 2-3 ciclos casi nunca falla en una red sana.
DEFAULT_TIMEOUT = 12.0


def parse_ssdp_response(data: bytes) -> dict[str, str]:
    """Headers del aviso SSDP en minúsculas. La primera línea (NOTIFY/HTTP) se ignora."""
    headers: dict[str, str] = {}
    text = data.decode('utf-8', errors='ignore')
    for line in text.splitlines()[1:]:
        if ':' not in line:
            continue
        key, _, value = line.partition(':')
        headers[key.strip().lower()] = value.strip()
    return headers


def _matches_serial(headers: dict[str, str], serial: str) -> bool:
    # El USN observado es el serial desnudo, pero se compara por substring
    # (no igualdad estricta) por si algún firmware lo manda con sufijo URN
    # al estilo SSDP estándar ("<serial>::urn:...").
    return bool(serial) and serial in headers.get('usn', '')


def discover_ip(serial: str, timeout: float = DEFAULT_TIMEOUT) -> str | None:
    """Escucha el broadcast SSDP hasta encontrar el anuncio de `serial`.

    Devuelve la IP (header Location) o None si no aparece dentro de `timeout`
    segundos, o si la máquina no tiene multicast disponible (sandbox sin red,
    interfaz caída). Nunca lanza: la ausencia de red es una condición normal
    que el llamador decide cómo manejar (reintentar, usar una IP de respaldo).
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        sock.bind(('', DISCOVERY_PORT))
        mreq = struct.pack('4sL', socket.inet_aton(DISCOVERY_GROUP), socket.INADDR_ANY)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
    except OSError as err:
        log.warning('SSDP: no pude escuchar en :%s (%s)', DISCOVERY_PORT, err)
        sock.close()
        return None

    deadline = time.monotonic() + timeout
    try:
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return None
            sock.settimeout(remaining)
            try:
                data, _addr = sock.recvfrom(4096)
            except socket.timeout:
                return None
            except OSError as err:
                log.warning('SSDP: error leyendo el broadcast: %s', err)
                return None
            headers = parse_ssdp_response(data)
            if _matches_serial(headers, serial):
                ip = headers.get('location')
                if ip:
                    return ip
    finally:
        sock.close()
