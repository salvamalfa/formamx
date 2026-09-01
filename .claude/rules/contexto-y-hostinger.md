---
---

# Dónde estás, y qué hay fuera de este repo

Esta regla no tiene `paths:` a propósito: se carga siempre, en local y en la
nube, porque describe el terreno.

## Este repo es una pieza de algo más grande

En la PC de Salva, este repo está clonado **dentro** de una carpeta `FORMA`
(`FORMA/06-Web/formamx/repo/`) que contiene el resto del negocio: lo legal y
fiscal, las finanzas, el brand kit y, sobre todo, **el pipeline de las
lámparas**: los STL, la escena de Blender y los renders originales en
`FORMA/05-Proyectos/Lamparas-3D/`.

En una sesión de nube **esa carpeta no existe**. Si necesitas un render
original, un STL o un documento legal, no está aquí y no lo puedes generar:
dilo y pídeselo a Salva, en vez de inventarlo o de improvisar un sustituto.
Los STL y 3MF nunca se commitean (binarios pesados), así que faltan en ambos
lados.

## El código de este repo se cambia por GitHub, siempre

Da igual desde dónde trabajes. Un cambio al sitio, al `/taller` o al Worker
va en una rama, con su PR, y se mergea; el merge a `master` dispara el deploy.
El flujo completo está en `CLAUDE.md`.

Lo que **nunca** vale es dejar un cambio suelto en la copia local. Si editas
archivos de este repo desde una sesión abierta en `FORMA` y no los llevas
hasta el merge, ese trabajo no existe: no está desplegado, y ninguna sesión
de nube ni ninguna otra máquina lo va a ver. Un cambio local sin PR es
trabajo perdido esperando a que alguien lo descubra.

## Hostinger

Los servidores MCP de Hostinger están declarados en `.mcp.json` (en la raíz),
así que viajan con el repo y funcionan igual en local y en la nube. Lo único
que hace falta es la variable de entorno `HOSTINGER_API_TOKEN`, igual que
`CLOUDFLARE_API_TOKEN`.

Dan acceso real a la cuenta: DNS, dominios, correo, hosting, facturación,
VPS y Reach. Dos cosas antes de usarlos:

- Las operaciones que gastan dinero o son irreversibles (comprar dominio o
  VPS, borrar métodos de pago, borrar o resetear registros DNS, transferir el
  dominio, borrar un sitio o una base) están **bloqueadas** en
  `.claude/settings.json`. Si alguna hace falta de verdad, la hace Salva en
  hPanel.
- El DNS de `formamx.com` sostiene el sitio **y el correo**. Tocar un registro
  ahí no es un cambio de código: consulta antes, aunque no esté bloqueado.

El conector hosteado de Hostinger (el de OAuth desde claude.ai) devuelve 403 y
no sirve; no lo uses ni intentes arreglarlo desde aquí. Contexto en
`docs/MARKETING.md`.
