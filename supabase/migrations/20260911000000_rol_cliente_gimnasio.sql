-- Migration: 20260911000000_rol_cliente_gimnasio
--
-- Nuevo rol "Cliente Gimnasio" (2026-09-11) — pedido del tesorero: clientes
-- de gimnasio que no son socios del club puedan acceder a la app pero
-- ÚNICAMENTE ver su carnet digital (nada de cuotas/noticias/calendario).
--
-- Siguen siendo filas de `socios` (reusan el semáforo de deuda, el
-- importador de vencimientos NUVIX y el mecanismo de carnet QR/TOTP que ya
-- existe — Agus señaló que tanto el Padrón Extendido como el reporte de
-- vencimientos ya traen a estos clientes con la misma estructura que un
-- socio real). La separación "sólo ve el carnet" se resuelve con el ROL, no
-- con una tabla aparte: `rol`/`roles` = 'cliente_gimnasio' en vez de
-- 'socio', así las políticas RLS de noticias/cuotas (que chequean
-- get_rol()='socio' explícitamente) los excluyen solas, y en el mobile van
-- a un grupo de rutas nuevo y mínimo que sólo tiene la pantalla de carnet.

alter table profiles drop constraint profiles_rol_check;
alter table profiles add constraint profiles_rol_check
  check (rol = any (array[
    'subcomision', 'coordinador', 'entrenador', 'manager', 'admin',
    'secretaria', 'porteria', 'canchero', 'buffet', 'cliente_gimnasio', 'socio'
  ]));

alter table profiles drop constraint profiles_roles_check;
alter table profiles add constraint profiles_roles_check
  check (roles <@ array[
    'subcomision', 'coordinador', 'entrenador', 'manager', 'admin',
    'secretaria', 'porteria', 'canchero', 'buffet', 'cliente_gimnasio', 'socio'
  ]);

-- Categoría $0 (sólo diferenciador, igual que "Dependiente Grupo Familiar")
-- — la deuda real de estos clientes la trae el reporte de vencimientos, no
-- esta categoría.
insert into categorias_socio (nombre, monto_mensual, activa)
select 'Cliente Gimnasio', 0, true
where not exists (select 1 from categorias_socio where nombre = 'Cliente Gimnasio');
