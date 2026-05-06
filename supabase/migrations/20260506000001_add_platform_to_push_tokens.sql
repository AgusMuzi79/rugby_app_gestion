-- Migration: 20260506000001_add_platform_to_push_tokens
-- Agrega columna plataforma a push_tokens para filtrar/debuggear entregas por dispositivo.

alter table push_tokens
  add column plataforma text check (plataforma in ('ios', 'android', 'web'));
