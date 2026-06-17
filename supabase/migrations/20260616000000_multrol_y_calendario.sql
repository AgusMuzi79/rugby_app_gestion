-- Migration: 20260616000000_multrol_y_calendario
-- Socio como base del sistema: multi-rol, link jugadores→socios, deporte en divisiones.

-- ============================================================
-- 1. profiles.roles[] — array de roles disponibles por persona
--    profiles.rol sigue siendo el "rol activo" (cambia al switchear)
-- ============================================================

DO $$
BEGIN
  -- Agregar columna si no existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'roles'
  ) THEN
    ALTER TABLE profiles ADD COLUMN roles TEXT[];
  END IF;
END $$;

-- Poblar nulls con el rol actual
UPDATE profiles SET roles = ARRAY[rol] WHERE roles IS NULL;

-- NOT NULL y default
ALTER TABLE profiles ALTER COLUMN roles SET NOT NULL;
ALTER TABLE profiles ALTER COLUMN roles SET DEFAULT '{}';

-- Constraint idempotente
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_roles_check' AND conrelid = 'profiles'::regclass
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_roles_check
      CHECK (roles <@ ARRAY['subcomision','coordinador','entrenador','manager',
                             'admin','secretaria','porteria','socio']::text[]);
  END IF;
END $$;


-- ============================================================
-- 2. jugadores.socio_id — link al registro de socio (nullable)
--    Se setea al fichar si el DNI coincide con un socio existente.
-- ============================================================

ALTER TABLE jugadores ADD COLUMN IF NOT EXISTS socio_id UUID REFERENCES socios(id) ON DELETE SET NULL;


-- ============================================================
-- 3. divisiones.deporte — para filtro en calendario del socio
-- ============================================================

ALTER TABLE divisiones
  ADD COLUMN IF NOT EXISTS deporte TEXT NOT NULL DEFAULT 'rugby'
  CHECK (deporte IN ('rugby', 'hockey', 'tenis'));
