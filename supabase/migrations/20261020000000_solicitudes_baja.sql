-- Migration: 20261020000000_solicitudes_baja
--
-- Baja de cuenta iniciada desde la app (auditoría UX socio, T11; App Store
-- Guideline 5.1.1(v): las cuentas se crean en la app, así que la baja también
-- tiene que poder iniciarse ahí).
--
-- Decisión de negocio: darse de baja = dejar el club, así que la app NO borra
-- nada. Deja una solicitud y Secretaría la procesa a mano (y contacta a la
-- persona). Nunca borrar profiles / auth.users desde código:
-- socios.profile_id … ON DELETE CASCADE se llevaría el socio y todo lo suyo.
--
-- La clave es profile_id (no socio_id) porque también piden la baja cuentas
-- sin registro en socios: familiares / tutores (registro-tutor) y staff.
-- socio_id queda informado cuando la persona es socia, para Secretaría.
--
-- Sin ON DELETE CASCADE y sin política de DELETE: la solicitud es el registro
-- de lo que pidió la persona. Ojo al procesar: mientras exista una fila que
-- apunte al profile (o al socio), Postgres no deja borrar ese profile / socio
-- (FK NO ACTION). Si Secretaría decide borrar la cuenta, primero hay que
-- resolver estas filas (con service_role).

CREATE TABLE solicitudes_baja (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid        NOT NULL REFERENCES profiles(id),
  socio_id      uuid        REFERENCES socios(id),
  estado        text        NOT NULL DEFAULT 'pendiente'
                            CHECK (estado IN ('pendiente', 'procesada', 'rechazada')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  procesada_at  timestamptz,
  procesada_por uuid        REFERENCES profiles(id)
);

-- Una sola solicitud pendiente por persona (dos toques, dos teléfonos).
CREATE UNIQUE INDEX solicitudes_baja_una_pendiente_por_perfil
  ON solicitudes_baja (profile_id)
  WHERE estado = 'pendiente';

CREATE INDEX ON solicitudes_baja (profile_id, created_at DESC);
CREATE INDEX ON solicitudes_baja (socio_id);
CREATE INDEX ON solicitudes_baja (estado, created_at);

ALTER TABLE solicitudes_baja ENABLE ROW LEVEL SECURITY;

-- El usuario crea su propia solicitud, siempre pendiente. Si informa socio_id
-- tiene que ser su propio registro de socio (un titular no pide la baja de
-- otro socio desde acá).
CREATE POLICY "usuario_inserta_su_solicitud_baja" ON solicitudes_baja
  FOR INSERT TO authenticated
  WITH CHECK (
    profile_id = (select auth.uid())
    AND estado = 'pendiente'
    AND procesada_at IS NULL
    AND procesada_por IS NULL
    AND (
      socio_id IS NULL
      OR EXISTS (
        SELECT 1 FROM socios s
        WHERE s.id = socio_id
          AND s.profile_id = (select auth.uid())
      )
    )
  );

-- El usuario ve sus solicitudes (para mostrar "Baja solicitada el dd/mm").
CREATE POLICY "usuario_lee_sus_solicitudes_baja" ON solicitudes_baja
  FOR SELECT TO authenticated
  USING (profile_id = (select auth.uid()));

-- Secretaría / admin ven todas y las marcan procesadas o rechazadas.
CREATE POLICY "secretaria_admin_select_solicitudes_baja" ON solicitudes_baja
  FOR SELECT TO authenticated
  USING ((select get_rol()) IN ('secretaria', 'admin'));

CREATE POLICY "secretaria_admin_update_solicitudes_baja" ON solicitudes_baja
  FOR UPDATE TO authenticated
  USING ((select get_rol()) IN ('secretaria', 'admin'))
  WITH CHECK ((select get_rol()) IN ('secretaria', 'admin'));

-- Sin política de DELETE a propósito.
