-- Migration: 20261003000001_accesos_invitados
--
-- Invitados en el gimnasio: personas que no son socios (o no tienen el servicio)
-- y entran igual. El Lector/entrenador los registra por DNI (nombre opcional)
-- para poder detectar repetidos y derivarlos a Secretaría.
--
-- Un invitado no tiene fila en `socios`, así que `socio_id` pasa a ser
-- nullable; el CHECK garantiza que toda fila tenga al menos una identidad
-- (socio o DNI de invitado). El FK a socios mantiene su `on delete cascade`.
-- `semaforo` ya era nullable y queda null para invitados (no hay cuota).
--
-- Se inserta desde `socios-qr` (acción `registrar-invitado`) con service_role,
-- igual que el resto de `accesos` — sin policy de INSERT para clientes.

alter table accesos
  alter column socio_id drop not null;

alter table accesos
  add column es_invitado     boolean not null default false,
  add column invitado_dni    text,
  add column invitado_nombre text;

alter table accesos
  add constraint accesos_socio_o_invitado_check
  check (socio_id is not null or invitado_dni is not null);

-- Conteo de repeticiones por DNI en los últimos 30 días.
create index accesos_invitado_dni_idx on accesos (invitado_dni)
  where invitado_dni is not null;
