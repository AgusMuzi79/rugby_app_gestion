-- Migration: 20260601000000_socios_schema
-- Módulo de Socios v2: categorías, carnets TOTP, cuotas, pagos, noticias.
-- Nuevos roles: secretaria, porteria, socio.
--
-- Decisiones de diseño:
--   • socios_secrets sin políticas RLS → solo service role (Edge Functions) puede acceder.
--   • TOTP secret generado en la Edge Function de alta, guardado aquí como texto base32.
--   • Cuotas creadas lazily por Edge Function al registrar pago (sin cron job en MVP).
--   • numero_socio auto-generado via secuencia; override permitido en INSERT.
--   • jugadores.socio_id nullable: no todo jugador es socio y no todo socio es jugador.


-- ============================================================
-- 1. CONSTRAINT: agregar secretaria, porteria, socio a profiles.rol
-- ============================================================

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_rol_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_rol_check
  CHECK (rol IN ('subcomision', 'coordinador', 'entrenador', 'manager', 'admin',
                 'secretaria', 'porteria', 'socio'));


-- ============================================================
-- 2. CONSTRAINT: extender notificaciones.evento_referencia_tipo
--    Búsqueda dinámica para no depender del nombre auto-generado.
-- ============================================================

DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'notificaciones'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%evento_referencia_tipo%';

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE notificaciones DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

ALTER TABLE notificaciones ADD CONSTRAINT notificaciones_evento_referencia_tipo_check
  CHECK (evento_referencia_tipo IN (
    'lesion', 'fichaje', 'asistencia', 'pedido', 'evento_financiero',
    'cuota_pago', 'socio_nuevo'
  ));


-- ============================================================
-- 3. SECUENCIA para numero_socio
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS socios_numero_seq START WITH 1 INCREMENT BY 1;


-- ============================================================
-- 4. CATEGORIAS_SOCIO
-- Secretaría administra categorías y montos. Cambios aplican al próximo período.
-- ============================================================

CREATE TABLE categorias_socio (
  id             uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre         text          NOT NULL,
  descripcion    text,
  monto_mensual  numeric(10,2) NOT NULL CHECK (monto_mensual >= 0),
  activa         boolean       NOT NULL DEFAULT true,
  created_at     timestamptz   NOT NULL DEFAULT now(),
  updated_at     timestamptz   NOT NULL DEFAULT now()
);

CREATE TRIGGER categorias_socio_updated_at
  BEFORE UPDATE ON categorias_socio
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- 5. SOCIOS
-- Registro central del socio. profile_id vincula con auth.users + profiles.
-- estado 'pendiente': creado por Secretaría, esperando foto validada.
-- estado 'activo': foto validada, carnet operativo.
-- ============================================================

CREATE TABLE socios (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id       uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  numero_socio     text        NOT NULL UNIQUE
                               DEFAULT lpad(nextval('socios_numero_seq')::text, 4, '0'),
  dni              text        NOT NULL UNIQUE,
  fecha_nacimiento date,
  categoria_id     uuid        NOT NULL REFERENCES categorias_socio(id),
  estado           text        NOT NULL DEFAULT 'pendiente'
                               CHECK (estado IN ('pendiente', 'activo', 'moroso', 'inactivo')),
  foto_path        text,       -- path en bucket 'socios-fotos': {socio_id}/{filename}
  foto_validada    boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id)          -- un usuario puede ser socio solo una vez
);

CREATE TRIGGER socios_updated_at
  BEFORE UPDATE ON socios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- 6. SOCIOS_SECRETS
-- Secreto TOTP base32 para generación/validación de QR.
-- SIN POLÍTICAS RLS → ningún usuario autenticado puede leer/escribir directamente.
-- Solo accesible via service role (Edge Functions).
-- ============================================================

CREATE TABLE socios_secrets (
  socio_id    uuid        NOT NULL REFERENCES socios(id) ON DELETE CASCADE PRIMARY KEY,
  totp_secret text        NOT NULL,   -- base32, generado por Edge Function en alta de socio
  created_at  timestamptz NOT NULL DEFAULT now()
);


-- ============================================================
-- 7. CUOTAS
-- Una cuota por socio por período (YYYY-MM). Creada por Edge Function al pagar.
-- monto snapshot del monto de la categoría en el momento de creación.
-- ============================================================

CREATE TABLE cuotas (
  id          uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  socio_id    uuid          NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
  periodo     text          NOT NULL CHECK (periodo ~ '^\d{4}-\d{2}$'),
  monto       numeric(10,2) NOT NULL CHECK (monto >= 0),
  estado      text          NOT NULL DEFAULT 'pendiente'
                            CHECK (estado IN ('pendiente', 'pagado')),
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (socio_id, periodo)
);

CREATE TRIGGER cuotas_updated_at
  BEFORE UPDATE ON cuotas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- 8. PAGOS_SOCIOS
-- Registro de cada pago. registrado_por null = pago via Mercado Pago (automático).
-- comprobante_path: PDF generado por Edge Function en bucket 'comprobantes'.
-- mp_payment_id: ID externo para deduplicación del webhook de MP.
-- ============================================================

CREATE TABLE pagos_socios (
  id               uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  socio_id         uuid          NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
  cuota_id         uuid          NOT NULL REFERENCES cuotas(id),
  monto            numeric(10,2) NOT NULL CHECK (monto >= 0),
  forma_pago       text          NOT NULL
                                 CHECK (forma_pago IN ('mercadopago', 'efectivo', 'transferencia')),
  estado           text          NOT NULL DEFAULT 'pendiente'
                                 CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')),
  mp_payment_id    text          UNIQUE,  -- deduplicación de webhook MP
  registrado_por   uuid          REFERENCES profiles(id),
  comprobante_path text,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now()
);

CREATE TRIGGER pagos_socios_updated_at
  BEFORE UPDATE ON pagos_socios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- 9. NOTICIAS
-- Feed institucional. publicada=false = borrador no visible para socios.
-- etiquetas: filtrado por deporte/categoría en el feed.
-- ============================================================

CREATE TABLE noticias (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo      text        NOT NULL,
  cuerpo      text        NOT NULL,
  imagen_path text,       -- path en bucket 'noticias-imagenes'
  autor_id    uuid        NOT NULL REFERENCES profiles(id),
  etiquetas   text[]      NOT NULL DEFAULT '{}',
  publicada   boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER noticias_updated_at
  BEFORE UPDATE ON noticias
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- 10. JUGADORES — vínculo opcional con socios
-- ============================================================

ALTER TABLE jugadores ADD COLUMN IF NOT EXISTS socio_id uuid REFERENCES socios(id);


-- ============================================================
-- 11. HELPER FUNCTION — get_socio_id()
-- Retorna el socio_id del usuario autenticado.
-- Usado en políticas RLS para "ver solo el propio registro".
-- ============================================================

CREATE OR REPLACE FUNCTION get_socio_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id FROM socios WHERE profile_id = auth.uid()
$$;


-- ============================================================
-- 12. HABILITAR RLS
-- socios_secrets: habilitado SIN políticas → ningún rol puede acceder directamente.
-- ============================================================

ALTER TABLE categorias_socio  ENABLE ROW LEVEL SECURITY;
ALTER TABLE socios             ENABLE ROW LEVEL SECURITY;
ALTER TABLE socios_secrets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuotas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos_socios       ENABLE ROW LEVEL SECURITY;
ALTER TABLE noticias           ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 13. ÍNDICES
-- ============================================================

-- categorias_socio
CREATE INDEX ON categorias_socio (activa);

-- socios
CREATE INDEX ON socios (profile_id);      -- RLS: socio ve su propio registro
CREATE INDEX ON socios (dni);
CREATE INDEX ON socios (estado);
CREATE INDEX ON socios (categoria_id);
CREATE INDEX ON socios (numero_socio);

-- cuotas
CREATE INDEX ON cuotas (socio_id);
CREATE INDEX ON cuotas (periodo);
CREATE INDEX ON cuotas (estado);
CREATE INDEX ON cuotas (socio_id, periodo);   -- lookup único frecuente

-- pagos_socios
CREATE INDEX ON pagos_socios (socio_id);
CREATE INDEX ON pagos_socios (cuota_id);
CREATE INDEX ON pagos_socios (estado);
CREATE INDEX ON pagos_socios (mp_payment_id);
CREATE INDEX ON pagos_socios (registrado_por);

-- noticias
CREATE INDEX ON noticias (publicada);         -- WHERE publicada = true
CREATE INDEX ON noticias (autor_id);
CREATE INDEX ON noticias (created_at DESC);
CREATE INDEX ON noticias USING gin (etiquetas);  -- filtrado por etiqueta

-- jugadores
CREATE INDEX ON jugadores (socio_id);
