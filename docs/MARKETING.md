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
- **Decisión: no subir a un plan de pago todavía.** Subir HTML propio a una
  campaña requiere el plan pagado (confirmado en la UI, la opción "Subir
  HTML" trae candado Pro). Antes de comprometerse a un plan de 12-24 meses,
  se van a mandar las primeras ediciones con el editor/IA del plan gratis
  para validar que el formato y la cadencia funcionan.

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

Falta el componente en `formamx.com` para que un visitante se suscriba a la
lista (referenciado por Salva como parte de este proyecto, aún sin
implementar). Reach expone formularios con una URL de plantilla hosteada
(`reach_getFormDetailsV1`), pero no trae snippet de embed listo, así que
hay que decidir si se embebe ese formulario hosteado o se construye uno
propio en Astro que hable con la API de contactos de Reach.

## Próximos pasos

1. Definir logo/marca del perfil de Reach.
2. Mandar 1-2 ediciones de prueba con el editor gratis de Reach (sin HTML
   propio) para validar contenido y cadencia antes de pagar.
3. Construir el formulario de suscripción en el sitio.
4. Arreglar el conector hosteado antes de intentar automatizar el envío
   como agente programado.
5. Decidir sobre el upgrade de plan solo si el gratis se vuelve un límite
   real (más de 100 contactos, o necesidad probada de HTML propio).
