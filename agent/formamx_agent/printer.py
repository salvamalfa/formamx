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


# Tope para que la impresora empiece a moverse tras aceptar la orden. Antes no
# había ninguno: si nunca arrancaba, el agente se quedaba doce horas esperando
# y no tomaba ningún otro trabajo.
ARRANQUE_TIMEOUT_SECONDS = 300

# Estados que la impresora reporta cuando la impresión YA es suya.
ESTADOS_DE_ARRANQUE = frozenset({'PREPARE', 'RUNNING', 'SLICING'})

# Código con el que rechaza cualquier orden de impresión —incluida una vacía—
# cuando el Modo desarrollador (LAN) está apagado en su pantalla. Es genérico
# ("fallo al verificar el comando MQTT"), así que sin este mensaje el motivo
# real no aparece por ningún lado.
ERR_COMANDO_NO_VERIFICADO = 0x05024007


def motivo_rechazo(err_code: int) -> str:
    if err_code == ERR_COMANDO_NO_VERIFICADO:
        return 'La impresora rechazó la orden: activa el Modo desarrollador (LAN) en su pantalla.'
    return f'la impresora rechazó la orden (err_code={err_code})'


class SeguimientoImpresion:
    """Estado de una impresión, alimentado con los reportes MQTT.

    Vive fuera del cliente MQTT para poder probarlo sin impresora. Su regla
    central: mientras la impresión no haya arrancado, el `gcode_state` que
    llega es el de la impresión ANTERIOR. Darlo por bueno era el bug que
    reportaba como terminadas impresiones que nunca empezaron.
    """

    def __init__(self, remote_name: str, sequence_id: str):
        self.remote_name = remote_name
        self.sequence_id = sequence_id
        self.arrancada = False
        self.done: bool | None = None
        self.error: str | None = None
        self.progreso: int | None = None

    @property
    def cerrada(self) -> bool:
        return self.done is not None

    def mensaje(self, data: dict) -> None:
        p = data.get('print')
        if not isinstance(p, dict):
            return
        if p.get('command') == 'project_file' and p.get('sequence_id') == self.sequence_id:
            self._respuesta_a_la_orden(p)
            return

        # El archivo con nuestro nombre en curso, o un estado de arranque: la
        # impresión ya es la nuestra y a partir de aquí sus reportes valen.
        if p.get('gcode_file') == self.remote_name or p.get('gcode_state') in ESTADOS_DE_ARRANQUE:
            self.arrancada = True
        if not self.arrancada:
            return

        pct = p.get('mc_percent')
        if isinstance(pct, int):
            self.progreso = pct
        estado = p.get('gcode_state')
        if estado == 'FINISH':
            self.done = True
        elif estado == 'FAILED':
            self.done = False
            self.error = f"la impresora reportó fallo (print_error={p.get('print_error')})"

    def _respuesta_a_la_orden(self, p: dict) -> None:
        """La impresora repite la orden con su desenlace: éxito o err_code."""
        err = p.get('err_code')
        if p.get('result') == 'success' or not isinstance(err, int) or err == 0:
            return
        self.done = False
        self.error = motivo_rechazo(err)


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
        (ok, mensaje_de_error) solo si la impresión llegó a arrancar. Una
        desconexión a media impresión se reintenta sola (loop de reconexión
        de paho).

        Si la impresora rechaza la orden o nunca arranca, lanza PrinterError:
        nada tocó la cama, así que el trabajo debe fallar sin activar el
        candado de cama sucia y quedar reintentable desde /taller.
        """
        seguimiento = SeguimientoImpresion(remote_name, str(int(time.time())))
        # `avance` se dispara con la primera noticia —arrancó o la rechazaron—
        # y `finished` solo con el desenlace final de una impresión ya en curso.
        avance = threading.Event()
        finished = threading.Event()
        enviada = {'si': False}

        def on_connect(client, _userdata, _flags, rc, _props=None):
            if rc != 0:
                seguimiento.done = False
                seguimiento.error = f'MQTT rechazó la conexión (rc={rc})'
                avance.set()
                finished.set()
                return
            client.subscribe(f'device/{self.serial}/report')
            if not enviada['si']:
                enviada['si'] = True
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
                        'sequence_id': seguimiento.sequence_id,
                    }
                }
                client.publish(f'device/{self.serial}/request', json.dumps(payload))
                log.info('orden de impresión enviada: %s (ams_mapping=%s)', subtask, ams_mapping)

        def on_message(_client, _userdata, msg):
            try:
                data = json.loads(msg.payload)
            except ValueError:
                return
            antes = seguimiento.progreso
            arrancaba = seguimiento.arrancada
            seguimiento.mensaje(data)
            if seguimiento.arrancada and not arrancaba:
                log.info('la impresora arrancó la impresión')
            if seguimiento.progreso is not None and seguimiento.progreso != antes:
                on_progress(seguimiento.progreso)
            if seguimiento.arrancada or seguimiento.cerrada:
                avance.set()
            if seguimiento.cerrada:
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
        # Dos esperas: primero a que la impresión sea de verdad nuestra, y solo
        # entonces a que termine. Sin la primera, una orden rechazada dejaba al
        # agente colgado hasta el tope de horas.
        avance.wait(ARRANQUE_TIMEOUT_SECONDS)
        if seguimiento.arrancada:
            finished.wait(max_hours * 3600)
        client.loop_stop()
        client.disconnect()

        if not seguimiento.arrancada:
            # Nada tocó la cama: PrinterError para que el trabajo falle SIN
            # activar el candado de cama sucia y quede reintentable en /taller.
            raise PrinterError(
                seguimiento.error
                or f'la impresora no arrancó la impresión en '
                f'{ARRANQUE_TIMEOUT_SECONDS // 60} min; revisa su pantalla'
            )
        if seguimiento.done is None:
            return False, f'sin desenlace tras {max_hours} h; revisa la impresora'
        return bool(seguimiento.done), seguimiento.error
