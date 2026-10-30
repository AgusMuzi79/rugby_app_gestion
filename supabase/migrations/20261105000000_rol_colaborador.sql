-- Migration: 20261105000000_rol_colaborador
--
-- Nuevo rol 'colaborador' (auditoría entrenador T23, decisión 2026-10-26):
-- toma asistencia y nada más. Lo crea Subcomisión/Admin igual que a un
-- entrenador (admin-usuarios) y se le asignan divisiones en
-- profiles.divisiones, el mismo array que lee tiene_acceso_division().
--
-- Qué puede hacer, siempre en sus divisiones:
--   - leer jugadores, eventos (todos los tipos: la alerta de 4 faltas cuenta
--     partidos) y asistencias;
--   - crear el entrenamiento de hoy cuando no hay ninguno (la pantalla y la
--     sync offline lo insertan al guardar), sólo tipo 'entrenamiento' y a su
--     nombre;
--   - cargar y corregir asistencias, a su nombre y sobre un evento de la
--     misma división.
-- Nada más: ni fichajes, partidos, resultados, mesas, lesiones, cobranzas,
-- ni editar o cancelar eventos. divisiones ya se lee con divisiones_select
-- (abierta para todo rol que no sea subcomisión) y su propio perfil con
-- profiles_select_own.
--
-- Sólo se agregan policies nuevas; ninguna existente se modifica. Idempotente.


-- ============================================================
-- 1. Rol 'colaborador' en los CHECK de profiles
--    (lista completa copiada de 20261010000000_tutor_menores)
-- ============================================================

alter table profiles drop constraint if exists profiles_rol_check;
alter table profiles add constraint profiles_rol_check
  check (rol = any (array[
    'subcomision', 'coordinador', 'entrenador', 'manager', 'admin',
    'secretaria', 'porteria', 'canchero', 'buffet', 'cliente_gimnasio', 'socio',
    'tutor', 'colaborador'
  ]));

alter table profiles drop constraint if exists profiles_roles_check;
alter table profiles add constraint profiles_roles_check
  check (roles <@ array[
    'subcomision', 'coordinador', 'entrenador', 'manager', 'admin',
    'secretaria', 'porteria', 'canchero', 'buffet', 'cliente_gimnasio', 'socio',
    'tutor', 'colaborador'
  ]);


-- ============================================================
-- 2. Lectura: jugadores, eventos y asistencias de sus divisiones
-- ============================================================

drop policy if exists "jugadores_select_colaborador" on jugadores;
create policy "jugadores_select_colaborador"
  on jugadores for select to authenticated
  using (
    (select get_rol()) = 'colaborador'
    and (select tiene_acceso_division(division_id))
  );

drop policy if exists "eventos_select_colaborador" on eventos;
create policy "eventos_select_colaborador"
  on eventos for select to authenticated
  using (
    (select get_rol()) = 'colaborador'
    and (select tiene_acceso_division(division_id))
  );

drop policy if exists "asistencias_select_colaborador" on asistencias;
create policy "asistencias_select_colaborador"
  on asistencias for select to authenticated
  using (
    (select get_rol()) = 'colaborador'
    and (select tiene_acceso_division(division_id))
  );


-- ============================================================
-- 3. Entrenamiento de hoy (sólo tipo 'entrenamiento', a su nombre)
-- ============================================================

drop policy if exists "eventos_insert_colaborador" on eventos;
create policy "eventos_insert_colaborador"
  on eventos for insert to authenticated
  with check (
    (select get_rol()) = 'colaborador'
    and tipo = 'entrenamiento'
    and creado_por = auth.uid()
    and (select tiene_acceso_division(division_id))
  );


-- ============================================================
-- 4. Asistencias: cargar y corregir (upsert de la app = insert + update)
--    El evento tiene que ser de la misma división que la fila.
-- ============================================================

drop policy if exists "asistencias_insert_colaborador" on asistencias;
create policy "asistencias_insert_colaborador"
  on asistencias for insert to authenticated
  with check (
    (select get_rol()) = 'colaborador'
    and registrado_por = auth.uid()
    and (select tiene_acceso_division(division_id))
    and division_id = (select e.division_id from eventos e where e.id = evento_id)
  );

drop policy if exists "asistencias_update_colaborador" on asistencias;
create policy "asistencias_update_colaborador"
  on asistencias for update to authenticated
  using (
    (select get_rol()) = 'colaborador'
    and (select tiene_acceso_division(division_id))
  )
  with check (
    (select get_rol()) = 'colaborador'
    and registrado_por = auth.uid()
    and (select tiene_acceso_division(division_id))
    and division_id = (select e.division_id from eventos e where e.id = evento_id)
  );
