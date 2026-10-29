-- ─────────────────────────────────────────────────────────────────────────────
-- guardar_mesa: guarda la mesa de un partido en una sola transacción (Entrenador)
-- ─────────────────────────────────────────────────────────────────────────────
-- Auditoría UX entrenador-coordinador (2026-10-26), T15. La app hacía tres
-- llamadas sueltas: upsert de mesas_de_partido, delete de sus mesa_jugadores
-- (con el error ignorado) e insert del nuevo set. Si el insert fallaba (red,
-- RLS, un jugador repetido) la mesa quedaba vacía pero existente, y el chequeo
-- de "primero la mesa del equipo obligatorio" la daba por cargada.
--
-- Este RPC hace lo mismo en UNA transacción: si cualquier paso falla, la mesa
-- anterior queda intacta. SECURITY INVOKER: corre con los permisos de quien
-- llama, así que la autorización es exactamente la RLS vigente:
--   * mesas_de_partido_insert/update_entrenador: rol entrenador y división
--     del evento asignada a él (admin: CRUD total);
--   * mesa_jugadores_delete/insert_entrenador: misma regla vía la mesa.
-- p_jugadores: [{"jugador_id": uuid, "rol_en_mesa": "titular" | "suplente" | …}]
-- (un array vacío deja la mesa creada y sin jugadores, como hacía la app).
-- Devuelve el id de la mesa. Errores: 42501 (división ajena / sin permiso),
-- 22023 (datos inválidos o equipo de otra división), 23505 (jugador repetido),
-- 23514 (rol inválido).

CREATE OR REPLACE FUNCTION guardar_mesa(
  p_evento    uuid,
  p_equipo    uuid,
  p_jugadores jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_mesa uuid;
BEGIN
  IF p_evento IS NULL OR p_equipo IS NULL THEN
    RAISE EXCEPTION 'Faltan el partido o el equipo.' USING ERRCODE = '22023';
  END IF;
  IF p_jugadores IS NULL OR jsonb_typeof(p_jugadores) <> 'array' THEN
    RAISE EXCEPTION 'La lista de jugadores no es válida.' USING ERRCODE = '22023';
  END IF;

  -- Upsert de la mesa: la policy de INSERT (o la de UPDATE si ya existe)
  -- rechaza con 42501 a quien no tiene la división del evento.
  INSERT INTO mesas_de_partido (evento_id, equipo_id)
  VALUES (p_evento, p_equipo)
  ON CONFLICT (evento_id, equipo_id) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_mesa;

  -- El equipo tiene que ser de la división del partido.
  IF NOT EXISTS (
    SELECT 1
    FROM equipos q
    JOIN eventos e ON e.division_id = q.division_id
    WHERE q.id = p_equipo AND e.id = p_evento
  ) THEN
    RAISE EXCEPTION 'El equipo no es de la división del partido.' USING ERRCODE = '22023';
  END IF;

  DELETE FROM mesa_jugadores WHERE mesa_id = v_mesa;

  INSERT INTO mesa_jugadores (mesa_id, jugador_id, rol_en_mesa)
  SELECT v_mesa, (j->>'jugador_id')::uuid, j->>'rol_en_mesa'
  FROM jsonb_array_elements(p_jugadores) AS j;

  RETURN v_mesa;
END;
$$;

REVOKE EXECUTE ON FUNCTION guardar_mesa(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION guardar_mesa(uuid, uuid, jsonb) TO authenticated;
