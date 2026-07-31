-- Migration: 20260731000002_fix_comprobantes_bucket_socio
--
-- Hallazgo #5 de la auditoría pre-producción (2026-07-31, parte comprobantes):
-- el bucket 'comprobantes' solo aceptaba 'application/pdf' (pensado para el PDF
-- que generaba la Edge Function de Mercado Pago), pero useCuotas.ts sube una
-- foto JPG del comprobante de transferencia. Además nunca existió policy de
-- INSERT/UPDATE para el socio — el comentario original decía "solo service
-- role, no hay policy de INSERT", pero el flujo de alias+comprobante (agregado
-- después, migration 20260624000001) sí necesita que el socio suba directo.


-- ── Ampliar mime types permitidos ────────────────────────────────────────────

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png']
WHERE id = 'comprobantes';


-- ── INSERT/UPDATE: socio sube su propio comprobante ──────────────────────────
-- Path: {socio_id}/{periodo}.jpg — mismo folder-scoping que socios-fotos.

CREATE POLICY "comprobantes_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'comprobantes'
    AND (SELECT get_rol()) = 'socio'
    AND (storage.foldername(name))[1] = (SELECT get_socio_id())::text
  );

CREATE POLICY "comprobantes_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'comprobantes'
    AND (SELECT get_rol()) = 'socio'
    AND (storage.foldername(name))[1] = (SELECT get_socio_id())::text
  );
