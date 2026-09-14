-- Migration: 20260914000000_subcomision_deporte
--
-- Pedido de Agus: que una subcomisión de una disciplina (rugby/hockey/tenis)
-- vea sólo los datos de esa disciplina, no del club entero — se detectó
-- viendo "Informes" con datos de tenis mezclados estando logueado como subco.
--
-- Mecanismo elegido: profiles.deporte (nullable). NULL = subco general, ve
-- todo el club (comportamiento actual, sin cambios). 'rugby'/'hockey'/'tenis'
-- = sólo ve lo de esa disciplina. admin nunca se filtra, pase lo que pase acá.
--
-- Alcance: todo lo que cuelga de divisiones/jugadores donde subcomisión hoy
-- tiene bypass total (get_rol()='subcomision' sin filtro): divisiones,
-- jugadores, fichajes, documentos_fichaje, eventos, asistencias,
-- mesas_de_partido, mesa_jugadores, resultados, lesiones,
-- eventos_financieros, cobranzas. Fuera de alcance a propósito: profiles
-- (gestión de usuarios), pedidos/items_pedido, notificaciones, socios,
-- accesos, noticias — no son "datos de disciplina" en el sentido del pedido.
-- protocolos tampoco — es un catálogo global de PDFs sin FK a divisiones.
--
-- Quién asigna profiles.deporte: sólo admin (ver fix al trigger
-- guard_profile_role_update más abajo) — evita que una subco ya acotada a
-- una disciplina se autoexpanda (o expanda a otra subco) editando el campo
-- desde el mismo panel de Usuarios al que ya tiene acceso.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS deporte TEXT
  CHECK (deporte IN ('rugby', 'hockey', 'tenis'));

-- ─── Helpers ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_deporte_subcomision()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT deporte FROM profiles WHERE id = auth.uid()
$$;

-- true si la subco actual puede ver/tocar algo de esa disciplina: sin
-- deporte asignado (subco general) siempre true; si tiene uno, sólo coincide
-- con el suyo. No es exclusivo de subcomision — para cualquier otro rol
-- get_deporte_subcomision() da NULL, así que siempre da true (sin efecto).
CREATE OR REPLACE FUNCTION tiene_acceso_deporte(p_deporte TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT get_deporte_subcomision() IS NULL OR get_deporte_subcomision() = p_deporte
$$;

-- ─── Guard anti-escalada: sólo admin asigna/cambia deporte ─────────────────

CREATE OR REPLACE FUNCTION guard_profile_role_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_rol TEXT;
BEGIN
  -- service_role (Edge Functions) — sin JWT de usuario, exento del guard
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_caller_rol := get_rol();

  -- admin: CRUD total, sin restricciones
  IF v_caller_rol = 'admin' THEN
    RETURN NEW;
  END IF;

  -- subcomisión: CRUD total salvo su propia columna `deporte` (y la de
  -- cualquier otro perfil) — sólo admin decide qué disciplina ve cada subco,
  -- para que una subco acotada no pueda ampliarse (o ampliar a otra) desde
  -- el mismo panel de Usuarios al que ya tiene acceso de por sí.
  IF v_caller_rol = 'subcomision' THEN
    IF NEW.deporte IS DISTINCT FROM OLD.deporte THEN
      RAISE EXCEPTION 'No autorizado para modificar deporte';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.roles IS DISTINCT FROM OLD.roles THEN
    RAISE EXCEPTION 'No autorizado para modificar roles';
  END IF;

  IF NEW.divisiones IS DISTINCT FROM OLD.divisiones THEN
    RAISE EXCEPTION 'No autorizado para modificar divisiones';
  END IF;

  IF NEW.activo IS DISTINCT FROM OLD.activo THEN
    RAISE EXCEPTION 'No autorizado para modificar activo';
  END IF;

  IF NEW.deporte IS DISTINCT FROM OLD.deporte THEN
    RAISE EXCEPTION 'No autorizado para modificar deporte';
  END IF;

  IF NEW.rol IS DISTINCT FROM OLD.rol AND NOT (NEW.rol = ANY (OLD.roles)) THEN
    RAISE EXCEPTION 'No autorizado para cambiar a ese rol';
  END IF;

  RETURN NEW;
END;
$$;

-- ─── divisiones ─────────────────────────────────────────────────────────────
-- divisiones_select es USING(true) para TODOS los roles (coordinador, socio,
-- etc. la necesitan sin filtro) — sólo se restringe el caso subcomision.

DROP POLICY IF EXISTS "divisiones_select" ON divisiones;
CREATE POLICY "divisiones_select"
  ON divisiones FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) <> 'subcomision'
    OR (SELECT tiene_acceso_deporte(deporte))
  );

DROP POLICY IF EXISTS "divisiones_insert" ON divisiones;
CREATE POLICY "divisiones_insert"
  ON divisiones FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT get_rol()) = 'subcomision'
    AND (SELECT tiene_acceso_deporte(deporte))
  );

DROP POLICY IF EXISTS "divisiones_update" ON divisiones;
CREATE POLICY "divisiones_update"
  ON divisiones FOR UPDATE TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND (SELECT tiene_acceso_deporte(deporte))
  );

DROP POLICY IF EXISTS "divisiones_delete" ON divisiones;
CREATE POLICY "divisiones_delete"
  ON divisiones FOR DELETE TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND (SELECT tiene_acceso_deporte(deporte))
  );

-- ─── jugadores (division_id directo) ────────────────────────────────────────

DROP POLICY IF EXISTS "jugadores_select_subcomision" ON jugadores;
CREATE POLICY "jugadores_select_subcomision"
  ON jugadores FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND (SELECT tiene_acceso_deporte((SELECT deporte FROM divisiones WHERE id = jugadores.division_id)))
  );

DROP POLICY IF EXISTS "jugadores_update_subcomision" ON jugadores;
CREATE POLICY "jugadores_update_subcomision"
  ON jugadores FOR UPDATE TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND (SELECT tiene_acceso_deporte((SELECT deporte FROM divisiones WHERE id = jugadores.division_id)))
  );

DROP POLICY IF EXISTS "jugadores_delete_subcomision" ON jugadores;
CREATE POLICY "jugadores_delete_subcomision"
  ON jugadores FOR DELETE TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND (SELECT tiene_acceso_deporte((SELECT deporte FROM divisiones WHERE id = jugadores.division_id)))
  );

-- ─── fichajes (vía jugadores.division_id) ───────────────────────────────────

DROP POLICY IF EXISTS "fichajes_select_subcomision" ON fichajes;
CREATE POLICY "fichajes_select_subcomision"
  ON fichajes FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND (SELECT tiene_acceso_deporte((
      SELECT d.deporte FROM jugadores j JOIN divisiones d ON d.id = j.division_id
      WHERE j.id = fichajes.jugador_id
    )))
  );

DROP POLICY IF EXISTS "fichajes_delete_subcomision" ON fichajes;
CREATE POLICY "fichajes_delete_subcomision"
  ON fichajes FOR DELETE TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND (SELECT tiene_acceso_deporte((
      SELECT d.deporte FROM jugadores j JOIN divisiones d ON d.id = j.division_id
      WHERE j.id = fichajes.jugador_id
    )))
  );

-- ─── documentos_fichaje (vía fichajes → jugadores.division_id) ──────────────

DROP POLICY IF EXISTS "documentos_fichaje_select_subcomision" ON documentos_fichaje;
CREATE POLICY "documentos_fichaje_select_subcomision"
  ON documentos_fichaje FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND (SELECT tiene_acceso_deporte((
      SELECT d.deporte FROM fichajes f
      JOIN jugadores j ON j.id = f.jugador_id
      JOIN divisiones d ON d.id = j.division_id
      WHERE f.id = documentos_fichaje.fichaje_id
    )))
  );

DROP POLICY IF EXISTS "documentos_fichaje_delete_subcomision" ON documentos_fichaje;
CREATE POLICY "documentos_fichaje_delete_subcomision"
  ON documentos_fichaje FOR DELETE TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND (SELECT tiene_acceso_deporte((
      SELECT d.deporte FROM fichajes f
      JOIN jugadores j ON j.id = f.jugador_id
      JOIN divisiones d ON d.id = j.division_id
      WHERE f.id = documentos_fichaje.fichaje_id
    )))
  );

-- ─── eventos (division_id directo) ──────────────────────────────────────────

DROP POLICY IF EXISTS "eventos_select_subcomision" ON eventos;
CREATE POLICY "eventos_select_subcomision"
  ON eventos FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND (SELECT tiene_acceso_deporte((SELECT deporte FROM divisiones WHERE id = eventos.division_id)))
  );

-- Antes combinaba coordinador+subcomision bajo la misma condición
-- tiene_acceso_division(division_id) — de rebote, tras el fix de RLS del
-- 2026-09-11 (divisiones IS NULL pasó de "todo" a "nada"), una subco sin
-- divisiones[] cargadas (el caso normal, ese array nunca se usó para este
-- rol) directamente no podía crear/editar eventos. Separado acá: coordinador
-- sigue por tiene_acceso_division, subcomision pasa a tiene_acceso_deporte.
DROP POLICY IF EXISTS "eventos_insert_coordinador_subcomision" ON eventos;
CREATE POLICY "eventos_insert_coordinador_subcomision"
  ON eventos FOR INSERT TO authenticated
  WITH CHECK (
    ((SELECT get_rol()) = 'coordinador' AND (SELECT tiene_acceso_division(division_id)))
    OR (
      (SELECT get_rol()) = 'subcomision'
      AND (SELECT tiene_acceso_deporte((SELECT deporte FROM divisiones WHERE id = division_id)))
    )
  );

DROP POLICY IF EXISTS "eventos_update_coordinador_subcomision" ON eventos;
CREATE POLICY "eventos_update_coordinador_subcomision"
  ON eventos FOR UPDATE TO authenticated
  USING (
    ((SELECT get_rol()) = 'coordinador' AND (SELECT tiene_acceso_division(division_id)))
    OR (
      (SELECT get_rol()) = 'subcomision'
      AND (SELECT tiene_acceso_deporte((SELECT deporte FROM divisiones WHERE id = division_id)))
    )
  );

DROP POLICY IF EXISTS "eventos_delete_subcomision" ON eventos;
CREATE POLICY "eventos_delete_subcomision"
  ON eventos FOR DELETE TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND (SELECT tiene_acceso_deporte((SELECT deporte FROM divisiones WHERE id = eventos.division_id)))
  );

-- ─── asistencias (division_id desnormalizado directo) ───────────────────────

DROP POLICY IF EXISTS "asistencias_select_subcomision" ON asistencias;
CREATE POLICY "asistencias_select_subcomision"
  ON asistencias FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND (SELECT tiene_acceso_deporte((SELECT deporte FROM divisiones WHERE id = asistencias.division_id)))
  );

DROP POLICY IF EXISTS "asistencias_delete_subcomision" ON asistencias;
CREATE POLICY "asistencias_delete_subcomision"
  ON asistencias FOR DELETE TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND (SELECT tiene_acceso_deporte((SELECT deporte FROM divisiones WHERE id = asistencias.division_id)))
  );

-- ─── mesas_de_partido (vía eventos.division_id) ─────────────────────────────

DROP POLICY IF EXISTS "mesas_de_partido_select_subcomision" ON mesas_de_partido;
CREATE POLICY "mesas_de_partido_select_subcomision"
  ON mesas_de_partido FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND (SELECT tiene_acceso_deporte((
      SELECT d.deporte FROM eventos e JOIN divisiones d ON d.id = e.division_id
      WHERE e.id = mesas_de_partido.evento_id
    )))
  );

DROP POLICY IF EXISTS "mesas_de_partido_delete_subcomision" ON mesas_de_partido;
CREATE POLICY "mesas_de_partido_delete_subcomision"
  ON mesas_de_partido FOR DELETE TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND (SELECT tiene_acceso_deporte((
      SELECT d.deporte FROM eventos e JOIN divisiones d ON d.id = e.division_id
      WHERE e.id = mesas_de_partido.evento_id
    )))
  );

-- ─── mesa_jugadores (vía mesas_de_partido → eventos.division_id) ────────────

DROP POLICY IF EXISTS "mesa_jugadores_select_subcomision" ON mesa_jugadores;
CREATE POLICY "mesa_jugadores_select_subcomision"
  ON mesa_jugadores FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND (SELECT tiene_acceso_deporte((
      SELECT d.deporte FROM mesas_de_partido m
      JOIN eventos e ON e.id = m.evento_id
      JOIN divisiones d ON d.id = e.division_id
      WHERE m.id = mesa_jugadores.mesa_id
    )))
  );

DROP POLICY IF EXISTS "mesa_jugadores_delete_subcomision" ON mesa_jugadores;
CREATE POLICY "mesa_jugadores_delete_subcomision"
  ON mesa_jugadores FOR DELETE TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND (SELECT tiene_acceso_deporte((
      SELECT d.deporte FROM mesas_de_partido m
      JOIN eventos e ON e.id = m.evento_id
      JOIN divisiones d ON d.id = e.division_id
      WHERE m.id = mesa_jugadores.mesa_id
    )))
  );

-- ─── resultados (vía eventos.division_id) ───────────────────────────────────

DROP POLICY IF EXISTS "resultados_select_subcomision" ON resultados;
CREATE POLICY "resultados_select_subcomision"
  ON resultados FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND (SELECT tiene_acceso_deporte((
      SELECT d.deporte FROM eventos e JOIN divisiones d ON d.id = e.division_id
      WHERE e.id = resultados.evento_id
    )))
  );

DROP POLICY IF EXISTS "resultados_update_subcomision" ON resultados;
CREATE POLICY "resultados_update_subcomision"
  ON resultados FOR UPDATE TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND (SELECT tiene_acceso_deporte((
      SELECT d.deporte FROM eventos e JOIN divisiones d ON d.id = e.division_id
      WHERE e.id = resultados.evento_id
    )))
  );

DROP POLICY IF EXISTS "resultados_delete_subcomision" ON resultados;
CREATE POLICY "resultados_delete_subcomision"
  ON resultados FOR DELETE TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND (SELECT tiene_acceso_deporte((
      SELECT d.deporte FROM eventos e JOIN divisiones d ON d.id = e.division_id
      WHERE e.id = resultados.evento_id
    )))
  );

-- ─── lesiones (division_id desnormalizado directo) ──────────────────────────

DROP POLICY IF EXISTS "lesiones_select_subcomision" ON lesiones;
CREATE POLICY "lesiones_select_subcomision"
  ON lesiones FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND (SELECT tiene_acceso_deporte((SELECT deporte FROM divisiones WHERE id = lesiones.division_id)))
  );

DROP POLICY IF EXISTS "lesiones_update_subcomision" ON lesiones;
CREATE POLICY "lesiones_update_subcomision"
  ON lesiones FOR UPDATE TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND (SELECT tiene_acceso_deporte((SELECT deporte FROM divisiones WHERE id = lesiones.division_id)))
  );

DROP POLICY IF EXISTS "lesiones_delete_subcomision" ON lesiones;
CREATE POLICY "lesiones_delete_subcomision"
  ON lesiones FOR DELETE TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND (SELECT tiene_acceso_deporte((SELECT deporte FROM divisiones WHERE id = lesiones.division_id)))
  );

-- ─── eventos_financieros (division_id nullable — null = recaudación global,
-- visible a cualquier subco sin importar su disciplina) ─────────────────────

DROP POLICY IF EXISTS "eventos_financieros_select_subcomision" ON eventos_financieros;
CREATE POLICY "eventos_financieros_select_subcomision"
  ON eventos_financieros FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND (
      eventos_financieros.division_id IS NULL
      OR (SELECT tiene_acceso_deporte((SELECT deporte FROM divisiones WHERE id = eventos_financieros.division_id)))
    )
  );

DROP POLICY IF EXISTS "eventos_financieros_insert_subcomision" ON eventos_financieros;
CREATE POLICY "eventos_financieros_insert_subcomision"
  ON eventos_financieros FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT get_rol()) = 'subcomision'
    AND (
      eventos_financieros.division_id IS NULL
      OR (SELECT tiene_acceso_deporte((SELECT deporte FROM divisiones WHERE id = eventos_financieros.division_id)))
    )
  );

DROP POLICY IF EXISTS "eventos_financieros_update_subcomision" ON eventos_financieros;
CREATE POLICY "eventos_financieros_update_subcomision"
  ON eventos_financieros FOR UPDATE TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND (
      eventos_financieros.division_id IS NULL
      OR (SELECT tiene_acceso_deporte((SELECT deporte FROM divisiones WHERE id = eventos_financieros.division_id)))
    )
  );

DROP POLICY IF EXISTS "eventos_financieros_delete_subcomision" ON eventos_financieros;
CREATE POLICY "eventos_financieros_delete_subcomision"
  ON eventos_financieros FOR DELETE TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND (
      eventos_financieros.division_id IS NULL
      OR (SELECT tiene_acceso_deporte((SELECT deporte FROM divisiones WHERE id = eventos_financieros.division_id)))
    )
  );

-- ─── cobranzas (vía jugadores.division_id) ──────────────────────────────────

DROP POLICY IF EXISTS "cobranzas_select_subcomision" ON cobranzas;
CREATE POLICY "cobranzas_select_subcomision"
  ON cobranzas FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND (SELECT tiene_acceso_deporte((
      SELECT d.deporte FROM jugadores j JOIN divisiones d ON d.id = j.division_id
      WHERE j.id = cobranzas.jugador_id
    )))
  );

DROP POLICY IF EXISTS "cobranzas_delete_subcomision" ON cobranzas;
CREATE POLICY "cobranzas_delete_subcomision"
  ON cobranzas FOR DELETE TO authenticated
  USING (
    (SELECT get_rol()) = 'subcomision'
    AND (SELECT tiene_acceso_deporte((
      SELECT d.deporte FROM jugadores j JOIN divisiones d ON d.id = j.division_id
      WHERE j.id = cobranzas.jugador_id
    )))
  );

-- ─── Backfill ────────────────────────────────────────────────────────────────
-- Sin esto, todas las subco existentes quedarían con deporte=NULL (columna
-- nueva sin DEFAULT) = generales, viendo todo el club. Pedido de Agus
-- (2026-09-14): las cuentas de subcomisión actuales son todas de rugby.
-- Alcanza a cualquiera con 'subcomision' en roles[], no sólo a quien la
-- tiene como rol activo hoy — si después switchea a esa vista, ya arranca
-- acotada a rugby en vez de general.

UPDATE profiles
SET deporte = 'rugby'
WHERE 'subcomision' = ANY (roles);
