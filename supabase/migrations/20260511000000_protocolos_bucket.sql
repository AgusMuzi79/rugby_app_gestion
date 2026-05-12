-- ============================================================
-- Bucket de Storage para protocolos de lesión
-- La tabla protocolos y sus RLS ya existen desde las migraciones anteriores.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'protocolos',
  'protocolos',
  false,
  52428800,   -- 50 MB
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO NOTHING;


-- ── Policies de storage.objects ────────────────────────────────────────────────

-- Todos los roles autenticados pueden descargar
CREATE POLICY "protocolos_storage_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'protocolos');

-- Solo Subcomisión puede subir
CREATE POLICY "protocolos_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'protocolos'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND rol = 'subcomision'
    )
  );

-- Solo Subcomisión puede eliminar
CREATE POLICY "protocolos_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'protocolos'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND rol = 'subcomision'
    )
  );
