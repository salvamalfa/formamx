# Apéndice: vista del rebanado dibujada desde el G-code

**Esto NO está en el camino de producción.** El agente usa la miniatura que
Bambu Studio incrusta en el 3MF, que es un render sombreado y se ve mejor.
Este código se conserva porque resuelve un caso concreto que puede volver.

## Qué hace

Lee el G-code que el propio `.gcode.3mf` lleva dentro y dibuja el recorrido
real del extrusor en isométrica: sale la pieza en la orientación con la que se
va a imprimir y con sus soportes, porque son extrusiones como cualquier otra.
El degradado por altura (azul abajo, tinta arriba) da la sensación de volumen.

- `preview.py` — lee el G-code, proyecta y dibuja.
- `lienzo.py` — líneas con Bresenham y un PNG escrito a mano con `zlib` y
  `struct`. Sin dependencias: el agente no pide instalar nada.

## Cuándo desempolvarlo

La miniatura de Bambu **necesita sesión gráfica al rebanar**. En la PC del
taller existe (confirmado con Bambu Studio 02.07.00.55), pero desaparece si el
rebanado corre sin pantalla. El caso previsto es la Mac mini de
`docs/AGENTE_IA.md` fase B0: si ahí el agente corre como servicio `launchd`
sin sesión gráfica, los 3MF saldrán sin miniatura y la pieza se revisará solo
con tiempo y gramos.

Si eso pasa, volver a enchufarlo es cambiar el final de `_extraer_preview` en
`agent/formamx_agent/slicer.py` para que, cuando no encuentre miniatura, llame
a `render_desde_3mf` en vez de devolver `None`.

Lo que **no** hay que hacer nunca es pasar `--export-png` al CLI: incluirla
hace que el rebanador rechace todos los parámetros y no rebane nada
(ver maña 5 en `docs/STL_CLIENTES.md`).

## Probarlo suelto

```sh
cd agent
python -c "
from pathlib import Path
from apendice.preview import render_desde_3mf
print(render_desde_3mf(Path('ruta/a/pieza.gcode.3mf'), Path('vista.png')))
"
```

Sus pruebas viven en `agent/tests/test_apendice.py` y corren con el resto, para
que no se pudra sin que nos enteremos.
