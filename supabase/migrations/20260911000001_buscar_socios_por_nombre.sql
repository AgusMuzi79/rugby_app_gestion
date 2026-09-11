-- Migration: 20260911000001_buscar_socios_por_nombre
--
-- Fix del buscador de socios por nombre en Usuarios (mobile y web, flujo
-- "Desde socio existente" para asignar un rol de staff) — ver memoria de
-- proyecto project-bug-busqueda-socio-usuarios. Dos bugs reales:
--   1. Sensible a tildes: `nombre ILIKE '%tomas%'` no encontraba
--      "Quinteros Tomás" (con tilde) — Postgres ILIKE no ignora acentos.
--   2. Un solo substring en el orden exacto que tipeaste: buscar "Juan
--      Rodriguez" no encuentra "Rodriguez Vener Juan Ignacio" porque las
--      palabras no aparecen contiguas y en ese orden en el nombre guardado
--      (Apellido(s) Nombre(s), no al revés).
--
-- Esta función corre como el usuario que llama (sin SECURITY DEFINER) —
-- respeta las mismas RLS que ya tenían las queries directas de socios/
-- profiles (secretaria/subcomision/admin), sin escalar permisos.

create extension if not exists unaccent;

create or replace function buscar_socios_por_nombre(q text)
returns table (id uuid, nombre text)
language sql
stable
as $$
  select s.id, p.nombre
  from socios s
  join profiles p on p.id = s.profile_id
  where q is not null and trim(q) <> ''
    -- cada palabra de la búsqueda tiene que aparecer en el nombre, en
    -- cualquier orden y posición, sin importar mayúsculas/tildes
    and not exists (
      select 1
      from unnest(string_to_array(trim(regexp_replace(q, '\s+', ' ', 'g')), ' ')) as palabra
      where palabra <> '' and unaccent(p.nombre) not ilike '%' || unaccent(palabra) || '%'
    )
  order by p.nombre
  limit 10
$$;

grant execute on function buscar_socios_por_nombre(text) to authenticated;
