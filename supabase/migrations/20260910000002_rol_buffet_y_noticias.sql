-- Migration: 20260910000002_rol_buffet_y_noticias
--
-- Nuevo rol "Buffet" (2026-09-10) — pedido de Agus: tiene que ser un Lector
-- (escanea QR, ve datos/semáforo, historial en `accesos` con punto='buffet')
-- y además puede publicar sus propias noticias/promociones. Siempre
-- audiencia='todos' (todos los socios) y sin etiqueta de deporte — nunca
-- elige nada de esto, el formulario ni se lo va a ofrecer, pero se refuerza
-- acá con RLS (mismo criterio que los guard triggers de profiles/cuotas/
-- socios: no confiar sólo en que el cliente mande los valores correctos).
--
-- De paso, a pedido explícito de Agus: Secretaría deja de poder mandar
-- noticias con audiencia='cuerpo_tecnico' (opción que tenía en el panel
-- web) — sus noticias son siempre para los socios. Subcomisión/admin no
-- se tocan, siguen pudiendo elegir cuerpo_tecnico.

alter table profiles drop constraint profiles_rol_check;
alter table profiles add constraint profiles_rol_check
  check (rol = any (array[
    'subcomision', 'coordinador', 'entrenador', 'manager', 'admin',
    'secretaria', 'porteria', 'canchero', 'buffet', 'socio'
  ]));

alter table profiles drop constraint profiles_roles_check;
alter table profiles add constraint profiles_roles_check
  check (roles <@ array[
    'subcomision', 'coordinador', 'entrenador', 'manager', 'admin',
    'secretaria', 'porteria', 'canchero', 'buffet', 'socio'
  ]);

-- ─── Secretaría: sólo audiencia='todos' al crear noticias ─────────────────────

drop policy "noticias_insert_staff" on noticias;

create policy "noticias_insert_staff" on noticias
  for insert to authenticated
  with check ((select get_rol()) in ('subcomision', 'admin'));

create policy "noticias_insert_secretaria" on noticias
  for insert to authenticated
  with check ((select get_rol()) = 'secretaria' and audiencia = 'todos');

-- ─── Buffet: sólo sus propias promos, siempre audiencia='todos' sin deporte ───

create policy "noticias_select_buffet_own" on noticias
  for select to authenticated
  using ((select get_rol()) = 'buffet' and autor_id = auth.uid());

create policy "noticias_insert_buffet" on noticias
  for insert to authenticated
  with check (
    (select get_rol()) = 'buffet'
    and autor_id = auth.uid()
    and audiencia = 'todos'
    and coalesce(array_length(etiquetas, 1), 0) = 0
  );

create policy "noticias_update_buffet_own" on noticias
  for update to authenticated
  using ((select get_rol()) = 'buffet' and autor_id = auth.uid())
  with check (audiencia = 'todos' and coalesce(array_length(etiquetas, 1), 0) = 0);

create policy "noticias_delete_buffet_own" on noticias
  for delete to authenticated
  using ((select get_rol()) = 'buffet' and autor_id = auth.uid());
