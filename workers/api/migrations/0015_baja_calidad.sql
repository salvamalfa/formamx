-- Migration number: 0015 	 baja del módulo de control de calidad
-- El módulo Calidad se dio de baja (decisión del dueño, 2026-07): la tabla
-- de registros ya no tiene lector ni escritor (rutas y lib borrados del
-- worker). El boceto queda documentado como registro en
-- docs/ROADMAP_ARQUITECTURA.md §7. piezas.qc_status (veredicto manual
-- denormalizado en inventario) NO se toca: es independiente de esta tabla.

DROP TABLE qc_registros;
