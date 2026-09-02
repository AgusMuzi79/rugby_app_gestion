-- Migration: 20260902000000_accesos_gimnasio
--
-- Historial de ingresos escaneados por una cuenta Lector (rol='porteria').
-- Pedido de Agus (2026-09-02): por ahora sólo el gimnasio, pero se deja la
-- columna `punto` (en vez de asumir un único lugar) para no tener que migrar
-- de nuevo cuando se sume el catálogo de "punto de control" — ver memoria de
-- proyecto project-control-accesos-puntos.
--
-- `semaforo` es una FOTO del estado de cuota al momento del ingreso, no un
-- valor en vivo — si el socio se pone al día después, el registro histórico
-- de ese día sigue mostrando el estado real que tenía cuando entró.
--
-- Se inserta desde `socios-qr` (`handleValidate`/`handleValidateDni`) con
-- service_role — sin policy de INSERT para clientes, portería nunca escribe
-- directo. La lectura tampoco es directa desde el cliente: el panel web de
-- Lector consulta vía la acción `listar-accesos` de la misma Edge Function
-- (mismo patrón que el resto de lo que ve portería, "sin acceso directo a
-- DB; todo vía Edge Function con service role", 20260601000001_socios_rls.sql).
-- La policy de SELECT de acá es sólo para que admin/subcomisión puedan
-- explorarla directo si hace falta (SQL editor, futura pantalla web).

create table accesos (
  id         uuid        primary key default gen_random_uuid(),
  socio_id   uuid        not null references socios(id) on delete cascade,
  punto      text        not null default 'gimnasio',
  semaforo   text,
  creado_en  timestamptz not null default now()
);

create index accesos_creado_en_idx on accesos (creado_en);
create index accesos_socio_id_idx  on accesos (socio_id);

alter table accesos enable row level security;

create policy "admin_subcomision_select_accesos" on accesos
  for select to authenticated
  using ((select get_rol()) in ('admin', 'subcomision'));
