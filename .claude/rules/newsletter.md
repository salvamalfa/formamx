---
paths:
  - "newsletter/**"
  - "public/newsletter/**"
---

# Newsletter de clientes

El procedimiento completo (formato de una edición, catálogo de bloques, voz de
marca, cómo construir) está en `.claude/skills/newsletter/SKILL.md`. Léelo antes
de tocar estos archivos.

Lo que más se olvida:

- **El envío es manual.** La API de Reach es solo lectura para campañas: no hay
  endpoint para crear ni mandar. Esto llega hasta el HTML; Salva lo sube.
- **No maquetes un enlace de baja.** Reach pone el suyo al guardar el HTML. La
  razón social y el domicilio sí van en nuestro pie, esos no los pone él.
- **Tablas y estilos en línea, nunca flex ni grid.** `newsletter/render.test.ts`
  guarda esa y otras invariantes del correo.
- **Los colores salen de `ds-bundle/tokens/`** vía `newsletter/tokens.ts`. No
  escribas un hex a mano en un bloque.
