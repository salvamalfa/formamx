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
mkdir C:\formamx\3mf\cuerpo
mkdir C:\formamx\3mf\tapa
```

Cada lámpara son **3 impresiones separadas** (pantalla, cuerpo, tapa). Los 3MF
se exportan de Bambu Studio con **"Exportar plato rebanado"** (.gcode.3mf),
todos de **un solo filamento** (el color real lo pone el AMS al imprimir),
con nombres exactos:

```
C:\formamx\3mf\pantalla\tessera.gcode.3mf     (y diamond, fluted, rhombus, torsion)
C:\formamx\3mf\cuerpo\cuerpo.gcode.3mf
C:\formamx\3mf\tapa\tapa.gcode.3mf
```

Para arrancar basta con los 3 archivos de un modelo (p. ej. tessera): los
otros modelos de pantalla se agregan cuando quieras.

**Materiales.** El perfil de filamento con el que rebanas queda grabado en el
G-code (temperaturas, velocidades), así que cada archivo es de UN material.
El agente elige la variante según el material de la ranura que va a usar:
si la ranura del azul es PETG, busca primero `tessera.petg.gcode.3mf` (y
`tessera.pla.gcode.3mf` para PLA); si no hay variante, usa el genérico
`tessera.gcode.3mf`. Regla práctica: si una pieza siempre es del mismo
material, rebana el genérico con ese perfil y listo; crea variantes solo
para piezas que imprimas en más de un material.

El agente además **lee el AMS de la impresora cada 5 minutos** (tipo y color
que configuraste en la pantalla de la A1) y actualiza solo el panel de
ranuras de /taller. También puedes editarlo a mano; los colores que no se
parezcan a los del catálogo quedan sin asignar para que los corrijas.

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
