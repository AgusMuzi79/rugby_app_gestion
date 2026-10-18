-- Carga del cronograma POST TEMPORADA 2026 del plantel superior
-- (PDF "CRONOGRAMA FINAL POST TEMPORADA 2026", 19/10 al 12/12).
--
-- Requiere la migración 20261022000000_eventos_actividad (tipo 'actividad' + titulo).
--
-- Uso (desde la raíz del repo):
--   supabase db query --linked -f scripts/cronograma-post-temporada-2026.sql
--
--   1. Con v_divisiones vacío, falla listando las divisiones 'superior' para elegir.
--   2. Completar v_divisiones con los nombres exactos. Con v_commit = false (dry-run)
--      muestra el resumen y hace rollback.
--   3. Con v_commit = true inserta. Es idempotente: no duplica un evento que ya exista
--      (misma división, fecha, tipo, título y lugar, no cancelado).
--
-- Decisiones:
--   • Gimnasio hipertrofia: entrenamiento a las 20:30 (empieza 20:45; se cita antes).
--   • Entrenamiento Seven: entrenamiento sin hora, lugar 'Seven'.
--   • Charlas, psicología, testeos, antropometrías, Seven oficial, actividad grupal:
--     actividad sin hora.
--   • 15/10 y 17/10 ya pasaron y no se cargan; 24/10 es LIBRE.

DO $$
DECLARE
  v_divisiones text[]  := array[]::text[];  -- p. ej. array['Primera', 'Intermedia']
  v_commit     boolean := false;

  v_creador    uuid;
  v_div        record;
  v_ev         record;
  v_insertados int := 0;
  v_existentes int := 0;
  v_lista      text;
BEGIN
  IF coalesce(array_length(v_divisiones, 1), 0) = 0 THEN
    SELECT string_agg(format('%s (rama %s)', nombre, coalesce(rama, '-')), ', ' ORDER BY nombre)
      INTO v_lista
      FROM divisiones WHERE categoria = 'superior' AND activa;
    RAISE EXCEPTION 'Completar v_divisiones. Divisiones superior activas: %', v_lista;
  END IF;

  IF (SELECT count(*) FROM divisiones WHERE nombre = ANY (v_divisiones) AND activa)
     <> array_length(v_divisiones, 1) THEN
    RAISE EXCEPTION 'Algún nombre de v_divisiones no existe o no está activo: %', v_divisiones;
  END IF;

  FOR v_div IN SELECT id, nombre FROM divisiones WHERE nombre = ANY (v_divisiones) LOOP
    -- Creador: un coordinador con acceso a la división; si no hay, un admin.
    SELECT id INTO v_creador FROM profiles
     WHERE 'coordinador' = ANY (roles) AND v_div.id = ANY (divisiones)
     ORDER BY created_at LIMIT 1;
    IF v_creador IS NULL THEN
      SELECT id INTO v_creador FROM profiles WHERE 'admin' = ANY (roles) ORDER BY created_at LIMIT 1;
    END IF;
    IF v_creador IS NULL THEN
      RAISE EXCEPTION 'Sin coordinador ni admin para %', v_div.nombre;
    END IF;

    FOR v_ev IN
      SELECT * FROM (VALUES
        -- Gimnasio hipertrofia (24 sesiones)
        ('2026-10-19'::date, 'entrenamiento', '20:30'::time, 'Gimnasio', NULL::text),
        ('2026-10-20', 'entrenamiento', '20:30', 'Gimnasio', NULL),
        ('2026-10-22', 'entrenamiento', '20:30', 'Gimnasio', NULL),
        ('2026-10-26', 'entrenamiento', '20:30', 'Gimnasio', NULL),
        ('2026-10-27', 'entrenamiento', '20:30', 'Gimnasio', NULL),
        ('2026-10-29', 'entrenamiento', '20:30', 'Gimnasio', NULL),
        ('2026-11-02', 'entrenamiento', '20:30', 'Gimnasio', NULL),
        ('2026-11-03', 'entrenamiento', '20:30', 'Gimnasio', NULL),
        ('2026-11-05', 'entrenamiento', '20:30', 'Gimnasio', NULL),
        ('2026-11-09', 'entrenamiento', '20:30', 'Gimnasio', NULL),
        ('2026-11-10', 'entrenamiento', '20:30', 'Gimnasio', NULL),
        ('2026-11-12', 'entrenamiento', '20:30', 'Gimnasio', NULL),
        ('2026-11-16', 'entrenamiento', '20:30', 'Gimnasio', NULL),
        ('2026-11-17', 'entrenamiento', '20:30', 'Gimnasio', NULL),
        ('2026-11-19', 'entrenamiento', '20:30', 'Gimnasio', NULL),
        ('2026-11-23', 'entrenamiento', '20:30', 'Gimnasio', NULL),
        ('2026-11-24', 'entrenamiento', '20:30', 'Gimnasio', NULL),
        ('2026-11-26', 'entrenamiento', '20:30', 'Gimnasio', NULL),
        ('2026-11-30', 'entrenamiento', '20:30', 'Gimnasio', NULL),
        ('2026-12-01', 'entrenamiento', '20:30', 'Gimnasio', NULL),
        ('2026-12-03', 'entrenamiento', '20:30', 'Gimnasio', NULL),
        ('2026-12-07', 'entrenamiento', '20:30', 'Gimnasio', NULL),
        ('2026-12-08', 'entrenamiento', '20:30', 'Gimnasio', NULL),
        ('2026-12-10', 'entrenamiento', '20:30', 'Gimnasio', NULL),
        -- Entrenamiento Seven
        ('2026-11-05', 'entrenamiento', NULL, 'Seven', NULL),
        ('2026-11-14', 'entrenamiento', NULL, 'Seven', NULL),
        ('2026-11-19', 'entrenamiento', NULL, 'Seven', NULL),
        -- Actividades
        ('2026-10-19', 'actividad', NULL, NULL, 'Charla de nutrición'),
        ('2026-10-31', 'actividad', NULL, NULL, '1er encuentro de psicología deportiva'),
        ('2026-11-07', 'actividad', NULL, NULL, 'Actividad grupal'),
        ('2026-11-14', 'actividad', NULL, NULL, 'Testeo gimnasio'),
        ('2026-11-21', 'actividad', NULL, NULL, 'Seven oficial'),
        ('2026-11-28', 'actividad', NULL, NULL, '2do encuentro de psicología deportiva'),
        ('2026-12-05', 'actividad', NULL, NULL, 'Actividad grupal'),
        ('2026-12-12', 'actividad', NULL, NULL, 'Testeo gimnasio'),
        ('2026-12-12', 'actividad', NULL, NULL, 'Antropometrías')
      ) AS t(fecha, tipo, hora, lugar, titulo)
    LOOP
      IF EXISTS (
        SELECT 1 FROM eventos e
         WHERE e.division_id = v_div.id AND e.fecha = v_ev.fecha AND e.tipo = v_ev.tipo
           AND coalesce(e.titulo, '') = coalesce(v_ev.titulo, '')
           AND coalesce(e.lugar, '') = coalesce(v_ev.lugar, '')
           AND NOT e.cancelado
      ) THEN
        v_existentes := v_existentes + 1;
      ELSE
        INSERT INTO eventos (tipo, division_id, fecha, hora, lugar, titulo, creado_por)
        VALUES (v_ev.tipo, v_div.id, v_ev.fecha, v_ev.hora, v_ev.lugar, v_ev.titulo, v_creador);
        v_insertados := v_insertados + 1;
      END IF;
    END LOOP;
  END LOOP;

  IF NOT v_commit THEN
    RAISE EXCEPTION 'DRY-RUN (rollback): % a insertar, % ya existentes, divisiones %',
      v_insertados, v_existentes, v_divisiones;
  END IF;
  RAISE NOTICE 'OK: % insertados, % ya existentes, divisiones %', v_insertados, v_existentes, v_divisiones;
END $$;
