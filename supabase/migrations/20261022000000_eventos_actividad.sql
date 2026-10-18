-- Migration: 20261022000000_eventos_actividad
--
-- Nuevo tipo de evento de calendario: 'actividad' (charla de nutrición,
-- psicología deportiva, test de gimnasio, antropometría, Sevens, actividad
-- grupal). Hace falta para cargar el cronograma post temporada del plantel
-- superior, que mezcla entrenamientos con actividades que no son ni
-- entrenamiento ni partido.
--
--   • eventos.tipo pasa a admitir 'entrenamiento' | 'partido' | 'actividad'.
--     El check original era inline y sin nombre (init_schema), así que se
--     busca su nombre en pg_constraint en vez de asumirlo, y se recrea con
--     nombre fijo (eventos_tipo_check).
--   • eventos.titulo (nullable): nombre visible de la actividad. Obligatorio
--     (no vacío) cuando tipo = 'actividad'; para entrenamiento/partido queda
--     NULL y la app sigue mostrando "Entrenamiento" / "Partido".
--
-- Sin cambios de RLS: eventos_insert_entrenador (20260507000000) sigue
-- permitiendo sólo 'entrenamiento' a propósito; las actividades las crea el
-- coordinador.

DO $$
DECLARE
  v_nombre text;
BEGIN
  FOR v_nombre IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.eventos'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%tipo%'
      AND pg_get_constraintdef(c.oid) ILIKE '%entrenamiento%'
  LOOP
    EXECUTE format('ALTER TABLE public.eventos DROP CONSTRAINT %I', v_nombre);
  END LOOP;
END $$;

ALTER TABLE public.eventos
  ADD CONSTRAINT eventos_tipo_check
  CHECK (tipo IN ('entrenamiento', 'partido', 'actividad'));

ALTER TABLE public.eventos ADD COLUMN titulo text;

ALTER TABLE public.eventos
  ADD CONSTRAINT eventos_titulo_actividad_check
  CHECK (tipo <> 'actividad' OR (titulo IS NOT NULL AND btrim(titulo) <> ''));
