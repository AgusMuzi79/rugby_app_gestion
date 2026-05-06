-- Migration: 20260506000002_rls_policies
-- Políticas RLS para las 18 tablas del schema.
--
-- Reglas globales de acceso:
--   Subcomisión  → acceso total a todo (profiles.divisiones = null)
--   Coordinador  → lectura de su división; alta de eventos de calendario y viajes/tercer_tiempo
--   Entrenador   → escritura en asistencias, lesiones, resultados y mesa de su división
--   Manager      → escritura en cobranzas, fichajes, documentos y pedidos de su división
--
-- Convenciones de seguridad aplicadas en todas las políticas:
--   • (select get_rol())                   — activa initPlan (caché por query, hasta 100x más rápido)
--   • (select tiene_acceso_division(col))  — ídem; maneja null = acceso global
--   • to authenticated                     — nunca to public
--   • INSERT de notificaciones del sistema → Edge Functions con service role (bypassa RLS)


-- ============================================================
-- divisiones
-- Todos los roles leen. Solo Subcomisión escribe.
-- ============================================================

create policy "divisiones_select"
  on divisiones for select to authenticated
  using (true);

create policy "divisiones_insert"
  on divisiones for insert to authenticated
  with check ((select get_rol()) = 'subcomision');

create policy "divisiones_update"
  on divisiones for update to authenticated
  using ((select get_rol()) = 'subcomision');

create policy "divisiones_delete"
  on divisiones for delete to authenticated
  using ((select get_rol()) = 'subcomision');


-- ============================================================
-- profiles
-- Cada usuario lee y edita su propio perfil.
-- Subcomisión lee y gestiona todos.
-- INSERT siempre vía Edge Function con service role (bypassa RLS).
-- ============================================================

create policy "profiles_select_own"
  on profiles for select to authenticated
  using (id = auth.uid());

create policy "profiles_select_subcomision"
  on profiles for select to authenticated
  using ((select get_rol()) = 'subcomision');

create policy "profiles_update_own"
  on profiles for update to authenticated
  using (id = auth.uid());

create policy "profiles_update_subcomision"
  on profiles for update to authenticated
  using ((select get_rol()) = 'subcomision');

create policy "profiles_delete_subcomision"
  on profiles for delete to authenticated
  using ((select get_rol()) = 'subcomision');


-- ============================================================
-- push_tokens
-- Cada usuario gestiona sus propios tokens de dispositivo.
-- Edge Functions leen todos vía service role (bypassa RLS).
-- ============================================================

create policy "push_tokens_select_own"
  on push_tokens for select to authenticated
  using (usuario_id = auth.uid());

create policy "push_tokens_insert_own"
  on push_tokens for insert to authenticated
  with check (usuario_id = auth.uid());

create policy "push_tokens_update_own"
  on push_tokens for update to authenticated
  using (usuario_id = auth.uid());

create policy "push_tokens_delete_own"
  on push_tokens for delete to authenticated
  using (usuario_id = auth.uid());


-- ============================================================
-- jugadores
-- Todos los roles leen su división.
-- Manager inserta y actualiza. Subcomisión todo.
-- ============================================================

create policy "jugadores_select_subcomision"
  on jugadores for select to authenticated
  using ((select get_rol()) = 'subcomision');

create policy "jugadores_select_division"
  on jugadores for select to authenticated
  using (
    (select get_rol()) in ('coordinador', 'entrenador', 'manager')
    and (select tiene_acceso_division(division_id))
  );

create policy "jugadores_insert_manager"
  on jugadores for insert to authenticated
  with check (
    (select get_rol()) = 'manager'
    and (select tiene_acceso_division(division_id))
  );

create policy "jugadores_update_manager"
  on jugadores for update to authenticated
  using (
    (select get_rol()) = 'manager'
    and (select tiene_acceso_division(division_id))
  );

create policy "jugadores_update_subcomision"
  on jugadores for update to authenticated
  using ((select get_rol()) = 'subcomision');

create policy "jugadores_delete_subcomision"
  on jugadores for delete to authenticated
  using ((select get_rol()) = 'subcomision');


-- ============================================================
-- fichajes
-- Manager de la división crea fichajes.
-- Coordinador, Entrenador y Subcomisión leen.
-- División se verifica mediante jugadores.division_id (1 nivel de subquery).
-- ============================================================

create policy "fichajes_select_subcomision"
  on fichajes for select to authenticated
  using ((select get_rol()) = 'subcomision');

create policy "fichajes_select_division"
  on fichajes for select to authenticated
  using (
    (select get_rol()) in ('coordinador', 'entrenador', 'manager')
    and (select tiene_acceso_division(
      (select division_id from jugadores where id = jugador_id)
    ))
  );

create policy "fichajes_insert_manager"
  on fichajes for insert to authenticated
  with check (
    (select get_rol()) = 'manager'
    and registrado_por = auth.uid()
    and (select tiene_acceso_division(
      (select division_id from jugadores where id = jugador_id)
    ))
  );

create policy "fichajes_delete_subcomision"
  on fichajes for delete to authenticated
  using ((select get_rol()) = 'subcomision');


-- ============================================================
-- documentos_fichaje
-- Manager sube documentos. Todos leen su división.
-- División se verifica con join fichajes → jugadores (2 niveles).
-- ============================================================

create policy "documentos_fichaje_select_subcomision"
  on documentos_fichaje for select to authenticated
  using ((select get_rol()) = 'subcomision');

create policy "documentos_fichaje_select_division"
  on documentos_fichaje for select to authenticated
  using (
    (select get_rol()) in ('coordinador', 'entrenador', 'manager')
    and (select tiene_acceso_division(
      (select j.division_id
       from fichajes f
       join jugadores j on j.id = f.jugador_id
       where f.id = fichaje_id)
    ))
  );

create policy "documentos_fichaje_insert_manager"
  on documentos_fichaje for insert to authenticated
  with check (
    (select get_rol()) = 'manager'
    and (select tiene_acceso_division(
      (select j.division_id
       from fichajes f
       join jugadores j on j.id = f.jugador_id
       where f.id = fichaje_id)
    ))
  );

create policy "documentos_fichaje_delete_manager"
  on documentos_fichaje for delete to authenticated
  using (
    (select get_rol()) = 'manager'
    and (select tiene_acceso_division(
      (select j.division_id
       from fichajes f
       join jugadores j on j.id = f.jugador_id
       where f.id = fichaje_id)
    ))
  );

create policy "documentos_fichaje_delete_subcomision"
  on documentos_fichaje for delete to authenticated
  using ((select get_rol()) = 'subcomision');


-- ============================================================
-- eventos (calendario)
-- Todos leen su división. Coordinador y Subcomisión crean y editan.
-- Subcomisión puede crear en cualquier división (tiene_acceso_division devuelve true).
-- ============================================================

create policy "eventos_select_subcomision"
  on eventos for select to authenticated
  using ((select get_rol()) = 'subcomision');

create policy "eventos_select_division"
  on eventos for select to authenticated
  using (
    (select get_rol()) in ('coordinador', 'entrenador', 'manager')
    and (select tiene_acceso_division(division_id))
  );

create policy "eventos_insert_coordinador_subcomision"
  on eventos for insert to authenticated
  with check (
    (select get_rol()) in ('coordinador', 'subcomision')
    and (select tiene_acceso_division(division_id))
  );

create policy "eventos_update_coordinador_subcomision"
  on eventos for update to authenticated
  using (
    (select get_rol()) in ('coordinador', 'subcomision')
    and (select tiene_acceso_division(division_id))
  );

create policy "eventos_delete_subcomision"
  on eventos for delete to authenticated
  using ((select get_rol()) = 'subcomision');


-- ============================================================
-- asistencias
-- Entrenador inserta y actualiza asistencia de su división.
-- Coordinador y Subcomisión leen.
-- division_id está desnormalizado: política directa sin joins.
-- ============================================================

create policy "asistencias_select_subcomision"
  on asistencias for select to authenticated
  using ((select get_rol()) = 'subcomision');

create policy "asistencias_select_division"
  on asistencias for select to authenticated
  using (
    (select get_rol()) in ('coordinador', 'entrenador', 'manager')
    and (select tiene_acceso_division(division_id))
  );

create policy "asistencias_insert_entrenador"
  on asistencias for insert to authenticated
  with check (
    (select get_rol()) = 'entrenador'
    and registrado_por = auth.uid()
    and (select tiene_acceso_division(division_id))
  );

create policy "asistencias_update_entrenador"
  on asistencias for update to authenticated
  using (
    (select get_rol()) = 'entrenador'
    and (select tiene_acceso_division(division_id))
  );

create policy "asistencias_delete_subcomision"
  on asistencias for delete to authenticated
  using ((select get_rol()) = 'subcomision');


-- ============================================================
-- mesas_de_partido
-- Entrenador crea y edita la mesa de partidos de su división.
-- Todos leen su división.
-- División se verifica mediante eventos.division_id (1 nivel de subquery).
-- ============================================================

create policy "mesas_de_partido_select_subcomision"
  on mesas_de_partido for select to authenticated
  using ((select get_rol()) = 'subcomision');

create policy "mesas_de_partido_select_division"
  on mesas_de_partido for select to authenticated
  using (
    (select get_rol()) in ('coordinador', 'entrenador', 'manager')
    and (select tiene_acceso_division(
      (select division_id from eventos where id = evento_id)
    ))
  );

create policy "mesas_de_partido_insert_entrenador"
  on mesas_de_partido for insert to authenticated
  with check (
    (select get_rol()) = 'entrenador'
    and (select tiene_acceso_division(
      (select division_id from eventos where id = evento_id)
    ))
  );

create policy "mesas_de_partido_update_entrenador"
  on mesas_de_partido for update to authenticated
  using (
    (select get_rol()) = 'entrenador'
    and (select tiene_acceso_division(
      (select division_id from eventos where id = evento_id)
    ))
  );

create policy "mesas_de_partido_delete_subcomision"
  on mesas_de_partido for delete to authenticated
  using ((select get_rol()) = 'subcomision');


-- ============================================================
-- mesa_jugadores
-- Entrenador gestiona los jugadores de la mesa de su división.
-- División se verifica con join mesas_de_partido → eventos (2 niveles).
-- ============================================================

create policy "mesa_jugadores_select_subcomision"
  on mesa_jugadores for select to authenticated
  using ((select get_rol()) = 'subcomision');

create policy "mesa_jugadores_select_division"
  on mesa_jugadores for select to authenticated
  using (
    (select get_rol()) in ('coordinador', 'entrenador', 'manager')
    and (select tiene_acceso_division(
      (select e.division_id
       from mesas_de_partido m
       join eventos e on e.id = m.evento_id
       where m.id = mesa_id)
    ))
  );

create policy "mesa_jugadores_insert_entrenador"
  on mesa_jugadores for insert to authenticated
  with check (
    (select get_rol()) = 'entrenador'
    and (select tiene_acceso_division(
      (select e.division_id
       from mesas_de_partido m
       join eventos e on e.id = m.evento_id
       where m.id = mesa_id)
    ))
  );

create policy "mesa_jugadores_update_entrenador"
  on mesa_jugadores for update to authenticated
  using (
    (select get_rol()) = 'entrenador'
    and (select tiene_acceso_division(
      (select e.division_id
       from mesas_de_partido m
       join eventos e on e.id = m.evento_id
       where m.id = mesa_id)
    ))
  );

create policy "mesa_jugadores_delete_entrenador"
  on mesa_jugadores for delete to authenticated
  using (
    (select get_rol()) = 'entrenador'
    and (select tiene_acceso_division(
      (select e.division_id
       from mesas_de_partido m
       join eventos e on e.id = m.evento_id
       where m.id = mesa_id)
    ))
  );

create policy "mesa_jugadores_delete_subcomision"
  on mesa_jugadores for delete to authenticated
  using ((select get_rol()) = 'subcomision');


-- ============================================================
-- resultados
-- Entrenador carga y edita el resultado de partidos de su división.
-- Todos los roles leen su división.
-- División se verifica mediante eventos.division_id (1 nivel de subquery).
-- ============================================================

create policy "resultados_select_subcomision"
  on resultados for select to authenticated
  using ((select get_rol()) = 'subcomision');

create policy "resultados_select_division"
  on resultados for select to authenticated
  using (
    (select get_rol()) in ('coordinador', 'entrenador', 'manager')
    and (select tiene_acceso_division(
      (select division_id from eventos where id = evento_id)
    ))
  );

create policy "resultados_insert_entrenador"
  on resultados for insert to authenticated
  with check (
    (select get_rol()) = 'entrenador'
    and registrado_por = auth.uid()
    and (select tiene_acceso_division(
      (select division_id from eventos where id = evento_id)
    ))
  );

create policy "resultados_update_entrenador"
  on resultados for update to authenticated
  using (
    (select get_rol()) = 'entrenador'
    and (select tiene_acceso_division(
      (select division_id from eventos where id = evento_id)
    ))
  );

create policy "resultados_update_subcomision"
  on resultados for update to authenticated
  using ((select get_rol()) = 'subcomision');

create policy "resultados_delete_subcomision"
  on resultados for delete to authenticated
  using ((select get_rol()) = 'subcomision');


-- ============================================================
-- lesiones
-- Entrenador carga y edita lesiones de su división.
-- Coordinador y Subcomisión leen.
-- division_id está desnormalizado: política directa sin joins.
-- ============================================================

create policy "lesiones_select_subcomision"
  on lesiones for select to authenticated
  using ((select get_rol()) = 'subcomision');

create policy "lesiones_select_division"
  on lesiones for select to authenticated
  using (
    (select get_rol()) in ('coordinador', 'entrenador')
    and (select tiene_acceso_division(division_id))
  );

create policy "lesiones_insert_entrenador"
  on lesiones for insert to authenticated
  with check (
    (select get_rol()) = 'entrenador'
    and registrado_por = auth.uid()
    and (select tiene_acceso_division(division_id))
  );

create policy "lesiones_update_entrenador"
  on lesiones for update to authenticated
  using (
    (select get_rol()) = 'entrenador'
    and (select tiene_acceso_division(division_id))
  );

create policy "lesiones_update_subcomision"
  on lesiones for update to authenticated
  using ((select get_rol()) = 'subcomision');

create policy "lesiones_delete_subcomision"
  on lesiones for delete to authenticated
  using ((select get_rol()) = 'subcomision');


-- ============================================================
-- protocolos
-- Todos los roles autenticados leen.
-- Solo Subcomisión carga, actualiza y elimina documentos.
-- ============================================================

create policy "protocolos_select_all"
  on protocolos for select to authenticated
  using (true);

create policy "protocolos_insert_subcomision"
  on protocolos for insert to authenticated
  with check ((select get_rol()) = 'subcomision');

create policy "protocolos_update_subcomision"
  on protocolos for update to authenticated
  using ((select get_rol()) = 'subcomision');

create policy "protocolos_delete_subcomision"
  on protocolos for delete to authenticated
  using ((select get_rol()) = 'subcomision');


-- ============================================================
-- eventos_financieros
-- Subcomisión: acceso total (crea recaudaciones globales y de división, las cierra).
-- Coordinador: crea y edita viaje/tercer_tiempo de su división (no recaudacion).
-- Coordinador/Entrenador/Manager: leen su división + eventos globales (division_id null).
-- ============================================================

create policy "eventos_financieros_select_subcomision"
  on eventos_financieros for select to authenticated
  using ((select get_rol()) = 'subcomision');

create policy "eventos_financieros_select_division"
  on eventos_financieros for select to authenticated
  using (
    (select get_rol()) in ('coordinador', 'entrenador', 'manager')
    and (
      division_id is null                                    -- recaudación global: todos la ven
      or (select tiene_acceso_division(division_id))
    )
  );

-- Coordinador solo puede crear viaje/tercer_tiempo para sus divisiones (no recaudacion global).
create policy "eventos_financieros_insert_coordinador"
  on eventos_financieros for insert to authenticated
  with check (
    (select get_rol()) = 'coordinador'
    and tipo in ('viaje', 'tercer_tiempo')
    and division_id is not null
    and (select tiene_acceso_division(division_id))
  );

create policy "eventos_financieros_insert_subcomision"
  on eventos_financieros for insert to authenticated
  with check ((select get_rol()) = 'subcomision');

create policy "eventos_financieros_update_coordinador"
  on eventos_financieros for update to authenticated
  using (
    (select get_rol()) = 'coordinador'
    and division_id is not null
    and (select tiene_acceso_division(division_id))
  );

create policy "eventos_financieros_update_subcomision"
  on eventos_financieros for update to authenticated
  using ((select get_rol()) = 'subcomision');

create policy "eventos_financieros_delete_subcomision"
  on eventos_financieros for delete to authenticated
  using ((select get_rol()) = 'subcomision');


-- ============================================================
-- cobranzas
-- Manager registra y actualiza pagos de su división.
-- Coordinador y Subcomisión leen.
-- División se verifica mediante jugadores.division_id (1 nivel de subquery).
-- ============================================================

create policy "cobranzas_select_subcomision"
  on cobranzas for select to authenticated
  using ((select get_rol()) = 'subcomision');

create policy "cobranzas_select_division"
  on cobranzas for select to authenticated
  using (
    (select get_rol()) in ('coordinador', 'manager')
    and (select tiene_acceso_division(
      (select division_id from jugadores where id = jugador_id)
    ))
  );

create policy "cobranzas_insert_manager"
  on cobranzas for insert to authenticated
  with check (
    (select get_rol()) = 'manager'
    and registrado_por = auth.uid()
    and (select tiene_acceso_division(
      (select division_id from jugadores where id = jugador_id)
    ))
  );

create policy "cobranzas_update_manager"
  on cobranzas for update to authenticated
  using (
    (select get_rol()) = 'manager'
    and (select tiene_acceso_division(
      (select division_id from jugadores where id = jugador_id)
    ))
  );

create policy "cobranzas_delete_subcomision"
  on cobranzas for delete to authenticated
  using ((select get_rol()) = 'subcomision');


-- ============================================================
-- pedidos
-- Manager crea y gestiona sus propios pedidos.
-- La política de UPDATE restringe a estado = 'pendiente' en la fila actual:
-- esto impide que un pedido confirmado vuelva a pendiente.
-- Subcomisión lee y elimina todos.
-- ============================================================

create policy "pedidos_select_subcomision"
  on pedidos for select to authenticated
  using ((select get_rol()) = 'subcomision');

create policy "pedidos_select_own"
  on pedidos for select to authenticated
  using (
    (select get_rol()) = 'manager'
    and manager_id = auth.uid()
  );

create policy "pedidos_insert_manager"
  on pedidos for insert to authenticated
  with check (
    (select get_rol()) = 'manager'
    and manager_id = auth.uid()
  );

-- using() evalúa el estado ACTUAL de la fila antes del update.
-- Si ya está 'confirmado', la condición falla y el update es rechazado.
create policy "pedidos_update_own"
  on pedidos for update to authenticated
  using (
    (select get_rol()) = 'manager'
    and manager_id = auth.uid()
    and estado = 'pendiente'
  );

create policy "pedidos_delete_subcomision"
  on pedidos for delete to authenticated
  using ((select get_rol()) = 'subcomision');


-- ============================================================
-- items_pedido
-- Manager gestiona ítems de sus propios pedidos mientras están pendientes.
-- Acceso derivado de pedidos.manager_id y pedidos.estado.
-- Subcomisión lee y elimina todos.
-- ============================================================

create policy "items_pedido_select_subcomision"
  on items_pedido for select to authenticated
  using ((select get_rol()) = 'subcomision');

create policy "items_pedido_select_own"
  on items_pedido for select to authenticated
  using (
    (select get_rol()) = 'manager'
    and (select manager_id from pedidos where id = pedido_id) = auth.uid()
  );

create policy "items_pedido_insert_manager"
  on items_pedido for insert to authenticated
  with check (
    (select get_rol()) = 'manager'
    and (select manager_id from pedidos where id = pedido_id) = auth.uid()
    and (select estado from pedidos where id = pedido_id) = 'pendiente'
  );

create policy "items_pedido_delete_manager"
  on items_pedido for delete to authenticated
  using (
    (select get_rol()) = 'manager'
    and (select manager_id from pedidos where id = pedido_id) = auth.uid()
    and (select estado from pedidos where id = pedido_id) = 'pendiente'
  );

create policy "items_pedido_delete_subcomision"
  on items_pedido for delete to authenticated
  using ((select get_rol()) = 'subcomision');


-- ============================================================
-- notificaciones
-- Cada usuario ve las notificaciones donde es destinatario.
-- Subcomisión ve e inserta todas (notificaciones manuales).
-- Notificaciones del sistema → Edge Functions con service role (bypassa RLS).
-- ============================================================

create policy "notificaciones_select_subcomision"
  on notificaciones for select to authenticated
  using ((select get_rol()) = 'subcomision');

-- exists() con índice compuesto (notificacion_id, usuario_id) es eficiente.
create policy "notificaciones_select_destinatario"
  on notificaciones for select to authenticated
  using (
    exists (
      select 1 from notificaciones_destinatarios
      where notificacion_id = notificaciones.id
        and usuario_id = auth.uid()
    )
  );

create policy "notificaciones_insert_subcomision"
  on notificaciones for insert to authenticated
  with check ((select get_rol()) = 'subcomision');

create policy "notificaciones_delete_subcomision"
  on notificaciones for delete to authenticated
  using ((select get_rol()) = 'subcomision');


-- ============================================================
-- notificaciones_destinatarios
-- Cada usuario lee y actualiza sus propias entradas (marcar como leída).
-- Subcomisión inserta destinatarios de notificaciones manuales.
-- INSERT del sistema → Edge Functions con service role.
-- ============================================================

create policy "notificaciones_destinatarios_select_own"
  on notificaciones_destinatarios for select to authenticated
  using (usuario_id = auth.uid());

create policy "notificaciones_destinatarios_select_subcomision"
  on notificaciones_destinatarios for select to authenticated
  using ((select get_rol()) = 'subcomision');

create policy "notificaciones_destinatarios_insert_subcomision"
  on notificaciones_destinatarios for insert to authenticated
  with check ((select get_rol()) = 'subcomision');

-- Usuario solo puede actualizar sus propias entradas (marcar como leída).
create policy "notificaciones_destinatarios_update_own"
  on notificaciones_destinatarios for update to authenticated
  using (usuario_id = auth.uid());

create policy "notificaciones_destinatarios_delete_subcomision"
  on notificaciones_destinatarios for delete to authenticated
  using ((select get_rol()) = 'subcomision');


-- ============================================================
-- ÍNDICES ADICIONALES para políticas de esta migración
-- Los índices de columnas FK ya existen en la migración del schema.
-- Se agregan solo los nuevos que surgen de patrones de esta migración.
-- ============================================================

-- exists() en notificaciones_destinatarios para la política de notificaciones_select_destinatario.
-- El índice simple (notificacion_id) ya existe; se agrega el compuesto para cubrir ambas columnas.
create index if not exists idx_notif_dest_notif_usuario
  on notificaciones_destinatarios (notificacion_id, usuario_id);
