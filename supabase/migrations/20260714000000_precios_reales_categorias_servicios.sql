-- Migration: precios reales de categorias_socio y servicios_opcionales
-- Reemplaza los placeholders de seed por los montos reales del club (Abril 2026),
-- provistos por Agus desde el sistema de gestión del club.

-- ─── categorias_socio ──────────────────────────────────────────────────────
-- El placeholder "Activo" ya tiene 8 socios de testeo referenciándolo (FK) —
-- se renombra/reprecia en vez de borrarlo. El resto de los placeholders
-- ("Adherente", "Juvenil", "Vitalicio") no tienen referencias y se reemplazan.

UPDATE categorias_socio
   SET nombre = 'Activo Mayor', monto_mensual = 50000.00
 WHERE nombre = 'Activo';

DELETE FROM categorias_socio WHERE nombre IN ('Adherente', 'Juvenil', 'Vitalicio');

INSERT INTO categorias_socio (nombre, descripcion, monto_mensual) VALUES
  ('Activo Menor',               NULL, 25000.00),
  ('Dependiente Grupo Familiar', 'Se factura a través del titular del grupo', 0.00),
  ('Titular de Grupo',           NULL, 60000.00),
  ('Activo Unquitas',            NULL, 12500.00),
  ('Vitalicio',                  NULL, 0.00),
  ('Becado Rugby',               '100% de beca', 0.00),
  ('Becado Hockey',              '100% de beca', 0.00),
  ('Becado Tenis',               '100% de beca', 0.00);

-- ─── servicios_opcionales ──────────────────────────────────────────────────

UPDATE servicios_opcionales SET monto_mensual = 18750.00 WHERE nombre = 'Gimnasio';
UPDATE servicios_opcionales SET monto_mensual = 25000.00 WHERE nombre = 'Rugby';
UPDATE servicios_opcionales SET monto_mensual = 31250.00 WHERE nombre = 'Hockey';
UPDATE servicios_opcionales SET monto_mensual = 25000.00 WHERE nombre = 'Tenis';
