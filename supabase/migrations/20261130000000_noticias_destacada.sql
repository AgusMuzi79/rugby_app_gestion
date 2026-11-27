-- Migration: 20261130000000_noticias_destacada
--
-- Noticias destacadas (Subcomisión, app y web: checkbox "Destacar noticia").
--
-- · noticias.destacada_hasta: hasta cuándo la noticia va primera en el feed del socio
--   (la app pide destacarla; el trigger de abajo la fija en now() + 7 días). Null = no destacada. Pasada esa fecha
--   vuelve a su lugar por fecha. El orden lo hace la app (app/lib/ordenNoticias.ts).
--
-- Sin cambios de RLS: las políticas de insert/update de noticias cubren la columna nueva.
-- Re-ejecutable: add column if not exists. Sin índice: el feed lee todas las noticias
-- publicadas y ordena en el cliente, así que no hay consulta que filtre por esta columna.

alter table public.noticias
  add column if not exists destacada_hasta timestamptz;

-- The server owns the featured window, so a skewed device clock or a direct API
-- call cannot pin a noticia to the top of every feed. For client roles
-- (authenticated / anon):
-- · INSERT: any non-null destacada_hasta means "feature it" and is replaced by
--   now() + 7 days (keep in sync with DIAS_DESTACADA in app/lib/noticiaSubcomision.ts
--   and web/lib/noticiaSubcomision.ts), only for subcomisión / admin; anyone else gets null.
-- · UPDATE: the value is kept (there is no edit flow for it).
-- service_role (SQL editor, scripts) can still set it freely.
create or replace function noticias_proteger_destacada_hasta()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.destacada_hasta is not null and (select get_rol()) in ('subcomision', 'admin') then
        new.destacada_hasta := now() + interval '7 days';
      else
        new.destacada_hasta := null;
      end if;
    else
      new.destacada_hasta := old.destacada_hasta;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists noticias_proteger_destacada_hasta on noticias;
create trigger noticias_proteger_destacada_hasta
  before insert or update on noticias
  for each row execute function noticias_proteger_destacada_hasta();
