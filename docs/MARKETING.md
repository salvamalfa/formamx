# Marketing — newsletter de clientes y decisiones de canal

Documenta las decisiones tomadas sobre el newsletter dirigido a clientes de
FORMA (comunidad, producto, novedades) y el stack de envío elegido. Tiene un
componente en el sitio (formulario de suscripción) por eso vive en el repo y
no solo en local.

**No confundir con el newsletter interno de FORMA.** Ese es un agente de
Cowork programado en la nube, semanal, sobre tendencias/investigación para
Salva, y no tiene nada que ver con este documento ni con Reach.

**Estado: decisión de stack tomada, cuenta configurada, nada enviado
todavía.** El formulario de suscripción en el sitio sigue sin construirse.

## Datos legales para el pie del correo

Un correo comercial masivo tiene que llevar razón social y domicilio. Son
estos, y son los que usa el sistema de plantillas:

- **Razón social: FORMA WORKS, S.A.S.** Inscrita en el Registro Público de
  Comercio de la CDMX el 24/07/2026, FME N-2026059434, capital fijo (por eso
  `S.A.S.` sin "de C.V."). Fuente: `FORMA/01-Legal/Boleta_RPC.pdf`.
  **No es "FORMA STUDIO"**: ese nombre aparecía en borradores viejos y nunca
  fue el registrado.
- **Domicilio:** Camino San Juan de Aragón 215, L-14, Pueblo San Juan de
  Aragón, C.P. 07950, Gustavo A. Madero, Ciudad de México.
  Ojo: es el **domicilio social** del acta constitutiva. La Constancia de
  Situación Fiscal todavía no está guardada en `FORMA/02-Fiscal/`, así que
  conviene confirmar contra el SAT que el domicilio fiscal coincide antes del
  primer envío real.

## Por qué Hostinger Reach y no otra cosa

- El dominio `formamx.com` ya vive en Hostinger (DNS, correo, hosting del
  sitio), así que Reach configura solo los registros de envío
  (SPF/DKIM/DMARC) contra ese mismo dominio. Confirmado el 2026-09-01: los
  cuatro registros (MX, SPF, DKIM, DMARC) están válidos y el dominio de envío
  está `active`.
- **Google Workspace se descartó** como alternativa: no está diseñado para
  envío masivo de marketing (Google lo dice explícito en sus guías para
  remitentes), no da gestión de listas/segmentos/unsubscribe, y no ofrece IP
  dedicada tampoco, así que no resuelve nada que Reach no resuelva mejor. Se
  sigue usando Hostinger Mail para el correo normal del negocio
  (`hola@formamx.com`), aparte de esto.
- Se evaluaron Beehiiv/Mailchimp/Resend antes de decidir por Reach; Reach
  ganó por estar ya integrado al dominio y por precio, no porque los otros
  fueran peores en general.

## Cuenta actual (al 2026-09-01, puede quedar desactualizado)

- Plan trial: 100 destinatarios, 200 correos/mes, expira 2027-09-01,
  auto-renovación activa contra la tarjeta en archivo.
- Perfil `formamx.com` / marca "Forma", sin logo cargado todavía.
- Cero contactos, cero segmentos, cero campañas, cero formularios, cero
  automatizaciones. Arranque limpio.
- **Plan: se sube a Reach 500.** El Code editor (subir y editar HTML propio)
  es una función premium disponible **desde Reach 500 en adelante**, y es lo
  que habilita el sistema de plantillas de `newsletter/`. El plan gratis solo
  deja el editor de bloques y el generador con IA.

### Qué le hace Reach al HTML que subes

Importante para el sistema de plantillas, porque condiciona qué NO debemos
maquetar:

- Al guardar, **Reach valida y ajusta la estructura del HTML** para mejorar
  compatibilidad. No esperes que lo que subes salga byte por byte igual.
- **Reach se encarga del enlace de baja**: se asegura de que exista y esté
  bien configurado. Por eso la plantilla no maqueta su propio unsubscribe,
  pelearía con el suyo. La razón social y el domicilio sí van en nuestro pie:
  esos no los pone Reach.
- Su propia documentación pide "HTML hecho específicamente para correo, no
  HTML de web normal", y layouts simples. De ahí que el build emita tablas y
  estilos en línea.

## El sistema de plantillas

El correo no se maqueta a mano cada mes: una edición se escribe como texto en
`newsletter/ediciones/` y `npm run newsletter:build` produce el HTML de correo
con la marca aplicada. Los colores salen del design system (`ds-bundle/tokens/`)
para que el newsletter siga a la marca sin copiarla, y un lint bloquea lo que
la voz de forma no admite (emoji, guiones largos, jerga de marketing, enlaces
relativos, huecos sin llenar).

El procedimiento completo está en `.claude/skills/newsletter/SKILL.md`. Lo que
el sistema **no** hace es enviar: eso sigue siendo manual por lo de la API.

## Cómo se accede a Reach desde Claude Code

Dos vías, no son lo mismo:

- **Conector hosteado** (`claude.ai/directory/hostinger-connector`, OAuth):
  viaja con la cuenta de Anthropic a cualquier sesión, incluida la nube.
  **Ahora mismo devuelve error 403 en llamadas reales**, aunque la
  autorización se complete. Pendiente de reinstalar/arreglar.
- **Servidores MCP por CLI** (`hostinger-reach`, `hostinger-dns`, etc. vía
  `npx hostinger-api-mcp` con token de hPanel, agregados con `-s user` en
  `C:\Users\salva\.claude.json`): sí funcionan, pero solo existen en la
  máquina Windows de Salva. Una sesión en la nube no los puede usar.

**Por qué importa para este proyecto:** si el newsletter de clientes se
automatiza como agente programado (igual que el interno), ese trabajo corre
en la nube y necesita el conector hosteado funcionando, no la vía CLI. Es
un bloqueante real para automatizar esto sin depender de que la laptop de
Salva esté encendida.

## Limitación conocida de la API de Reach (al 2026-09-01)

La API de Reach tiene CRUD completo para contactos, segmentos, tags, campos
y formularios, pero **solo lectura para campañas** (`listCampaigns`,
`getCampaignDetails`, `getCampaignPerformance`). No hay endpoint para crear
o mandar una campaña, ni para asignarle HTML. Consecuencia: sin importar
dónde se diseñe la plantilla (aquí con Claude Design o con el generador de
IA de Reach), **crear y mandar la campaña hoy tiene que pasar por la web de
Reach**, a mano. Esto puede cambiar si Hostinger amplía su API; revisar antes
de asumir que ya se puede automatizar el envío completo.

## Pendiente: formulario de suscripción en el sitio

**La maqueta ya existe**, no hay que diseñarla: `src/pages/index.astro`
(alrededor de la línea 157) tiene el input de correo y el botón "Avísame" en
el pie de la portada, con el copy "Sin algoritmo de por medio: te escribo
cuando hay pieza nueva". El botón es `type="button"` y no tiene handler: es
puro decorado.

Lo que falta es conectarlo. Reach expone formularios con una URL de plantilla
hosteada (`reach_getFormDetailsV1`), pero no trae snippet de embed listo, así
que hay que decidir entre embeber ese formulario hosteado o hacer que el
botón actual llame a la API de contactos de Reach (`reach_createNewContactsV1`)
a través del Worker, para no exponer el token en el cliente.

## Próximos pasos

1. Subir a Reach 500 y confirmar que el Code editor aparece.
2. Subir el HTML que produce `newsletter/` y mandarse la primera edición a uno
   mismo, para ver cómo cae en Gmail (que ignora Alan Sans y cae a Arial) y en
   modo oscuro.
3. Definir logo/marca del perfil de Reach.
4. Conectar el formulario de suscripción que ya está maquetado en la portada.
5. Arreglar el conector hosteado antes de intentar automatizar el envío
   como agente programado.
6. Confirmar el domicilio fiscal contra el SAT (ver "Datos legales" arriba).
