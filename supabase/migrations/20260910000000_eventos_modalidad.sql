-- Migration: 20260910000000_eventos_modalidad
--
-- Pedido del coordinador de tenis (2026-09-10): un partido puede jugarse
-- "singles" o "dobles" — dato nuevo, sin equivalente en rugby/hockey, por eso
-- va como columna opcional en vez de un campo obligatorio. NULL para
-- entrenamientos y para cualquier partido de rugby/hockey donde no aplica.

alter table eventos
  add column modalidad text check (modalidad in ('singles', 'dobles'));
