-- ─────────────────────────────────────────────────────────────────────────────
-- Índice único equipos(division_id, nombre) — sólo si no hay duplicados
-- ─────────────────────────────────────────────────────────────────────────────
-- Auditoría UX entrenador-coordinador (2026-10-26), T16. La primera vez que
-- un entrenador abría Partido, dos cargas en paralelo creaban el mismo equipo
-- dos veces (dos "Primera"): la mesa quedaba en uno y el resultado en el otro.
-- La app ahora hace una sola carga y da de alta con
-- upsert(onConflict 'division_id,nombre', ignoreDuplicates), que necesita
-- este índice.
--
-- Esta migración NUNCA borra datos: si ya hay duplicados, avisa con un NOTICE
-- (cuántos grupos y filas) y no crea el índice, así el deploy no falla. En ese
-- caso hay que correr a mano el script de limpieza revisado (re-apunta mesas
-- y resultados al equipo más viejo, borra los duplicados ya sin referencias y
-- crea este mismo índice). Mientras tanto la app sigue funcionando: sin índice
-- el upsert devuelve 42P10 y la app cae al insert de siempre.
-- Idempotente: si el índice ya existe, no hace nada.

DO $$
DECLARE
  v_grupos int;
  v_filas  int;
BEGIN
  IF to_regclass('public.equipos_division_nombre_key') IS NOT NULL THEN
    RETURN;
  END IF;

  SELECT count(*), coalesce(sum(n), 0) INTO v_grupos, v_filas
  FROM (
    SELECT count(*) AS n
    FROM equipos
    GROUP BY division_id, nombre
    HAVING count(*) > 1
  ) d;

  IF v_grupos > 0 THEN
    RAISE NOTICE 'equipos: % grupos (division_id, nombre) duplicados (% filas). No se crea equipos_division_nombre_key: correr el script de limpieza de la auditoría entrenador T16.', v_grupos, v_filas;
    RETURN;
  END IF;

  CREATE UNIQUE INDEX equipos_division_nombre_key ON equipos (division_id, nombre);
END;
$$;
