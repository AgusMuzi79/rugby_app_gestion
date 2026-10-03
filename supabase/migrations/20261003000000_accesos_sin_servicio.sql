-- Migration: 20261003000000_accesos_sin_servicio
--
-- Marca los escaneos de socios SIN servicio Gimnasio contratado. Hasta ahora
-- `socios-qr` devolvía el aviso en el Lector pero no insertaba nada en
-- `accesos`, así que el panel web no veía esos intentos. Ahora se registra la
-- fila con `sin_servicio = true` (el aviso en la tablet no cambia).
--
-- Default false: todas las filas existentes son ingresos de socios con servicio.

alter table accesos
  add column sin_servicio boolean not null default false;
