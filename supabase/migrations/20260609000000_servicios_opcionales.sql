-- Migration: servicios_opcionales
-- Catálogo de servicios opcionales del club (gimnasio, rugby, hockey, tenis…)
-- y tabla de asignación por socio.

-- ─── Tablas ───────────────────────────────────────────────────────────────────

CREATE TABLE servicios_opcionales (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre        text NOT NULL,
  descripcion   text,
  monto_mensual numeric(10,2) NOT NULL DEFAULT 0,
  activo        boolean NOT NULL DEFAULT true,
  created_at    timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE socio_servicios (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  socio_id    uuid NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
  servicio_id uuid NOT NULL REFERENCES servicios_opcionales(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now() NOT NULL,
  UNIQUE (socio_id, servicio_id)
);

-- ─── Índices ──────────────────────────────────────────────────────────────────

CREATE INDEX ON socio_servicios (socio_id);
CREATE INDEX ON socio_servicios (servicio_id);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE servicios_opcionales ENABLE ROW LEVEL SECURITY;
ALTER TABLE socio_servicios      ENABLE ROW LEVEL SECURITY;

-- Catálogo: cualquier autenticado puede leer
CREATE POLICY "todos_leen_servicios_opcionales" ON servicios_opcionales
  FOR SELECT TO authenticated USING (true);

-- Catálogo: solo secretaria/admin/subcomision pueden modificar
CREATE POLICY "secretaria_modifica_servicios_opcionales" ON servicios_opcionales
  FOR ALL TO authenticated
  USING     ((SELECT get_rol()) IN ('secretaria', 'admin', 'subcomision'))
  WITH CHECK((SELECT get_rol()) IN ('secretaria', 'admin', 'subcomision'));

-- Asignación: secretaria/admin/subcomision gestionan qué servicios tiene cada socio
CREATE POLICY "secretaria_gestiona_socio_servicios" ON socio_servicios
  FOR ALL TO authenticated
  USING     ((SELECT get_rol()) IN ('secretaria', 'admin', 'subcomision'))
  WITH CHECK((SELECT get_rol()) IN ('secretaria', 'admin', 'subcomision'));

-- Socio puede leer sus propios servicios
CREATE POLICY "socio_lee_propios_servicios" ON socio_servicios
  FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) = 'socio'
    AND socio_id = (SELECT get_socio_id())
  );

-- ─── Seed ─────────────────────────────────────────────────────────────────────

INSERT INTO servicios_opcionales (nombre, descripcion, monto_mensual) VALUES
  ('Gimnasio', 'Acceso al gimnasio del club',  2000.00),
  ('Rugby',    'Práctica de rugby',            1500.00),
  ('Hockey',   'Práctica de hockey',           1500.00),
  ('Tenis',    'Práctica de tenis',            1200.00);
