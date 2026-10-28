-- Migration: 20261030000000_noticias_notificada_at
--
-- Auditoría Secretaría T11: el aviso push de una noticia sale una sola vez.
-- Antes, despublicar y volver a publicar desde el panel mandaba otro push a
-- todos los socios.
--
--   · noticias.notificada_at: cuándo se mandó el aviso (null = nunca).
--   · reclamar_aviso_noticia(id): la Edge Function `notifications`
--     (noticia_publicada) la llama ANTES de mandar el push. Marca la noticia de
--     forma atómica (UPDATE … WHERE notificada_at IS NULL): si dos pedidos
--     llegan a la vez, el lock de la fila deja pasar a uno solo y el otro ve
--     'ya_notificada'. Devuelve 'reclamada' | 'ya_notificada' | 'no_publicada'
--     | 'no_existe'; sólo con 'reclamada' se manda el push.
--   · liberar_aviso_noticia(id): si el push falló entero (ningún envío salió),
--     la función devuelve la marca para que publicar de nuevo lo reintente.
--   · Trigger: desde la app/panel (roles authenticated/anon) notificada_at no
--     se puede escribir; un cliente no puede limpiarla para forzar otro push.
--   · Backfill: las noticias ya publicadas cuentan como avisadas (se avisaron
--     con el código anterior al publicarse) con su created_at. Los borradores
--     quedan en null. No se borra nada.
--
-- Orden de deploy: esta migración ANTES que `notifications` y que el panel web
-- / la OTA (leen la columna). Idempotente.

alter table noticias
  add column if not exists notificada_at timestamptz;

update noticias
   set notificada_at = created_at
 where publicada
   and notificada_at is null;

-- ─── Guardia: los clientes no escriben notificada_at ──────────────────────────

create or replace function noticias_proteger_notificada_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.notificada_at := null;
    else
      new.notificada_at := old.notificada_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists noticias_proteger_notificada_at on noticias;
create trigger noticias_proteger_notificada_at
  before insert or update on noticias
  for each row execute function noticias_proteger_notificada_at();

-- ─── Reclamar / liberar el aviso ─────────────────────────────────────────────

create or replace function reclamar_aviso_noticia(p_noticia_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_publicada boolean;
  v_notificada timestamptz;
begin
  update noticias
     set notificada_at = now()
   where id = p_noticia_id
     and publicada
     and notificada_at is null;
  if found then
    return 'reclamada';
  end if;

  select publicada, notificada_at into v_publicada, v_notificada
    from noticias
   where id = p_noticia_id;
  if not found then
    return 'no_existe';
  end if;
  if v_notificada is not null then
    return 'ya_notificada';
  end if;
  return 'no_publicada';
end;
$$;

create or replace function liberar_aviso_noticia(p_noticia_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update noticias set notificada_at = null where id = p_noticia_id;
$$;

revoke all on function reclamar_aviso_noticia(uuid) from public, anon, authenticated;
revoke all on function liberar_aviso_noticia(uuid) from public, anon, authenticated;
grant execute on function reclamar_aviso_noticia(uuid) to service_role;
grant execute on function liberar_aviso_noticia(uuid) to service_role;
