-- Permite una mesa por (evento, equipo) en lugar de una sola por evento.
-- Necesario para que múltiples equipos de la misma división puedan tener
-- su propia mesa en el mismo partido.

ALTER TABLE mesas_de_partido DROP CONSTRAINT IF EXISTS mesas_de_partido_evento_id_key;
ALTER TABLE mesas_de_partido ADD CONSTRAINT mesas_de_partido_evento_equipo_unique
  UNIQUE (evento_id, equipo_id);
