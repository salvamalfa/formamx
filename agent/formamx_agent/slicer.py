"""Rebana un STL con el CLI de Bambu Studio y saca tiempo, gramos y preview.

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

log = logging.getLogger('formamx.slicer')

# Cama de la A1. El chequeo es una red de seguridad con mensaje legible: el
# rebanador también se queja, pero con un texto que no le dice nada a nadie.
CAMA_MM = 256.0
# Tolerancia para no rechazar una pieza de 256.0000001 por redondeo del STL.
HOLGURA_MM = 0.5


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
    plato = platos[0]

    for obj in plato.get('objects') or []:
        caja = obj.get('bbox') or {}
        medidas = [caja.get('width'), caja.get('depth'), caja.get('height')]
        if any(isinstance(m, (int, float)) and m > CAMA_MM + HOLGURA_MM for m in medidas):
            grandes = ' × '.join(f'{m:.0f}' if isinstance(m, (int, float)) else '?' for m in medidas)
            return SliceResult(
                False, error=f'la pieza mide {grandes} mm y no cabe en la cama ({CAMA_MM:.0f} mm)'
            )

    prediccion = plato.get('main_predication')
    seconds = round(prediccion) if isinstance(prediccion, (int, float)) else None
    gramos = sum(
        f.get('total_used_g') or 0
        for f in plato.get('filaments') or []
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


def slice_stl(
    exe: str,
    profiles_dir: Path,
    stl_path: Path,
    out_path: Path,
    material: str,
    supports: str = 'auto',
    orient: str = 'auto',
    timeout: int = 900,
) -> SliceResult:
    """Rebana `stl_path` y deja el .gcode.3mf en `out_path`.

    `supports`: 'auto' enciende los soportes automáticos, 'no' los apaga.
    `orient`: 'auto' deja que el rebanador elija la mejor orientación (evalúa
    voladizos y área de contacto, como el botón de la interfaz); 'original'
    respeta la orientación con la que viene el archivo.
    """
    filamento = profiles_dir / f'filament_{material.lower()}.json'
    if not filamento.is_file():
        return SliceResult(False, error=f'no tengo perfil de filamento para {material}')

    tmp = Path(tempfile.mkdtemp(prefix='formamx_slice_'))
    try:
        proceso = (
            _process_con_soportes(profiles_dir, tmp / 'process.json')
            if supports == 'auto'
            else profiles_dir / 'process_estandar.json'
        )
        salida = 'pieza.gcode.3mf'
        cmd = [
            exe,
            '--load-settings', f'{profiles_dir / "machine.json"};{proceso}',
            '--load-filaments', str(filamento),
            '--slice', '0',
            '--arrange', '1',
            '--orient', '1' if orient == 'auto' else '0',
            '--ensure-on-bed',
            '--export-3mf', salida,
            '--outputdir', str(tmp),
            str(stl_path),
        ]
        log.info('rebanando %s (%s, soportes=%s, orientación=%s)', stl_path.name, material, supports, orient)
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

        generado = tmp / salida
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
