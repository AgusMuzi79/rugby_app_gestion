-- ─────────────────────────────────────────────────────────────────────────────
-- Eventos financieros con varias divisiones
-- ─────────────────────────────────────────────────────────────────────────────
-- Viajes, tercer tiempos y recaudaciones pueden abarcar varias divisiones.
-- Depende de 20261015000000_eventos_financieros_manager.sql (trigger
-- guard_eventos_financieros_update y policies del Manager): aplicar juntas.
--
--   - eventos_financieros_divisiones = fuente de verdad de las divisiones de
--     un evento. Sin filas + division_id NULL = evento global (todo el club).
--   - eventos_financieros.division_id se mantiene por compatibilidad con la
--     app publicada: primera división elegida (NULL si es global). Un trigger
--     copia division_id a la tabla nueva en cada INSERT, así los inserts
--     directos de la app vieja quedan consistentes.
--   - Alta atómica vía RPC crear_evento_financiero (SECURITY INVOKER: aplica
--     RLS; si alguna división no está permitida se revierte todo).
--   - Manager: crea viaje / tercer tiempo con >= 1 división, todas de su
--     disciplina (deportes_del_usuario). Cierra (sólo activo -> cerrado, ver
--     trigger) los que creó o que incluyen alguna división suya. No cambia
--     las divisiones del evento (sin UPDATE/DELETE sobre la tabla nueva).
--   - Subcomisión: recaudación global o de divisiones elegidas (filtro de
--     disciplina con tiene_acceso_deporte).
--   - Coordinador / entrenador / manager ven eventos globales, los que
--     incluyen alguna división suya y los que crearon.
--   - Cobranzas del Manager: además de las condiciones previas, el jugador
--     tiene que ser de una división del evento (o el evento ser global).
--
-- Borrado de divisiones de un evento: sólo admin, o en cascada al borrar el
-- evento (Subcomisión mantiene su DELETE sobre eventos_financieros).

-- ─── Tabla ───────────────────────────────────────────────────────────────────
-- PK sustituta (id) + UNIQUE en el par, a propósito: si las dos FKs formaran la
-- PK, PostgREST detectaría una relación muchos-a-muchos eventos_financieros <->
-- divisiones y el embed `divisiones(nombre)` que ya usa la app publicada sobre
-- eventos_financieros pasaría a ser ambiguo (error PGRST201).

CREATE TABLE IF NOT EXISTS eventos_financieros_divisiones (
  id                   uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  evento_financiero_id uuid NOT NULL REFERENCES eventos_financieros(id) ON DELETE CASCADE,
  division_id          uuid NOT NULL REFERENCES divisiones(id),
  UNIQUE (evento_financiero_id, division_id)
);

CREATE INDEX IF NOT EXISTS eventos_financieros_divisiones_division_id_idx
  ON eventos_financieros_divisiones (division_id);

ALTER TABLE eventos_financieros_divisiones ENABLE ROW LEVEL SECURITY;

-- ─── Backfill ────────────────────────────────────────────────────────────────

INSERT INTO eventos_financieros_divisiones (evento_financiero_id, division_id)
SELECT id, division_id
FROM eventos_financieros
WHERE division_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ─── Sincronización division_id -> tabla nueva (INSERT) ──────────────────────
-- SECURITY DEFINER: la fila del evento ya pasó la policy de INSERT de
-- eventos_financieros, que valida division_id con las mismas reglas.

CREATE OR REPLACE FUNCTION sync_evento_financiero_division()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.division_id IS NOT NULL THEN
    INSERT INTO eventos_financieros_divisiones (evento_financiero_id, division_id)
    VALUES (NEW.id, NEW.division_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_eventos_financieros_division ON eventos_financieros;
CREATE TRIGGER sync_eventos_financieros_division
  AFTER INSERT ON eventos_financieros
  FOR EACH ROW EXECUTE FUNCTION sync_evento_financiero_division();

-- ─── Helpers (SECURITY DEFINER: leen la tabla nueva sin pasar por su RLS, que a
-- su vez consulta eventos_financieros — evita recursión entre policies) ──────

-- Disciplinas (divisiones.deporte) de las divisiones asignadas al usuario.
CREATE OR REPLACE FUNCTION deportes_del_usuario()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT d.deporte ORDER BY d.deporte), '{}')
  FROM profiles p
  JOIN divisiones d ON d.id = ANY (p.divisiones)
  WHERE p.id = auth.uid()
$$;

-- true si el evento no tiene divisiones (global: todo el club).
CREATE OR REPLACE FUNCTION evento_financiero_es_global(p_evento_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM eventos_financieros ef
    WHERE ef.id = p_evento_id
      AND ef.division_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM eventos_financieros_divisiones efd
        WHERE efd.evento_financiero_id = ef.id
      )
  )
$$;

-- true si alguna división del evento está asignada al usuario.
CREATE OR REPLACE FUNCTION evento_financiero_toca_mis_divisiones(p_evento_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM eventos_financieros_divisiones efd
    JOIN profiles p ON p.id = auth.uid()
    WHERE efd.evento_financiero_id = p_evento_id
      AND efd.division_id = ANY (p.divisiones)
  )
$$;

-- true si el jugador pertenece a una división del evento, o el evento es global.
CREATE OR REPLACE FUNCTION jugador_en_evento_financiero(p_evento_id uuid, p_jugador_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT evento_financiero_es_global(p_evento_id)
      OR EXISTS (
        SELECT 1
        FROM eventos_financieros_divisiones efd
        JOIN jugadores j ON j.division_id = efd.division_id
        WHERE efd.evento_financiero_id = p_evento_id
          AND j.id = p_jugador_id
      )
$$;

-- ─── RPC: alta atómica ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION crear_evento_financiero(
  p_nombre       text,
  p_tipo         text,
  p_descripcion  text,
  p_division_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id  uuid := gen_random_uuid();
  v_ids uuid[];
BEGIN
  IF p_nombre IS NULL OR btrim(p_nombre) = '' THEN
    RAISE EXCEPTION 'El nombre del evento es obligatorio';
  END IF;

  -- sin nulos ni duplicados, respetando el orden elegido
  SELECT coalesce(array_agg(x.id ORDER BY x.ord), '{}')
  INTO v_ids
  FROM (
    SELECT u.id, min(u.ord) AS ord
    FROM unnest(coalesce(p_division_ids, '{}'::uuid[])) WITH ORDINALITY AS u(id, ord)
    WHERE u.id IS NOT NULL
    GROUP BY u.id
  ) x;

  IF p_tipo IN ('viaje', 'tercer_tiempo') AND cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'Los viajes y tercer tiempos necesitan al menos una división';
  END IF;

  -- sin RETURNING: la fila se valida con la policy de INSERT del rol; el
  -- trigger sync_eventos_financieros_division agrega la primera división
  INSERT INTO eventos_financieros (id, tipo, nombre, descripcion, division_id, creado_por)
  VALUES (v_id, p_tipo, btrim(p_nombre), nullif(btrim(coalesce(p_descripcion, '')), ''),
          v_ids[1], auth.uid());

  -- resto de las divisiones: cada fila pasa la policy de INSERT de la tabla
  IF cardinality(v_ids) > 1 THEN
    INSERT INTO eventos_financieros_divisiones (evento_financiero_id, division_id)
    SELECT v_id, d FROM unnest(v_ids[2:]) AS d;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION crear_evento_financiero(text, text, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION crear_evento_financiero(text, text, text, uuid[]) TO authenticated;

-- ─── eventos_financieros_divisiones: policies ────────────────────────────────

-- SELECT: quien ve el evento padre (aplica la RLS de eventos_financieros).
DROP POLICY IF EXISTS "eventos_financieros_divisiones_select" ON eventos_financieros_divisiones;
CREATE POLICY "eventos_financieros_divisiones_select"
  ON eventos_financieros_divisiones FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM eventos_financieros ef
      WHERE ef.id = eventos_financieros_divisiones.evento_financiero_id
    )
  );

-- Manager: sólo en viajes / tercer tiempos activos que creó, divisiones de su disciplina.
DROP POLICY IF EXISTS "eventos_financieros_divisiones_insert_manager" ON eventos_financieros_divisiones;
CREATE POLICY "eventos_financieros_divisiones_insert_manager"
  ON eventos_financieros_divisiones FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT get_rol()) = 'manager'
    AND EXISTS (
      SELECT 1 FROM eventos_financieros ef
      WHERE ef.id = eventos_financieros_divisiones.evento_financiero_id
        AND ef.tipo IN ('viaje', 'tercer_tiempo')
        AND ef.estado = 'activo'
        AND ef.creado_por = (SELECT auth.uid())
    )
    AND (SELECT deporte FROM divisiones WHERE id = eventos_financieros_divisiones.division_id)
        = ANY ((SELECT deportes_del_usuario())::text[])
  );

-- Subcomisión: sólo en recaudaciones, divisiones de su disciplina.
DROP POLICY IF EXISTS "eventos_financieros_divisiones_insert_subcomision" ON eventos_financieros_divisiones;
CREATE POLICY "eventos_financieros_divisiones_insert_subcomision"
  ON eventos_financieros_divisiones FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT get_rol()) = 'subcomision'
    AND EXISTS (
      SELECT 1 FROM eventos_financieros ef
      WHERE ef.id = eventos_financieros_divisiones.evento_financiero_id
        AND ef.tipo = 'recaudacion'
    )
    AND (SELECT tiene_acceso_deporte((SELECT deporte FROM divisiones WHERE id = eventos_financieros_divisiones.division_id)))
  );

-- Coordinador: mismo criterio que su INSERT de eventos (viaje / tercer tiempo, sus divisiones).
DROP POLICY IF EXISTS "eventos_financieros_divisiones_insert_coordinador" ON eventos_financieros_divisiones;
CREATE POLICY "eventos_financieros_divisiones_insert_coordinador"
  ON eventos_financieros_divisiones FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT get_rol()) = 'coordinador'
    AND EXISTS (
      SELECT 1 FROM eventos_financieros ef
      WHERE ef.id = eventos_financieros_divisiones.evento_financiero_id
        AND ef.tipo IN ('viaje', 'tercer_tiempo')
    )
    AND (SELECT tiene_acceso_division(eventos_financieros_divisiones.division_id))
  );

-- Admin: CRUD total.
DROP POLICY IF EXISTS "eventos_financieros_divisiones_all_admin" ON eventos_financieros_divisiones;
CREATE POLICY "eventos_financieros_divisiones_all_admin"
  ON eventos_financieros_divisiones FOR ALL TO authenticated
  USING ((SELECT get_rol()) = 'admin')
  WITH CHECK ((SELECT get_rol()) = 'admin');

-- ─── eventos_financieros: SELECT por división ────────────────────────────────

DROP POLICY IF EXISTS "eventos_financieros_select_division" ON eventos_financieros;
CREATE POLICY "eventos_financieros_select_division"
  ON eventos_financieros FOR SELECT TO authenticated
  USING (
    (SELECT get_rol()) IN ('coordinador', 'entrenador', 'manager')
    AND (
      eventos_financieros.creado_por = (SELECT auth.uid())
      OR evento_financiero_es_global(eventos_financieros.id)
      OR evento_financiero_toca_mis_divisiones(eventos_financieros.id)
    )
  );

-- ─── eventos_financieros: Manager INSERT ─────────────────────────────────────
-- La división principal (division_id) tiene que ser de su disciplina; el resto
-- se valida con la policy de INSERT de eventos_financieros_divisiones.

DROP POLICY IF EXISTS "eventos_financieros_insert_manager" ON eventos_financieros;
CREATE POLICY "eventos_financieros_insert_manager"
  ON eventos_financieros FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT get_rol()) = 'manager'
    AND eventos_financieros.tipo IN ('viaje', 'tercer_tiempo')
    AND eventos_financieros.creado_por = (SELECT auth.uid())
    AND eventos_financieros.division_id IS NOT NULL
    AND (SELECT deporte FROM divisiones WHERE id = eventos_financieros.division_id)
        = ANY ((SELECT deportes_del_usuario())::text[])
  );

-- ─── eventos_financieros: Manager UPDATE (cerrar) ────────────────────────────
-- El trigger guard_eventos_financieros_update (20261015000000) sigue limitando
-- al Manager a activo -> cerrado, sin tocar ninguna otra columna (incluida
-- division_id).

DROP POLICY IF EXISTS "eventos_financieros_update_manager" ON eventos_financieros;
CREATE POLICY "eventos_financieros_update_manager"
  ON eventos_financieros FOR UPDATE TO authenticated
  USING (
    (SELECT get_rol()) = 'manager'
    AND eventos_financieros.tipo IN ('viaje', 'tercer_tiempo')
    AND (
      eventos_financieros.creado_por = (SELECT auth.uid())
      OR evento_financiero_toca_mis_divisiones(eventos_financieros.id)
    )
  )
  WITH CHECK (
    (SELECT get_rol()) = 'manager'
    AND eventos_financieros.tipo IN ('viaje', 'tercer_tiempo')
    AND (
      eventos_financieros.creado_por = (SELECT auth.uid())
      OR evento_financiero_toca_mis_divisiones(eventos_financieros.id)
    )
  );

-- ─── cobranzas: Manager INSERT / UPDATE ──────────────────────────────────────

DROP POLICY IF EXISTS "cobranzas_insert_manager" ON cobranzas;
CREATE POLICY "cobranzas_insert_manager"
  ON cobranzas FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT get_rol()) = 'manager'
    AND registrado_por = (SELECT auth.uid())
    AND (SELECT tiene_acceso_division(
      (SELECT division_id FROM jugadores WHERE id = cobranzas.jugador_id)
    ))
    AND jugador_en_evento_financiero(cobranzas.evento_financiero_id, cobranzas.jugador_id)
  );

-- Sin WITH CHECK explícito: Postgres reusa el USING para la fila nueva, así
-- que el UPDATE tampoco puede mover la cobranza a un jugador fuera del evento.
DROP POLICY IF EXISTS "cobranzas_update_manager" ON cobranzas;
CREATE POLICY "cobranzas_update_manager"
  ON cobranzas FOR UPDATE TO authenticated
  USING (
    (SELECT get_rol()) = 'manager'
    AND (SELECT tiene_acceso_division(
      (SELECT division_id FROM jugadores WHERE id = cobranzas.jugador_id)
    ))
    AND jugador_en_evento_financiero(cobranzas.evento_financiero_id, cobranzas.jugador_id)
  );
