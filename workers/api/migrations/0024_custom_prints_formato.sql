-- Migration number: 0024 	 formato de la pieza de cliente (stl | 3mf de proyecto)
-- Hasta aquí toda pieza de cliente era un STL crudo, que el agente rebanaba
-- con la receta fija (soportes/orientación elegidos en /taller). Ahora
-- también se puede subir un PROYECTO .3mf de Bambu Studio (el de "Guardar
-- proyecto", no el plato ya exportado): trae su propia colocación, soportes
-- pintados y capas, así que el rebanado solo fuerza el filamento elegido y
-- respeta el resto. Enum sin CHECK (lección de la 0004): 'stl' | '3mf', se
-- valida en lib/custom_prints.ts. Plan en docs/STL_CLIENTES.md, Fase 5.
ALTER TABLE custom_prints ADD COLUMN formato TEXT NOT NULL DEFAULT 'stl';
