-- Add equipo_id and rival to resultados; change unique from (evento_id) to (evento_id, equipo_id)

ALTER TABLE resultados
  ADD COLUMN IF NOT EXISTS equipo_id uuid references equipos(id),
  ADD COLUMN IF NOT EXISTS rival text;

ALTER TABLE resultados DROP CONSTRAINT IF EXISTS resultados_evento_id_key;
ALTER TABLE resultados ADD CONSTRAINT resultados_evento_equipo_unique
  UNIQUE (evento_id, equipo_id);

CREATE INDEX IF NOT EXISTS resultados_equipo_id_idx ON resultados (equipo_id);
