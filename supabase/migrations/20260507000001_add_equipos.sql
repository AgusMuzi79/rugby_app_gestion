-- Migration: 20260507000001_add_equipos
-- Tabla equipos: subequipo dentro de una división (ej: "M17 A", "M17 B").
-- Columna equipo_id nullable en mesas_de_partido para asociar una mesa a un equipo específico.


-- ============================================================
-- TABLA EQUIPOS
-- ============================================================

create table equipos (
  id          uuid        default gen_random_uuid() primary key,
  division_id uuid        not null references divisiones(id),
  nombre      text        not null,
  created_by  uuid        not null references profiles(id),
  created_at  timestamptz not null default now()
);

alter table equipos enable row level security;

create index on equipos (division_id);
create index on equipos (created_by);


-- ============================================================
-- COLUMNA equipo_id EN mesas_de_partido
-- ============================================================

alter table mesas_de_partido
  add column equipo_id uuid references equipos(id);

create index on mesas_de_partido (equipo_id);


-- ============================================================
-- RLS — equipos
-- Subcomisión + Admin: CRUD global
-- Coordinador: SELECT de su división
-- Entrenador: CRUD de su división
-- Manager: SELECT de su división
-- ============================================================

-- SELECT
create policy "equipos_select_subcomision_admin"
  on equipos for select to authenticated
  using ((select get_rol()) in ('subcomision', 'admin'));

create policy "equipos_select_division"
  on equipos for select to authenticated
  using (
    (select get_rol()) in ('coordinador', 'entrenador', 'manager')
    and (select tiene_acceso_division(division_id))
  );

-- INSERT
create policy "equipos_insert_subcomision_admin"
  on equipos for insert to authenticated
  with check ((select get_rol()) in ('subcomision', 'admin'));

create policy "equipos_insert_entrenador"
  on equipos for insert to authenticated
  with check (
    (select get_rol()) = 'entrenador'
    and (select tiene_acceso_division(division_id))
  );

-- UPDATE
create policy "equipos_update_subcomision_admin"
  on equipos for update to authenticated
  using ((select get_rol()) in ('subcomision', 'admin'));

create policy "equipos_update_entrenador"
  on equipos for update to authenticated
  using (
    (select get_rol()) = 'entrenador'
    and (select tiene_acceso_division(division_id))
  );

-- DELETE
create policy "equipos_delete_subcomision_admin"
  on equipos for delete to authenticated
  using ((select get_rol()) in ('subcomision', 'admin'));

create policy "equipos_delete_entrenador"
  on equipos for delete to authenticated
  using (
    (select get_rol()) = 'entrenador'
    and (select tiene_acceso_division(division_id))
  );
