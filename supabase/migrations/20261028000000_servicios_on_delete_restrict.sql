-- Migration: servicios_on_delete_restrict
-- Borrar un servicio del catálogo ya no arrastra los vínculos de los socios.
--
-- Antes: socio_servicios.servicio_id → servicios_opcionales ON DELETE CASCADE
-- (20260609000000). Borrar "Gimnasio" desde Secretaría › Servicios dejaba a
-- todos los socios sin el servicio y el lector del gimnasio los rechazaba.
-- Ahora el DELETE falla (23503) mientras algún socio lo tenga; para sacarlo de
-- circulación se desactiva (`activo = false`).
--
-- La FK se busca por columnas en pg_constraint (no por su nombre por
-- defecto): si tuviera otro nombre, un DROP por nombre no haría nada y
-- quedarían dos FKs (CASCADE + RESTRICT). Al final se verifica que no quede
-- ninguna CASCADE.
--
-- No toca datos. Idempotente.

DO $$
DECLARE
  fk record;
BEGIN
  FOR fk IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.contype = 'f'
       AND c.conrelid = 'public.socio_servicios'::regclass
       AND c.confrelid = 'public.servicios_opcionales'::regclass
       AND a.attname = 'servicio_id'
  LOOP
    EXECUTE format('ALTER TABLE socio_servicios DROP CONSTRAINT %I', fk.conname);
  END LOOP;
END $$;

ALTER TABLE socio_servicios
  ADD CONSTRAINT socio_servicios_servicio_id_fkey
  FOREIGN KEY (servicio_id) REFERENCES servicios_opcionales(id) ON DELETE RESTRICT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE contype = 'f'
       AND conrelid = 'public.socio_servicios'::regclass
       AND confrelid = 'public.servicios_opcionales'::regclass
       AND confdeltype = 'c'
  ) THEN
    RAISE EXCEPTION 'socio_servicios todavía tiene una FK ON DELETE CASCADE hacia servicios_opcionales';
  END IF;
END $$;

-- Escenario de verificación (correr a mano en local, dentro de una transacción):
--   begin;
--   insert into servicios_opcionales (nombre) values ('__prueba') returning id;  -- :sid
--   insert into socio_servicios (socio_id, servicio_id)
--     select id, :sid from socios limit 1;
--   delete from servicios_opcionales where id = :sid;  -- ERROR 23503 (antes: borraba el vínculo)
--   rollback;
