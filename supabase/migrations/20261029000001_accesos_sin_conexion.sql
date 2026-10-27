-- Migration: 20261029000001_accesos_sin_conexion
--
-- Auditoría portería T4 (decisión 2026-10-26, opción b): sin conexión, la tablet deja
-- pasar, encola el escaneo crudo y lo manda cuando vuelve la red. socios-qr (acción
-- registrar-offline) lo valida a posteriori y lo registra acá:
--   · sin_conexion = true: el ingreso se dejó pasar sin validar en el momento (el
--     panel lo marca "SIN CONEXIÓN"). Si la validación posterior falla (código
--     inválido, sin servicio, dado de baja) la fila va además con denegado = true y
--     motivo_rechazo (20261029000000): la persona entró, pero sin un carnet válido.
--   · creado_en = la hora del escaneo en la tablet (no la de la sincronización).
--   · id_cola: id que generó la tablet para ese escaneo. Único: un lote reintentado
--     (la respuesta se perdió) no duplica filas (ON CONFLICT DO NOTHING).
--
-- Default false / null: las filas existentes no cambian. Requiere 20261029000000.
-- Orden de deploy: esta migración ANTES que socios-qr. Idempotente.

alter table accesos
  add column if not exists sin_conexion boolean not null default false;

alter table accesos
  add column if not exists id_cola text;

-- No parcial: ON CONFLICT (id_cola) necesita un índice único que lo cubra tal cual.
-- Los null (todos los ingresos en línea) no chocan entre sí.
create unique index if not exists accesos_id_cola_uq on accesos (id_cola);
