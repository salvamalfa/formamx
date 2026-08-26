-- Migration number: 0023 	 tono real de la bobina + identidad RFID de la ranura
-- Tono real de la bobina y identidad física de la ranura del AMS.
--
-- Hasta aquí una bobina del almacén solo guardaba un color_id del catálogo de
-- la lámpara, mientras que la ranura del AMS solo guardaba el hex que reporta
-- la impresora. Sin un tono con qué comparar, el desplegable de "Bobina del
-- almacén" no podía filtrar nada y dejaba colgar una bobina azul de la ranura
-- blanca; y una ranura gris (#757575) no empataba con ninguna bobina porque
-- 'gris' ni siquiera era un color que una bobina pudiera declarar.
ALTER TABLE bobinas ADD COLUMN color_hex TEXT; -- '#RRGGBB' en mayúsculas

-- Identidad física del filamento cargado, leída del RFID del AMS. Solo la
-- traen las bobinas Bambu; el filamento genérico reporta ceros o nada, y ahí
-- el re-mapeo cae a la firma (material + color_hex). Sirve para que el vínculo
-- con el almacén siga a la bobina cuando cambia de ranura, en vez de quedarse
-- pegado al número de ranura y descontar gramos de la bobina equivocada.
ALTER TABLE spool_slots ADD COLUMN tray_uuid TEXT;

-- Backfill: las bobinas que ya existen heredan el swatch de su color de
-- catálogo (src/config/lamps.ts) para que entren con tono desde el primer
-- deploy y el filtro por familia funcione sin tocarlas a mano.
UPDATE bobinas
   SET color_hex = CASE color_id
     WHEN 'blanco'   THEN '#F4F4F2'
     WHEN 'azul'     THEN '#2F5FD6'
     WHEN 'rojo'     THEN '#C5202B'
     WHEN 'verde'    THEN '#2E9E3F'
     WHEN 'amarillo' THEN '#D9A221'
     WHEN 'morado'   THEN '#7B3FC4'
     WHEN 'naranja'  THEN '#E0701A'
     WHEN 'gris'     THEN '#808080'
     WHEN 'negro'    THEN '#1A1A18'
   END
 WHERE color_hex IS NULL AND color_id IS NOT NULL;
