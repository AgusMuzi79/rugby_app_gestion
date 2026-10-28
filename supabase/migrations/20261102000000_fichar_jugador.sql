-- ─────────────────────────────────────────────────────────────────────────────
-- fichar_jugador: alta atómica de jugador + fichaje (Manager)
-- ─────────────────────────────────────────────────────────────────────────────
-- Auditoría UX manager-subcomisión (2026-10-26), T10. La app insertaba el
-- jugador, después (si encontraba un socio con ese DNI) le ponía socio_id y
-- recién después el fichaje, en tres llamadas sueltas. Si fallaba el fichaje,
-- el jugador quedaba creado pero fuera de la lista de Fichajes (que sólo
-- muestra jugadores con fichaje) y el reintento chocaba con "ya existe un
-- jugador con ese DNI en esta división".
--
-- Este RPC hace lo mismo en UNA transacción: si cualquier paso falla no queda
-- nada. SECURITY INVOKER: corre con los permisos de quien llama, así que la
-- autorización es exactamente la RLS vigente:
--   * jugadores_insert_manager: rol manager y división asignada a él;
--   * fichajes_insert_manager: registrado_por = quien llama y misma división;
--   * el vínculo con socio usa la RLS de socios igual que la app: sólo se
--     vincula si quien llama ve exactamente un socio con ese DNI.
-- Devuelve los ids nuevos. Errores: 23505 (DNI repetido en la división),
-- 42501 (división ajena / sin permiso), 22023 (dato obligatorio faltante).

CREATE OR REPLACE FUNCTION fichar_jugador(
  p_nombre           text,
  p_dni              text,
  p_fecha_nacimiento date,
  p_division_id      uuid,
  p_posicion         text DEFAULT NULL
)
RETURNS TABLE (nuevo_jugador_id uuid, nuevo_fichaje_id uuid)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_nombre    text := btrim(coalesce(p_nombre, ''));
  v_dni       text := btrim(coalesce(p_dni, ''));
  v_jugador   uuid := gen_random_uuid();
  v_fichaje   uuid := gen_random_uuid();
  v_socios    uuid[];
  v_socio_id  uuid;
BEGIN
  IF v_nombre = '' THEN
    RAISE EXCEPTION 'Ingresá el nombre completo.' USING ERRCODE = '22023';
  END IF;
  IF v_dni = '' THEN
    RAISE EXCEPTION 'Ingresá el DNI.' USING ERRCODE = '22023';
  END IF;
  IF p_fecha_nacimiento IS NULL THEN
    RAISE EXCEPTION 'Seleccioná la fecha de nacimiento.' USING ERRCODE = '22023';
  END IF;
  IF p_division_id IS NULL THEN
    RAISE EXCEPTION 'Elegí la división.' USING ERRCODE = '22023';
  END IF;

  -- Vínculo con socio por DNI (con la RLS de quien llama, como hacía la app).
  SELECT array_agg(s.id) INTO v_socios
  FROM (SELECT id FROM socios WHERE dni = v_dni LIMIT 2) s;
  IF cardinality(v_socios) = 1 THEN
    v_socio_id := v_socios[1];
  END IF;

  -- Sin RETURNING: cada fila se valida con la policy de INSERT del rol.
  INSERT INTO jugadores (id, nombre_completo, dni, fecha_nacimiento, division_id, posicion, socio_id)
  VALUES (v_jugador, v_nombre, v_dni, p_fecha_nacimiento, p_division_id,
          nullif(btrim(coalesce(p_posicion, '')), ''), v_socio_id);

  INSERT INTO fichajes (id, jugador_id, registrado_por)
  VALUES (v_fichaje, v_jugador, auth.uid());

  RETURN QUERY SELECT v_jugador, v_fichaje;
END;
$$;

REVOKE EXECUTE ON FUNCTION fichar_jugador(text, text, date, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fichar_jugador(text, text, date, uuid, text) TO authenticated;
