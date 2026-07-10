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
  reservation) para que no cambie.

## Instalación (una vez, en PowerShell)

```powershell
# 1. Carpeta de trabajo y código
mkdir C:\formamx
cd C:\formamx
git clone https://github.com/salvamalfa/formamx.git repo
cd repo\agent
pip install -r requirements.txt

# 2. Configuración (nunca al repo: lleva el token)
copy config.example.toml C:\formamx\config.toml
notepad C:\formamx\config.toml
#   → pega agent_token, serial de la impresora, y revisa ip/access_code

# 3. Carpeta de los 3MF rebanados
mkdir C:\formamx\3mf\pantalla
mkdir C:\formamx\3mf\cuerpo_tapa
```

Los 3MF se exportan de Bambu Studio con **"Exportar plato rebanado"**
(.gcode.3mf), con nombres exactos:

```
C:\formamx\3mf\pantalla\tessera.gcode.3mf     (y diamond, fluted, rhombus, torsion)
C:\formamx\3mf\cuerpo_tapa\cuerpo_tapa.gcode.3mf
```

- Cada **pantalla** se rebana con 1 filamento (PLA genérico; el color real lo
  pone el AMS al imprimir).
- El **cuerpo_tapa** es un plato con 2 filamentos: **F1 = cuerpo (blanco),
  F2 = tapa (color)**. Ese orden importa: es el que usa el mapeo.

## Probar en ensayo (sin impresora)

Con `dry_run = true` en el config, el agente simula las impresiones: despacha
un pedido desde `/taller` y ve avanzar el progreso en el dashboard.

```powershell
cd C:\formamx\repo\agent
python -m formamx_agent C:\formamx\config.toml
```

Cuando el ensayo se vea bien: pon `dry_run = false` y haz una impresión de
prueba supervisada (quédate junto a la impresora la primera vez).

## Arranque automático con Windows

En PowerShell **como administrador**:

```powershell
schtasks /Create /TN "formamx-agent" /SC ONLOGON /RL LIMITED `
  /TR "'C:\Windows\py.exe' -3 -m formamx_agent C:\formamx\config.toml" `
  /IT
```

(o Programador de tareas → Crear tarea básica → Al iniciar sesión → Iniciar un
programa: `py -3 -m formamx_agent C:\formamx\config.toml`, "Iniciar en":
`C:\formamx\repo\agent`.)

El log queda en `C:\formamx\agent.log`.

## Comportamiento ante fallos

- **Falta un color en el AMS** → el trabajo falla ANTES de tocar la impresora
  con el aviso "faltan en el AMS: …"; carga la bobina y dale Reintentar en /taller.
- **Impresora apagada / sin red** → error en el log y reintento cada 5 min.
- **Agente muerto a media preparación** → el servidor reencola el trabajo solo
  a los 15 min.
- **Impresora ocupada** (algo lanzado a mano) → el agente espera a que termine.
- Marcar el pedido **Lista** tras revisar las piezas siempre es decisión tuya
  en /taller; el agente nunca lo hace.
