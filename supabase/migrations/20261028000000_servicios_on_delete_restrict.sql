-- Migration: servicios_on_delete_restrict
-- Borrar un servicio del catálogo ya no arrastra los vínculos de los socios.
--
-- Antes: socio_servicios.servicio_id → servicios_opcionales ON DELETE CASCADE
-- (20260609000000). Borrar "Gimnasio" desde Secretaría › Servicios dejaba a
-- todos los socios sin el servicio y el lector del gimnasio los rechazaba.
-- Ahora el DELETE falla (23503) mientras algún socio lo tenga; para sacarlo de
-- circulación se desactiva (`activo = false`).
--
-- No toca datos. Idempotente.

ALTER TABLE socio_servicios
  DROP CONSTRAINT IF EXISTS socio_servicios_servicio_id_fkey;

ALTER TABLE socio_servicios
  ADD CONSTRAINT socio_servicios_servicio_id_fkey
  FOREIGN KEY (servicio_id) REFERENCES servicios_opcionales(id) ON DELETE RESTRICT;

-- Escenario de verificación (correr a mano en local, dentro de una transacción):
--   begin;
--   insert into servicios_opcionales (nombre) values ('__prueba') returning id;  -- :sid
--   insert into socio_servicios (socio_id, servicio_id)
--     select id, :sid from socios limit 1;
--   delete from servicios_opcionales where id = :sid;  -- ERROR 23503 (antes: borraba el vínculo)
--   rollback;
