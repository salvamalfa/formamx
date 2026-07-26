# Agente de impresión

Corre en la PC con Windows que está en la misma red que la Bambu A1. Cada 20
segundos pregunta al taller si hay trabajos; cuando despachas un pedido desde
`/taller`, sube el 3MF a la impresora por FTPS, arranca la impresión por MQTT
con los colores mapeados a las ranuras del AMS, y reporta el progreso real al
dashboard.

## Requisitos

- Windows con **Python 3.11+** ([python.org](https://python.org); marca
  "Add python.exe to PATH" al instalar).
- La impresora con **Modo LAN / Modo desarrollador activados** (pantalla de la
  A1 → Configuración → Red). Ojo: algunos updates de firmware lo desactivan —
  si el agente deja de ver la impresora, revisa esto primero.
- Recomendado: en tu router, **reserva la IP** de la impresora (DHCP
  reservation) para que no cambie — si no, cada tanto el router se la
  reasigna y el agente deja de encontrarla hasta que actualices `ip` en tu
  `config.toml`.

## Instalación (una vez, en PowerShell)

```powershell
# 1. Carpeta de trabajo y código (dentro de tu carpeta de FORMA, que ya existe)
mkdir C:\Users\salva\Desktop\FORMA\04-Web\formamx
cd C:\Users\salva\Desktop\FORMA\04-Web\formamx
git clone https://github.com/salvamalfa/formamx.git repo
# (el repo es privado: git te pedirá iniciar sesión en GitHub la primera vez)
cd repo\agent
pip install -r requirements.txt

# 2. Configuración (nunca al repo: lleva el token)
copy config.example.toml C:\Users\salva\Desktop\FORMA\04-Web\formamx\config.toml
notepad C:\Users\salva\Desktop\FORMA\04-Web\formamx\config.toml
#   → pega agent_token, serial de la impresora, y revisa ip/access_code

# 3. Carpeta de los 3MF rebanados
mkdir C:\Users\salva\Desktop\FORMA\04-Web\formamx\3mf\pantalla
mkdir C:\Users\salva\Desktop\FORMA\04-Web\formamx\3mf\cuerpo
mkdir C:\Users\salva\Desktop\FORMA\04-Web\formamx\3mf\tapa
```

Cada lámpara son **3 impresiones separadas** (pantalla, cuerpo, tapa). Los 3MF
se exportan de Bambu Studio con **"Exportar plato rebanado"** (.gcode.3mf),
todos de **un solo filamento** (el color real lo pone el AMS al imprimir).

**El material va explícito en el nombre del archivo — no hay genéricos.** El
perfil con el que rebanas queda grabado en el G-code (temperaturas,
velocidades), así que cada archivo es de UN material y el nombre lo declara:

```
C:\Users\salva\Desktop\FORMA\04-Web\formamx\3mf\pantalla\tessera.petg.gcode.3mf   (y diamond, fluted... según el material)
C:\Users\salva\Desktop\FORMA\04-Web\formamx\3mf\cuerpo\cuerpo.pla.gcode.3mf
C:\Users\salva\Desktop\FORMA\04-Web\formamx\3mf\tapa\tapa.pla.gcode.3mf
```

El agente elige el archivo según el material de la ranura que va a usar: si
la ranura del azul reporta PETG, imprime `tessera.petg.gcode.3mf`. Si la
ranura no reporta material o el archivo del material no existe, el trabajo
falla con el motivo claro (nada se imprime a ciegas). Para arrancar basta con
los 3 archivos de un modelo; los demás se agregan cuando quieras.

El agente **lee el AMS de la impresora cada 5 minutos** (también en modo
ensayo, si `[printer]` está en el config) y actualiza solo el panel de
/taller: color exacto (hex), color de catálogo más parecido y material. El
panel es de **solo lectura** — lo que dice el AMS de la impresora manda; los
filamentos se configuran en la pantalla de la A1 o en Bambu Studio.

## Probar en ensayo (sin impresora)

Con `dry_run = true` en el config, el agente simula las impresiones: despacha
un pedido desde `/taller` y ve avanzar el progreso en el dashboard.

```powershell
cd C:\Users\salva\Desktop\FORMA\04-Web\formamx\repo\agent
python -m formamx_agent C:\Users\salva\Desktop\FORMA\04-Web\formamx\config.toml
```

Cuando el ensayo se vea bien: pon `dry_run = false` y haz una impresión de
prueba supervisada (quédate junto a la impresora la primera vez).

## Arranque automático con Windows

En PowerShell **como administrador**:

```powershell
schtasks /Create /TN "formamx-agent" /SC ONLOGON /RL LIMITED `
  /TR "'C:\Windows\py.exe' -3 -m formamx_agent C:\Users\salva\Desktop\FORMA\04-Web\formamx\config.toml" `
  /IT
```

(o Programador de tareas → Crear tarea básica → Al iniciar sesión → Iniciar un
programa: `py -3 -m formamx_agent C:\Users\salva\Desktop\FORMA\04-Web\formamx\config.toml`,
"Iniciar en": `C:\Users\salva\Desktop\FORMA\04-Web\formamx\repo\agent`.)

El log queda en `C:\Users\salva\Desktop\FORMA\04-Web\formamx\agent.log`.

## Entre impresiones: el candado de cama

La A1 no sabe si ya retiraste la pieza, así que después de **cada** impresión
(terminada o fallida a medias) el agente deja de recibir trabajos y en
`/taller` aparece el aviso **"Hay una pieza en la cama"**. Retira la pieza y
pulsa **"Cama despejada"**: la siguiente pieza arranca sola. El modo ensayo
también pasa por esta confirmación, para que practiques el flujo completo.

## Comportamiento ante fallos

- **Falta un color en el AMS** → el trabajo falla ANTES de tocar la impresora
  con el aviso "faltan en el AMS: …"; carga la bobina y dale Reintentar en /taller.
- **Impresora apagada / sin red** → error en el log y reintento cada 5 min.
- **Agente muerto a media preparación** → el servidor reencola el trabajo solo
  a los 15 min.
- **Impresora ocupada** (algo lanzado a mano) → el agente espera a que termine.
- Marcar el pedido **Lista** tras revisar las piezas siempre es decisión tuya
  en /taller; el agente nunca lo hace.
