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

log = logging.getLogger('formamx.printer')

FTPS_PORT = 990
MQTT_PORT = 8883


class ImplicitFTPS(ftplib.FTP_TLS):
    """FTPS implícito (puerto 990): el socket se envuelve en TLS antes del banner."""

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


class PrinterError(Exception):
    pass


def _ssl_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE  # cert autofirmado de la impresora (LAN)
    return ctx


class BambuPrinter:
    def __init__(self, ip: str, serial: str, access_code: str):
        self.ip = ip
        self.serial = serial
        self.access_code = access_code

    # ---- FTPS ----

    def upload(self, local_path, remote_name: str = 'model.3mf') -> None:
        """Sube el 3MF a la microSD (siempre con el mismo nombre: no acumula basura)."""
        ftps = ImplicitFTPS(context=_ssl_context())
        try:
            ftps.connect(self.ip, FTPS_PORT, timeout=20)
            ftps.login('bblp', self.access_code)
            ftps.prot_p()
            with open(local_path, 'rb') as f:
                ftps.storbinary(f'STOR {remote_name}', f)
        except (OSError, ftplib.all_errors) as err:  # type: ignore[misc]
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

        client = self._client()
        client.on_connect = on_connect
        client.on_message = on_message
        try:
            client.connect(self.ip, MQTT_PORT, keepalive=30)
        except OSError as err:
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

        client = self._client()
        client.on_connect = on_connect
        client.on_message = on_message
        try:
            client.connect(self.ip, MQTT_PORT, keepalive=60)
        except OSError as err:
            raise PrinterError(f'impresora fuera de línea: {err}') from err
        client.loop_start()
        finished.wait(max_hours * 3600)
        client.loop_stop()
        client.disconnect()

        if result['done'] is None:
            return False, f'sin desenlace tras {max_hours} h; revisa la impresora'
        return bool(result['done']), result['error']
