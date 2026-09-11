# Sonda del CLI de Bambu Studio para proyectos 3MF

Salida cruda, sin interpretar. Generada el 2026-09-10 con Bambu Studio en
`C:\Program Files\Bambu Studio\bambu-studio.exe` y los perfiles de
`06-Web/formamx/perfiles/`.

## Advertencia sobre el archivo de entrada

La sonda **no** se corrió con el proyecto especificado (un 3MF guardado con
"Guardar proyecto" desde Bambu Studio con la A1 seleccionada, pieza girada y
fuera del centro, soportes pintados). Ese archivo no existe todavía.

Se corrió con `06-Web/formamx/3mf/cuerpo/cuerpo.pla.gcode.3mf`, que es **salida
del agente** (un plato ya rebanado, con `Metadata/plate_1.gcode` dentro), no un
proyecto guardado. Sus ajustes de origen: `printer_model = Bambu Lab A1`,
`curr_bed_type = Textured PEI Plate`, `layer_height = 0.2`,
`enable_support = 0`, `filament_settings_id = ['Generic PLA @BBL A1']`.

Por eso los criterios de paso de la sonda no son evaluables tal como se
escribieron. Se agregan dos controles al final para separar "el archivo no
sirve" de "la invocacion no sirve".

## Variante A

Comando (el mismo que `slicer.py` usa en produccion para `formato='3mf'`):

    bambu-studio.exe --load-filaments perfiles\filament_pla.json --slice 0 --arrange 0 --orient 0 --export-3mf pieza.gcode.3mf --outputdir $out 3mf\cuerpo\cuerpo.pla.gcode.3mf

`result.json`:

```json
{
    "error_string": "The input model file to the slicer can not be parsed.",
    "export_time": 0,
    "layer_height": 0.0,
    "plate_index": 0,
    "prepare_time": 0,
    "return_code": -6,
    "sparse_infill_density": 0.0,
    "wall_loops": 0
}
```

Archivos generados en `$out`: solo `result.json`. No se genero `pieza.gcode.3mf`,
asi que no hay `Metadata/` que listar ni `plate_1.gcode` al que aplicar el
`Select-String`.

## Variante B

Igual que A, agregando `--load-settings perfiles\machine.json` antes de
`--load-filaments`.

`result.json`:

```json
{
    "error_string": "The input model file to the slicer can not be parsed.",
    "export_time": 0,
    "layer_height": 0.0,
    "plate_index": 0,
    "prepare_time": 0,
    "return_code": -6,
    "sparse_infill_density": 0.0,
    "wall_loops": 0
}
```

Archivos generados en `$out`: solo `result.json`.

## Control 1: un STL con la receta de STL

Valida que el exe, los perfiles y la invocacion funcionen. Entrada:
`05-Proyectos/Lamparas-3D/Modelos/cap/simplecap.stl`.

    bambu-studio.exe --load-settings "perfiles\machine.json;perfiles\process_estandar.json" --load-filaments perfiles\filament_pla.json --slice 0 --arrange 1 --orient 1 --ensure-on-bed --export-3mf pieza.gcode.3mf --outputdir $out1 simplecap.stl

`result.json` completo:

```json
{
    "error_string": "Success.",
    "export_time": 454,
    "layer_height": 0.20000000298023224,
    "plate_index": 0,
    "prepare_time": 147,
    "return_code": 0,
    "sliced_plates": [
        {
            "feature_type_times": {
                "Bottom surface": 166.7154998779297,
                "Bridge": 212.31088256835938,
                "Custom": 367.1524658203125,
                "Flush": 25.0,
                "Gap infill": 14.154206275939941,
                "Inner wall": 129.5218963623047,
                "Internal solid infill": 420.4240417480469,
                "Outer wall": 202.582275390625,
                "Sparse infill": 202.94491577148438,
                "Top surface": 116.67449951171875,
                "Travel": 259.6988525390625,
                "Undefined": 242.8295440673828
            },
            "filament_change_times": 0,
            "filaments": [
                {
                    "filament_id": "GFA00",
                    "id": 1,
                    "main_used_g": 16.362905502319336,
                    "total_used_g": 16.362905502319336
                }
            ],
            "generate_support_material_time": 28,
            "id": 1,
            "infill_time": 102,
            "layer_filament_change": 0,
            "main_predication": 1700.034423828125,
            "make_perimeters_time": 71,
            "obj_cached_cnt": 0,
            "objects": [
                {
                    "bbox": {
                        "depth": 120.54663848876953,
                        "height": 8.57928466796875,
                        "width": 120.54663848876953,
                        "x": 67.7267074584961,
                        "y": 67.72663879394531,
                        "z": 0.0
                    },
                    "id": 5,
                    "name": "simplecap.stl",
                    "triangle_count": 40370
                }
            ],
            "sliced_time": 432,
            "sliced_time_with_cache": 142,
            "total_predication": 2100.317626953125,
            "triangle_count": 40370,
            "warning_message": ""
        }
    ],
    "sparse_infill_density": 15.0,
    "wall_loops": 2
}
```

## Control 2: un proyecto guardado de verdad (impresora ajena)

Entrada: `C:\Users\salva\Downloads\SnapLamp_V14b.3mf`, un "Guardar proyecto" de
Bambu Studio con `printer_model = Bambu Lab H2C`, 7 filamentos, 7 platos,
`enable_support = 1`, `support_type = tree(manual)`, soportes pintados
(`paint_supports` presente en los objetos), sin gcode adentro. Mismo comando que
la variante A.

`result.json` (61514 bytes; se incluyen los campos de primer nivel y el primer
plato — el archivo completo se puede regenerar corriendo el comando):

```json
{
    "error_string": "Success.",
    "export_time": 17869,
    "layer_height": 0.20000000298023224,
    "plate_index": 0,
    "prepare_time": 7674,
    "return_code": 0,
    "sliced_plates": [
        {
            "feature_type_times": {
                "Bottom surface": 1419.6690673828125,
                "Bridge": 1912.0057373046875,
                "Custom": 299.3761291503906,
                "Flush": 2335.0,
                "Gap infill": 2346.71826171875,
                "Inner wall": 13175.7314453125,
                "Internal solid infill": 8942.78515625,
                "Outer wall": 18216.173828125,
                "Overhang wall": 95.22407531738281,
                "Sparse infill": 11671.0126953125,
                "Support": 531.0333862304688,
                "Support interface": 56.929351806640625,
                "Top surface": 1122.645263671875,
                "Travel": 14096.7060546875,
                "Undefined": 14093.1201171875
            },
            "filament_change_times": 0,
            "filaments": [
                {
                    "filament_id": "GFA00",
                    "id": 1,
                    "main_used_g": 345.3497619628906,
                    "total_used_g": 345.3497619628906
                },
                {
                    "filament_id": "GFA17",
                    "id": 2,
                    "main_used_g": 90.19499206542969,
                    "total_used_g": 90.19499206542969
                },
                {
                    "filament_id": "GFA16",
                    "id": 3,
                    "main_used_g": 10.084065437316895,
                    "total_used_g": 10.084065437316895
                }
            ],
            "generate_support_material_time": 817,
            "id": 1,
            "infill_time": 5450,
            "layer_filament_change": 0,
            "main_predication": 73519.5234375,
            "make_perimeters_time": 5054,
            "obj_cached_cnt": 0,
            "objects": [
                {
                    "bbox": {
                        "depth": 18.96917152404785,
                        "height": 6.096000671386719,
                        "width": 18.89455795288086,
                        "x": 198.3209991455078,
                        "y": 26.34696388244629,
                        "z": 4.306640821738483e-09
                    },
                    "id": 5,
                    "name": "Gear.stl",
                    "triangle_count": 4208
                },
                {
                    "bbox": {
                        "depth": 27.382400512695313,
                        "height": 3.3266525268554688,
                        "width": 57.37527084350586,
                        "x": 166.1268768310547,
                        "y": 8.11139965057373,
                        "z": -3.4277343186062126e-09
                    },
                    "id": 9,
  ```

Archivos generados en `$out2`:

```
pieza.gcode.3mf
pieza.zip
plate_1.gcode
plate_2.gcode
plate_3.gcode
plate_4.gcode
plate_5.gcode
plate_6.gcode
plate_7.gcode
result.json
x
```

`Metadata/` del `pieza.gcode.3mf` generado:

```
_rels
cut_information.xml
filament_sequence.json
model_settings.config
pick_1.png
pick_2.png
pick_3.png
pick_4.png
pick_5.png
pick_6.png
pick_7.png
plate_1.gcode
plate_1.gcode.md5
plate_1.json
plate_1.png
plate_1_small.png
plate_2.gcode
plate_2.gcode.md5
plate_2.json
plate_2.png
plate_2_small.png
plate_3.gcode
plate_3.gcode.md5
plate_3.json
plate_3.png
plate_3_small.png
plate_4.gcode
plate_4.gcode.md5
plate_4.json
plate_4.png
plate_4_small.png
plate_5.gcode
plate_5.gcode.md5
plate_5.json
plate_5.png
plate_5_small.png
plate_6.gcode
plate_6.gcode.md5
plate_6.json
plate_6.png
plate_6_small.png
plate_7.gcode
plate_7.gcode.md5
plate_7.json
plate_7.png
plate_7_small.png
plate_no_light_1.png
plate_no_light_2.png
plate_no_light_3.png
plate_no_light_4.png
plate_no_light_5.png
plate_no_light_6.png
plate_no_light_7.png
project_settings.config
slice_info.config
top_1.png
top_2.png
top_3.png
top_4.png
top_5.png
top_6.png
top_7.png
```

`Select-String` sobre `Metadata/plate_1.gcode` (se omite la linea
`machine_start_gcode`, que hace match con el patron `M970` y ocupa ~12 KB):

```
; curr_bed_type = Textured PEI Plate
; enable_support = 1
; enable_support_ironing = 0
; filament_settings_id = "Bambu PLA Basic @BBL A1";"Bambu PLA Translucent @BBL H2C";"Bambu PLA Wood @BBL H2C 0.4 nozzle";"Bambu PLA Wood @BBL H2C 0.4 nozzle";"Bambu PLA Wood @BBL H2C 0.4 nozzle";"Bambu PLA Wood @BBL H2C 0.4 nozzle";"Bambu PLA Wood @BBL H2C 0.4 nozzle"
; layer_height = 0.2
; printer_model = Bambu Lab H2C
; support_type = tree(manual)
; LAYER_HEIGHT: 0.2
```

## Pendiente

Volver a correr A (y B si hace falta) con el proyecto de la A1 en
`06-Web/formamx/pruebas/prueba.3mf` para poder evaluar los criterios de paso
como se escribieron.
