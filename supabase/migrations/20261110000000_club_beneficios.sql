-- Migration: 20261110000000_club_beneficios
--
-- Club de beneficios (2026-11-04): partner shops / places with a discount or
-- promotion that members browse in the app and redeem by showing their carnet
-- (the shop checks the carnet traffic light). Feature doc:
-- odd/tasks/club-beneficios.md.
--
-- 1. Table beneficios.
--    rubro is a fixed list, kept in sync with RUBROS in app/lib/beneficios.ts:
--      gastronomia, deportes, salud, belleza, indumentaria, educacion,
--      servicios, otros
--    descuento is a short label shown big on the card ('20% OFF', '2x1').
--    vigente_desde / vigente_hasta are inclusive; null = open bound.
--
-- 2. RLS (active role, (select get_rol()), like every other policy):
--    - socio and tutor read only active rows within their validity window,
--      using the Argentina calendar date.
--    - admin reads everything and is the only one who writes. Who loads the
--      benefits (and from where) is decided later; until then it is done by
--      admin from the Supabase dashboard / SQL.
--
-- 3. Storage bucket 'beneficios' (logos and photos), public read like
--    'noticias-imagenes'; insert/update/delete only admin.
--    Path convention: {beneficio_id}/{filename}.
--
-- Idempotent.


-- ============================================================
-- TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS beneficios (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre            text        NOT NULL CHECK (btrim(nombre) <> ''),
  rubro             text        NOT NULL,
  descuento         text        NOT NULL CHECK (btrim(descuento) <> ''),
  descripcion       text,
  condiciones       text,       -- days, payment methods, other conditions
  direccion         text,
  zona              text,
  telefono_whatsapp text,
  instagram         text,       -- handle or URL
  sitio_web         text,
  logo_url          text,
  imagen_url        text,
  destacado         boolean     NOT NULL DEFAULT false,
  orden             int         NOT NULL DEFAULT 0,
  activo            boolean     NOT NULL DEFAULT true,
  vigente_desde     date,
  vigente_hasta     date,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT beneficios_rubro_check CHECK (rubro IN (
    'gastronomia', 'deportes', 'salud', 'belleza',
    'indumentaria', 'educacion', 'servicios', 'otros'
  )),
  CONSTRAINT beneficios_vigencia_check CHECK (
    vigente_desde IS NULL OR vigente_hasta IS NULL OR vigente_desde <= vigente_hasta
  )
);

CREATE INDEX IF NOT EXISTS beneficios_activo_orden_idx ON beneficios (activo, orden);

DROP TRIGGER IF EXISTS beneficios_updated_at ON beneficios;
CREATE TRIGGER beneficios_updated_at
  BEFORE UPDATE ON beneficios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE beneficios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "beneficios_select_socio" ON beneficios;
CREATE POLICY "beneficios_select_socio" ON beneficios
  FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) IN ('socio', 'tutor')
    AND activo
    AND (vigente_desde IS NULL
         OR vigente_desde <= (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)
    AND (vigente_hasta IS NULL
         OR vigente_hasta >= (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)
  );

DROP POLICY IF EXISTS "beneficios_select_admin" ON beneficios;
CREATE POLICY "beneficios_select_admin" ON beneficios
  FOR SELECT TO authenticated
  USING ((SELECT get_rol()) = 'admin');

DROP POLICY IF EXISTS "beneficios_insert_admin" ON beneficios;
CREATE POLICY "beneficios_insert_admin" ON beneficios
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT get_rol()) = 'admin');

DROP POLICY IF EXISTS "beneficios_update_admin" ON beneficios;
CREATE POLICY "beneficios_update_admin" ON beneficios
  FOR UPDATE TO authenticated
  USING ((SELECT get_rol()) = 'admin')
  WITH CHECK ((SELECT get_rol()) = 'admin');

DROP POLICY IF EXISTS "beneficios_delete_admin" ON beneficios;
CREATE POLICY "beneficios_delete_admin" ON beneficios
  FOR DELETE TO authenticated
  USING ((SELECT get_rol()) = 'admin');


-- ============================================================
-- STORAGE — bucket 'beneficios'
-- Public bucket: reads need no policy (public = true).
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'beneficios',
  'beneficios',
  true,
  5242880,   -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "beneficios_storage_insert_admin" ON storage.objects;
CREATE POLICY "beneficios_storage_insert_admin"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'beneficios'
    AND (SELECT get_rol()) = 'admin'
  );

DROP POLICY IF EXISTS "beneficios_storage_update_admin" ON storage.objects;
CREATE POLICY "beneficios_storage_update_admin"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'beneficios'
    AND (SELECT get_rol()) = 'admin'
  )
  WITH CHECK (
    bucket_id = 'beneficios'
    AND (SELECT get_rol()) = 'admin'
  );

DROP POLICY IF EXISTS "beneficios_storage_delete_admin" ON storage.objects;
CREATE POLICY "beneficios_storage_delete_admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'beneficios'
    AND (SELECT get_rol()) = 'admin'
  );
