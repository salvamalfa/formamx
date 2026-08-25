-- Migration number: 0018 	 limpieza pendiente de los archivos del cliente
-- Al terminar de imprimirse, el STL del cliente y su vista previa se borran de
-- R2: en el histórico solo queda el metadato. Esa limpieza es best effort (no
-- puede bloquear el reporte del agente), así que necesita una bandera propia
-- para saber si de verdad ocurrió. Sin ella, un fallo transitorio de R2 se
-- perdía en silencio y el archivo del cliente se quedaba guardado para
-- siempre; con ella, el listado del tablero reintenta la limpieza.
--   files_deleted = 0  → los objetos de R2 siguen (o deben seguir) ahí
--   files_deleted = 1  → ya se limpiaron; la fila es solo histórico
-- Las filas vivas (subido/listo/…) se quedan en 0, que es lo correcto: sus
-- archivos tienen que existir.

ALTER TABLE custom_prints ADD COLUMN files_deleted INTEGER NOT NULL DEFAULT 0;
