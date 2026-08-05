-- Migration: fix_gimnasio_catalogo_drift
-- Corrige un cambio de schema aplicado fuera de migraciones (directo en producción, confirmado
-- por Agus) mientras se armaba openspec/changes/actualizar-servicios-socios: la fila original
-- "Gimnasio" (seed de 20260609000000_servicios_opcionales, con 115 vínculos ya existentes)
-- había sido renombrada a "Gimnasio Mayor", y se habían creado "Gimnasio Menor" y
-- "Alicuota Deporte Inclusivo" sin vínculos y sin uso en ningún lado del código.
--
-- Esta migración vuelve a dejar el catálogo alineado con la decisión final del club (una sola
-- fila por servicio, sin variantes — ver design.md §2 de la change): el rename se deshace
-- (mismo id, preserva los 115 vínculos existentes) y las dos filas sin uso se desactivan
-- (no se borran, por si algo llegó a referenciarlas).

UPDATE servicios_opcionales SET nombre = 'Gimnasio' WHERE nombre = 'Gimnasio Mayor';

UPDATE servicios_opcionales SET activo = false
 WHERE nombre IN ('Gimnasio Menor', 'Alicuota Deporte Inclusivo');
