-- Migration number: 0006 	 material por ranura + sello de sincronización del AMS
-- El material (PLA/PETG) decide qué archivo rebanado se imprime; el agente lo
-- sincroniza desde la impresora y también puede editarse a mano en /taller.

ALTER TABLE spool_slots ADD COLUMN material TEXT;
ALTER TABLE printer_flags ADD COLUMN ams_synced_at TEXT;
