-- Migration: 20261130000000_noticias_destacada
--
-- Noticias destacadas (Subcomisión, app y web: checkbox "Destacar noticia").
--
-- · noticias.destacada_hasta: hasta cuándo la noticia va primera en el feed del socio
--   (la app la pone en ahora + 7 días al publicar). Null = no destacada. Pasada esa fecha
--   vuelve a su lugar por fecha. El orden lo hace la app (app/lib/ordenNoticias.ts).
--
-- Sin cambios de RLS: las políticas de insert/update de noticias cubren la columna nueva.
-- Re-ejecutable: add column if not exists. Sin índice: el feed lee todas las noticias
-- publicadas y ordena en el cliente, así que no hay consulta que filtre por esta columna.

alter table public.noticias
  add column if not exists destacada_hasta timestamptz;
