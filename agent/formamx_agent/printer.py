"""Control de la Bambu A1 por LAN: subida por FTPS y arranque/monitoreo por MQTT.

Requiere el Modo desarrollador (LAN) activado en la impresora. Usuario fijo
`bblp`, contraseña = access code. El certificado TLS de la impresora es
autofirmado, por eso ambas conexiones van sin verificación de cadena — es
tráfico local dentro de tu propia red.
"""

from __future__ import annotations

import ftplib
import json
import logging
import ssl
import threading
import time

from .discovery import DEFAULT_TIMEOUT, discover_ip

log = logging.getLogger('formamx.printer')

FTPS_PORT = 990
MQTT_PORT = 8883


class ImplicitFTPS(ftplib.FTP_TLS):
    """FTPS implícito (puerto 990) para la Bambu.

    Dos cosas que ftplib estándar no hace y la impresora exige:
    1. Envolver el socket de control en TLS ANTES del banner (implícito).
    2. Reutilizar la sesión TLS de la conexión de control en la conexión de
       datos. El servidor FTPS de Bambu rechaza (o cuelga) la conexión de
       datos si no reutiliza la sesión; sin esto, la subida expira con
       "read operation timed out".
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._sock = None

    @property
    def sock(self):
        return self._sock

    @sock.setter
    def sock(self, value):
        if value is not None and not isinstance(value, ssl.SSLSocket):
            value = self.context.wrap_socket(value)
        self._sock = value

    def ntransfercmd(self, cmd, rest=None):
        conn, size = ftplib.FTP.ntransfercmd(self, cmd, rest)
        if self._prot_p:
            conn = self.context.wrap_socket(
                conn,
                server_hostname=self.host,
                session=self.sock.session,  # reutiliza la sesión del control
            )
        return conn, size

    def storbinary(self, cmd, fp, blocksize=8192, callback=None, rest=None):
        # Igual que ftplib.FTP.storbinary pero SIN el unwrap() final: el
        # servidor de la Bambu nunca contesta el close_notify del cierre TLS
        # y ftplib se queda esperándolo hasta expirar ("read operation timed
        # out") aunque el archivo ya se haya transferido completo.
        self.voidcmd('TYPE I')
        with self.transfercmd(cmd, rest) as conn:
            while True:
                buf = fp.read(blocksize)
                if not buf:
                    break
                conn.sendall(buf)
                if callback:
                    callback(buf)
        return self.voidresp()


class PrinterError(Exception):
    pass


def _ssl_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE  # cert autofirmado de la impresora (LAN)
    return ctx


class BambuPrinter:
    def __init__(
        self,
        serial: str,
        access_code: str,
        ip: str | None = None,
        discover_timeout: float = DEFAULT_TIMEOUT,
    ):
        self.serial = serial
        self.access_code = access_code
        # IP fija de config, si Salva la dejó como respaldo manual — se usa
        # SOLO cuando el broadcast SSDP no responde (firewall, red separada).
        # La IP de verdad es la que se descubre sola en cada arranque de la
        # impresora; cachearla para siempre reintroduciría el bug original.
        self._static_ip = ip
        self._discovered_ip: str | None = None
        self._discover_timeout = discover_timeout

    def _resolve_ip(self) -> str:
        if self._discovered_ip:
            return self._discovered_ip
        found = discover_ip(self.serial, timeout=self._discover_timeout)
        if found:
            log.info('SSDP: %s encontrada en %s', self.serial, found)
            self._discovered_ip = found
            return found
        if self._static_ip:
            log.warning(
                'SSDP: sin respuesta de %s; uso la IP fija del config (%s)',
                self.serial,
                self._static_ip,
            )
            return self._static_ip
        raise PrinterError(
            f'no encontré la impresora {self.serial} por SSDP en la LAN '
            '(¿está encendida y en modo LAN? revisa que un firewall no '
            'bloquee el multicast) y el config no trae una IP fija de respaldo'
        )

    def _forget_ip(self) -> None:
        # Se llama tras cualquier fallo de conexión: si la impresora cambió de
        # IP (la apagaron y prendieron), la próxima operación vuelve a
        # descubrirla en vez de insistir con la que ya no contesta.
        self._discovered_ip = None

    # ---- FTPS ----

    def upload(self, local_path, remote_name: str = 'model.3mf') -> None:
        """Sube el 3MF a la microSD (siempre con el mismo nombre: no acumula basura)."""
        ip = self._resolve_ip()
        ftps = ImplicitFTPS(context=_ssl_context())
        try:
            ftps.connect(ip, FTPS_PORT, timeout=20)
            log.info('FTPS: conectado a %s', ip)
            ftps.login('bblp', self.access_code)
            ftps.prot_p()
            log.info('FTPS: autenticado; subiendo %s', remote_name)
            with open(local_path, 'rb') as f:
                ftps.storbinary(f'STOR {remote_name}', f)
            log.info('FTPS: subida completa')
        # ftplib.all_errors ya es una tupla de excepciones (incluye OSError);
        # anidarla en otra tupla rompe el except en tiempo de ejecución.
        except ftplib.all_errors as err:
            self._forget_ip()
            raise PrinterError(f'no pude subir el archivo: {err}') from err
        finally:
            try:
                ftps.quit()
            except Exception:
                ftps.close()

    # ---- MQTT ----

    def _client(self):
        import paho.mqtt.client as mqtt

        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, protocol=mqtt.MQTTv311)
        client.username_pw_set('bblp', self.access_code)
        client.tls_set_context(_ssl_context())
        client.tls_insecure_set(True)
        return client

    def read_ams(self, wait_seconds: int = 8) -> list[dict] | None:
        """Lee las ranuras del AMS: [{'slot', 'material', 'color_hex'}] o None.

        La impresora reporta tray_type (PLA/PETG/...) y tray_color (RGBA hex)
        de cada ranura, tal como los configuraste en su pantalla o en Bambu
        Studio.
        """
        state: dict = {'trays': None}
        got = threading.Event()

        def on_connect(client, _userdata, _flags, rc, _props=None):
            if rc != 0:
                got.set()
                return
            client.subscribe(f'device/{self.serial}/report')
            client.publish(
                f'device/{self.serial}/request',
                json.dumps({'pushing': {'command': 'pushall', 'sequence_id': '1'}}),
            )

        def on_message(_client, _userdata, msg):
            try:
                data = json.loads(msg.payload)
            except ValueError:
                return
            units = data.get('print', {}).get('ams', {}).get('ams')
            if not units:
                return
            trays = []
            for tray in units[0].get('tray', []):
                tray_type = (tray.get('tray_type') or '').strip() or None
                trays.append({
                    'slot': int(tray.get('id', 0)),
                    'material': tray_type,
                    'color_hex': tray.get('tray_color') or None if tray_type else None,
                    # Identidad del RFID: solo la traen las bobinas Bambu; el
                    # filamento genérico manda ceros. El worker la usa para que
                    # el vínculo con el almacén siga a la bobina cuando cambia
                    # de ranura, y descarta los ceros por su cuenta.
                    'tray_uuid': tray.get('tray_uuid') or None if tray_type else None,
                })
            state['trays'] = trays
            got.set()

        ip = self._resolve_ip()
        client = self._client()
        client.on_connect = on_connect
        client.on_message = on_message
        try:
            client.connect(ip, MQTT_PORT, keepalive=30)
        except OSError as err:
            self._forget_ip()
            raise PrinterError(f'impresora fuera de línea: {err}') from err
        client.loop_start()
        got.wait(wait_seconds)
        client.loop_stop()
        client.disconnect()
        return state['trays']

    def current_state(self, wait_seconds: int = 8) -> str | None:
        """gcode_state actual (IDLE/RUNNING/PAUSE/FINISH/FAILED) o None si no reporta."""
        state: dict = {'gcode_state': None}
        got = threading.Event()

        def on_connect(client, _userdata, _flags, rc, _props=None):
            if rc != 0:
                got.set()
                return
            client.subscribe(f'device/{self.serial}/report')
            # pushall: pide el estado completo una vez
            client.publish(
                f'device/{self.serial}/request',
                json.dumps({'pushing': {'command': 'pushall', 'sequence_id': '1'}}),
            )

        def on_message(_client, _userdata, msg):
            try:
                data = json.loads(msg.payload)
            except ValueError:
                return
            g = data.get('print', {}).get('gcode_state')
            if g:
                state['gcode_state'] = g
                got.set()

        ip = self._resolve_ip()
        client = self._client()
        client.on_connect = on_connect
        client.on_message = on_message
        try:
            client.connect(ip, MQTT_PORT, keepalive=30)
        except OSError as err:
            self._forget_ip()
            raise PrinterError(f'impresora fuera de línea: {err}') from err
        client.loop_start()
        got.wait(wait_seconds)
        client.loop_stop()
        client.disconnect()
        return state['gcode_state']

    def print_file(
        self,
        remote_name: str,
        subtask: str,
        ams_mapping: list[int],
        on_progress,
        max_hours: float = 12,
    ) -> tuple[bool, str | None]:
        """Arranca la impresión y monitorea hasta FINISH/FAILED.

        on_progress(pct) se llama con cada avance reportado. Devuelve
        (ok, mensaje_de_error). Una desconexión a media impresión se
        reintenta sola (loop de reconexión de paho).
        """
        result: dict = {'done': None, 'error': None, 'started': False}
        finished = threading.Event()

        def on_connect(client, _userdata, _flags, rc, _props=None):
            if rc != 0:
                result['done'] = False
                result['error'] = f'MQTT rechazó la conexión (rc={rc})'
                finished.set()
                return
            client.subscribe(f'device/{self.serial}/report')
            if not result['started']:
                result['started'] = True
                payload = {
                    'print': {
                        'command': 'project_file',
                        'param': 'Metadata/plate_1.gcode',
                        'url': f'file:///sdcard/{remote_name}',
                        'subtask_name': subtask,
                        'use_ams': True,
                        'ams_mapping': ams_mapping,
                        'bed_leveling': True,
                        'flow_cali': False,
                        'vibration_cali': False,
                        'timelapse': False,
                        'layer_inspect': False,
                        'sequence_id': str(int(time.time())),
                    }
                }
                client.publish(f'device/{self.serial}/request', json.dumps(payload))
                log.info('impresión enviada: %s (ams_mapping=%s)', subtask, ams_mapping)

        def on_message(_client, _userdata, msg):
            try:
                data = json.loads(msg.payload)
            except ValueError:
                return
            p = data.get('print', {})
            pct = p.get('mc_percent')
            if isinstance(pct, int):
                on_progress(pct)
            g = p.get('gcode_state')
            if g == 'FINISH':
                result['done'] = True
                finished.set()
            elif g == 'FAILED':
                result['done'] = False
                result['error'] = f"la impresora reportó fallo (print_error={p.get('print_error')})"
                finished.set()

        ip = self._resolve_ip()
        client = self._client()
        client.on_connect = on_connect
        client.on_message = on_message
        try:
            client.connect(ip, MQTT_PORT, keepalive=60)
        except OSError as err:
            self._forget_ip()
            raise PrinterError(f'impresora fuera de línea: {err}') from err
        client.loop_start()
        finished.wait(max_hours * 3600)
        client.loop_stop()
        client.disconnect()

        if result['done'] is None:
            return False, f'sin desenlace tras {max_hours} h; revisa la impresora'
        return bool(result['done']), result['error']
