-- Divisiones con rango de edad por temporada, línea y rama.
--
-- edad_min / edad_max: edad del jugador EN LA TEMPORADA (año de la temporada
-- menos año de nacimiento). Al ser relativo a la temporada, el rango no se
-- actualiza nunca: SUB 10 = 9..10 cubre los nacidos 2016/17 en 2026 y los
-- 2017/18 en 2027. Rugby M16 = 16..16. Ambos null = división sin cálculo
-- automático (adultos, Escuelita, etc.): sus jugadores se gestionan a mano.
--
-- linea: 'A' (oficial) / 'B' (incompleta) para camadas con dos equipos.
-- rama: separa divisiones cuyas edades se pisan (p. ej. hockey damas SUB 12 y
-- varones menores).

alter table divisiones
  add column if not exists edad_min int,
  add column if not exists edad_max int,
  add column if not exists linea text,
  add column if not exists rama text;

alter table divisiones
  drop constraint if exists divisiones_rango_edad_check,
  add constraint divisiones_rango_edad_check check (
    (edad_min is null and edad_max is null)
    or (edad_min is not null and edad_max is not null
        and edad_min >= 0 and edad_min <= edad_max)
  );

alter table divisiones
  drop constraint if exists divisiones_linea_check,
  add constraint divisiones_linea_check check (linea is null or linea in ('A', 'B'));

alter table divisiones
  drop constraint if exists divisiones_rama_check,
  add constraint divisiones_rama_check check (rama is null or rama in ('damas', 'caballeros', 'mixto'));

comment on column divisiones.edad_min is 'Edad mínima en la temporada (año temporada - año nacimiento). Null = sin cálculo automático.';
comment on column divisiones.edad_max is 'Edad máxima en la temporada (año temporada - año nacimiento). Null = sin cálculo automático.';
comment on column divisiones.linea is 'Línea de la camada: A (oficial) o B (incompleta). Null = única.';
comment on column divisiones.rama is 'damas | caballeros | mixto. Null = no aplica.';
