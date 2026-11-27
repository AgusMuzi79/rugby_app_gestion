-- Migration: 20261129000000_noticias_imagenes
--
-- Noticias con varias imágenes (Subcomisión, app y web).
--
-- · noticias.imagenes: paths del bucket 'noticias-imagenes', en orden (máximo 6).
-- · noticias.imagen_path se sigue escribiendo con la primera imagen (o null) para que las
--   filas viejas y los lectores que todavía no conocen `imagenes` sigan funcionando.
-- · Backfill: las noticias que ya tenían imagen_path pasan a tener imagenes = [imagen_path].
--
-- Sin cambios de RLS: las políticas de insert/update de noticias cubren la columna nueva.
-- Re-ejecutable: add column if not exists, el backfill sólo toca filas con imagenes vacío y
-- el check se crea sólo si no existe.

alter table public.noticias
  add column if not exists imagenes text[] not null default '{}';

update public.noticias
   set imagenes = array[imagen_path]
 where imagen_path is not null
   and cardinality(imagenes) = 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'noticias_imagenes_max'
       and conrelid = 'public.noticias'::regclass
  ) then
    alter table public.noticias
      add constraint noticias_imagenes_max check (cardinality(imagenes) <= 6);
  end if;
end $$;
