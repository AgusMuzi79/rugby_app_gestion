-- Migration: 20260804000003_activar_socios_carga_masiva
--
-- Los 1528 socios de la carga masiva (scripts/import-socios-masivo.mjs,
-- 2026-07-29/30) quedaron en estado='pendiente' porque el flujo normal de
-- alta requiere que el socio suba su foto y secretaría la valide — pero la
-- carga masiva no trajo fotos desde NUVIX (foto_path queda NULL), así que
-- ese botón de validación ni aparece. Nadie puede resolverlo salvo que cada
-- socio entre a la app y suba su foto por su cuenta, algo que no va a pasar
-- para 1528 personas en un plazo razonable.
--
-- Encontrado 2026-08-04 al debuguear el semáforo de morosidad (el fix de
-- ahí ya contempla estado IN ('activo','pendiente'), pero cualquier otro
-- lugar del código que filtre estrictamente por 'activo' seguiría
-- ignorando a todo el club real).
--
-- Decisión de Agus (2026-08-04): son socios reales verificados desde el
-- propio sistema del club (no altas orgánicas sin verificar) — se activan
-- en bloque, sin foto validada. El gate de foto sigue estricto para altas
-- nuevas de acá en adelante (admin-socios / validate-photo sin cambios).
-- foto_validada se deja como está (false) — no se está afirmando que la
-- foto está validada, sólo que el socio es un miembro vigente del club.
--
-- Verificado antes de aplicar (supabase db query --linked): los 1528
-- socios en estado='pendiente' tienen created_at = 2026-07-29 exacto, cero
-- socios en otro estado — el filtro por fecha alcanza para acotar
-- exactamente al lote de la carga masiva sin tocar altas manuales futuras.

UPDATE socios
SET estado = 'activo'
WHERE estado = 'pendiente'
  AND created_at::date = '2026-07-29';
