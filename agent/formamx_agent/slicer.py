"""Rebana un STL o un proyecto 3MF con el CLI de Bambu Studio.

El CLI no habla por consola de forma fiable (en Windows no hay salida), así que
la verdad del rebanado es el `result.json` que deja en el directorio de salida:
el código de salida y stdout no sirven para decidir.

Receta completa y mañas en docs/STL_CLIENTES.md. Los perfiles autónomos los
genera formamx_agent.flatten_profiles.
"""

from __future__ import annotations

import json
import logging
import shutil
import subprocess
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path

from . import flatten_profiles

log = logging.getLogger('formamx.slicer')

# Cama de la A1. El chequeo es una red de seguridad con mensaje legible: el
# rebanador también se queja, pero con un texto que no le dice nada a nadie.
CAMA_MM = 256.0
# Tolerancia para no rechazar una pieza de 256.0000001 por redondeo del STL.
HOLGURA_MM = 0.5

# Nombre fijo del 3MF que deja el CLI en el outputdir; slice_stl lo mueve a
# out_path después.
_SALIDA = 'pieza.gcode.3mf'

# Única impresora que el taller valida hoy. La comparación es EXACTA a
# propósito: "Bambu Lab A1 mini" contiene "Bambu Lab A1" pero es otra máquina,
# así que un substring aceptaría proyectos que no son de esta impresora.
_IMPRESORA_TALLER = 'Bambu Lab A1'


@dataclass
class SliceResult:
    ok: bool
    seconds: int | None = None
    grams: float | None = None
    error: str | None = None
    preview: Path | None = None


def parse_result(data: dict) -> SliceResult:
    """Interpreta el result.json del CLI."""
    codigo = data.get('return_code')
    if codigo != 0:
        detalle = str(data.get('error_string') or '').strip()
        return SliceResult(False, error=detalle or f'el rebanador devolvió código {codigo}')

    platos = data.get('sliced_plates') or []
    if not platos:
        return SliceResult(False, error='el rebanador no reportó ningún plato')
    if len(platos) != 1:
        # printer.py siempre imprime plate_1.gcode: un proyecto con más de un
        # plato no tiene forma de imprimirse hoy, así que se rechaza aquí en
        # vez de fallar más adelante con un mensaje críptico.
        return SliceResult(False, error=f'el proyecto tiene {len(platos)} platos; deja uno solo')
    plato = platos[0]

    for obj in plato.get('objects') or []:
        caja = obj.get('bbox') or {}
        medidas = [caja.get('width'), caja.get('depth'), caja.get('height')]
        if any(isinstance(m, (int, float)) and m > CAMA_MM + HOLGURA_MM for m in medidas):
            grandes = ' × '.join(f'{m:.0f}' if isinstance(m, (int, float)) else '?' for m in medidas)
            return SliceResult(
                False, error=f'la pieza mide {grandes} mm y no cabe en la cama ({CAMA_MM:.0f} mm)'
            )

    filamentos = plato.get('filaments') or []
    usados = [
        f
        for f in filamentos
        if isinstance(f.get('total_used_g'), (int, float)) and f.get('total_used_g') > 0
    ]
    if len(usados) > 1:
        # `imprimir` arma colors_json de largo 1: un proyecto que de verdad usa
        # más de un color no tiene forma de imprimirse hoy con esta fase.
        return SliceResult(
            False, error=f'el proyecto usa {len(usados)} filamentos; esta fase imprime un solo color'
        )

    prediccion = plato.get('main_predication')
    seconds = round(prediccion) if isinstance(prediccion, (int, float)) else None
    gramos = sum(
        f.get('total_used_g') or 0
        for f in filamentos
        if isinstance(f.get('total_used_g'), (int, float))
    )
    return SliceResult(True, seconds=seconds, grams=round(gramos, 2) or None)


def _process_con_soportes(profiles_dir: Path, destino: Path) -> Path:
    """Copia el perfil de proceso con los soportes activados.

    El tipo y el ángulo ya vienen bien del perfil de Bambu (árbol automático a
    30°, lo mismo que se activa a mano en la interfaz): solo hay que encenderlos.
    """
    perfil = json.loads((profiles_dir / 'process_estandar.json').read_text(encoding='utf-8'))
    perfil['enable_support'] = '1'
    destino.write_text(json.dumps(perfil, ensure_ascii=False), encoding='utf-8')
    return destino


def _validar_proyecto(path: Path) -> str | None:
    """Valida que `path` sea un proyecto 3MF de Bambu Studio (Guardar proyecto).

    Un proyecto ya trae la colocación, los soportes pintados y el preset de
    filamento resueltos en Metadata/project_settings.config — por eso `_comando`
    no le pasa --load-settings/--arrange/--orient, que pisarían ese trabajo.
    Esta función solo rechaza lo que de plano no va a rebanar bien (otra
    impresora, un zip que no es un 3MF); lo demás son avisos en el log, no
    motivo de rechazo.

    Devuelve el mensaje de error, o None si el proyecto pasa.
    """
    if not zipfile.is_zipfile(path):
        return 'el archivo no es un proyecto 3MF válido (no es un zip)'
    try:
        with zipfile.ZipFile(path) as z:
            nombres = z.namelist()
            if '3D/3dmodel.model' not in nombres:
                return 'el archivo no es un proyecto 3MF válido (falta 3D/3dmodel.model)'

            if 'Metadata/project_settings.config' not in nombres:
                log.warning(
                    '%s no trae Metadata/project_settings.config; no puedo revisar impresora ni cama',
                    path.name,
                )
                return None
            try:
                ajustes = json.loads(z.read('Metadata/project_settings.config').decode('utf-8'))
            except (json.JSONDecodeError, UnicodeDecodeError):
                return 'Metadata/project_settings.config del proyecto está corrupto'

            impresora = ajustes.get('printer_model')
            if impresora and impresora != _IMPRESORA_TALLER:
                return f'el proyecto está guardado para {impresora}, no para {_IMPRESORA_TALLER}'

            if any(n.startswith('Metadata/plate_') and n.endswith('.gcode') for n in nombres):
                log.warning('%s ya trae un plato rebanado adentro; se vuelve a rebanar de todos modos', path.name)

            cama = ajustes.get('curr_bed_type')
            if cama and cama != flatten_profiles.BED_TYPE:
                log.warning('%s pide cama %r; el taller rebana para %r', path.name, cama, flatten_profiles.BED_TYPE)
    except (zipfile.BadZipFile, OSError) as err:
        return f'no pude leer el proyecto 3MF: {err}'
    return None


def _extraer_preview(tmf_path: Path) -> Path | None:
    """Saca la vista del plato que Bambu Studio incrusta en el 3MF.

    Es el mismo render sombreado que se ve en la interfaz y en la pantalla de
    la impresora. Necesita sesión gráfica al rebanar: en la PC del taller
    existe (confirmado con Bambu Studio 02.07.00.55), pero una máquina sin
    pantalla deja el 3MF sin miniatura y la pieza se revisa solo con los
    estimados. Para ese caso hay un dibujante desde G-code listo en
    `agent/apendice/`, fuera del camino de producción.

    NO se usa la bandera --export-png del CLI: incluirla hace que el rebanador
    rechace todos los parámetros y no rebane nada.
    """
    try:
        with zipfile.ZipFile(tmf_path) as z:
            # 'pick' y 'top' son auxiliares del visor, no la vista del plato;
            # el orden alfabético deja primero plate_1.png (la grande) sobre
            # plate_1_small.png.
            candidatos = sorted(
                n
                for n in z.namelist()
                if n.startswith('Metadata/plate_')
                and n.endswith('.png')
                and 'pick' not in n
                and 'top' not in n
            )
            if not candidatos:
                return None
            destino = tmf_path.with_suffix('.png')
            destino.write_bytes(z.read(candidatos[0]))
            return destino
    except (zipfile.BadZipFile, OSError) as err:
        log.warning('no pude leer las miniaturas del 3MF: %s', err)
        return None


def _comando(
    exe: str,
    profiles_dir: Path,
    entrada: Path,
    proceso: Path | None,
    filamento: Path,
    tmp: Path,
    formato: str,
    orient: str = 'auto',
) -> list[str]:
    """Arma el argv del CLI de Bambu Studio. Puro: no toca disco ni red.

    `formato='stl'` es la receta de siempre: perfiles aplanados completos
    (`proceso` ya trae los soportes resueltos), acomodo y orientación que
    decide el rebanador, `--ensure-on-bed`.

    `formato='3mf'` rebana un PROYECTO de Bambu Studio (Guardar proyecto): la
    colocación, los soportes pintados y las capas ya están resueltos dentro
    del propio 3MF, así que `--load-settings`/`--arrange`/`--orient` se omiten
    a propósito — pisarían ese trabajo. Solo se fuerza el filamento
    (`--load-filaments`) para que las temperaturas sigan al material que Salva
    eligió en /taller, no al preset que traía el proyecto.
    """
    if formato == '3mf':
        return [
            exe,
            '--load-filaments', str(filamento),
            '--slice', '0',
            '--arrange', '0',
            '--orient', '0',
            '--export-3mf', _SALIDA,
            '--outputdir', str(tmp),
            str(entrada),
        ]
    return [
        exe,
        '--load-settings', f'{profiles_dir / "machine.json"};{proceso}',
        '--load-filaments', str(filamento),
        '--slice', '0',
        '--arrange', '1',
        '--orient', '1' if orient == 'auto' else '0',
        '--ensure-on-bed',
        '--export-3mf', _SALIDA,
        '--outputdir', str(tmp),
        str(entrada),
    ]


def slice_stl(
    exe: str,
    profiles_dir: Path,
    stl_path: Path,
    out_path: Path,
    material: str,
    supports: str = 'auto',
    orient: str = 'auto',
    timeout: int = 900,
    formato: str = 'stl',
) -> SliceResult:
    """Rebana `stl_path` y deja el .gcode.3mf en `out_path`.

    `formato`: 'stl' (un STL suelto, la receta de siempre) o '3mf' (un
    proyecto de Bambu Studio: se valida con `_validar_proyecto` y se respeta
    su colocación/soportes, solo se fuerza el filamento elegido).
    `supports`/`orient` solo aplican a `formato='stl'`; un proyecto 3mf ya
    trae ambos resueltos.
    """
    filamento = profiles_dir / f'filament_{material.lower()}.json'
    if not filamento.is_file():
        return SliceResult(False, error=f'no tengo perfil de filamento para {material}')

    if formato == '3mf':
        error_proyecto = _validar_proyecto(stl_path)
        if error_proyecto:
            return SliceResult(False, error=error_proyecto)

    tmp = Path(tempfile.mkdtemp(prefix='formamx_slice_'))
    try:
        if formato == '3mf':
            cmd = _comando(exe, profiles_dir, stl_path, None, filamento, tmp, formato)
        else:
            proceso = (
                _process_con_soportes(profiles_dir, tmp / 'process.json')
                if supports == 'auto'
                else profiles_dir / 'process_estandar.json'
            )
            cmd = _comando(exe, profiles_dir, stl_path, proceso, filamento, tmp, formato, orient=orient)
        log.info(
            'rebanando %s (%s, formato=%s, soportes=%s, orientación=%s)',
            stl_path.name, material, formato, supports, orient,
        )
        try:
            subprocess.run(cmd, capture_output=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            return SliceResult(False, error=f'el rebanado pasó de {timeout} s y lo corté')
        except OSError as err:
            return SliceResult(False, error=f'no pude ejecutar el rebanador: {err}')

        # El código de salida y stdout no son fiables: manda el result.json.
        resultado = tmp / 'result.json'
        if not resultado.is_file():
            return SliceResult(False, error='el rebanador no dejó result.json')
        try:
            datos = json.loads(resultado.read_text(encoding='utf-8'))
        except json.JSONDecodeError as err:
            return SliceResult(False, error=f'result.json ilegible: {err}')

        res = parse_result(datos)
        if not res.ok:
            return res

        generado = tmp / _SALIDA
        if not generado.is_file():
            return SliceResult(False, error='el rebanador dijo que sí pero no dejó el 3MF')
        out_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(generado), str(out_path))

        res.preview = _extraer_preview(out_path)
        if res.preview is None:
            log.info('sin imagen del plato para %s', stl_path.name)
        return res
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
