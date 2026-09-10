-- Migration: 20260910000001_rol_canchero
--
-- Nuevo rol "Canchero" (2026-09-10) — pedido de Agus: por ahora funciona
-- exactamente igual que "Lector" (rol='porteria'): escanea el carnet QR,
-- ve datos/semáforo del socio, fallback por DNI, historial en `accesos`.
-- Se separa de Lector como rol propio (no un atributo de zona) porque a
-- futuro va a leer/gestionar turnos de cancha reservados — funcionalidad
-- que Lector (rugby/hockey/gimnasio) nunca va a tener. Ver memoria de
-- proyecto project-control-accesos-puntos / project-backlog-gestor-alquileres.

alter table profiles drop constraint profiles_rol_check;
alter table profiles add constraint profiles_rol_check
  check (rol = any (array[
    'subcomision', 'coordinador', 'entrenador', 'manager', 'admin',
    'secretaria', 'porteria', 'canchero', 'socio'
  ]));

alter table profiles drop constraint profiles_roles_check;
alter table profiles add constraint profiles_roles_check
  check (roles <@ array[
    'subcomision', 'coordinador', 'entrenador', 'manager', 'admin',
    'secretaria', 'porteria', 'canchero', 'socio'
  ]);
