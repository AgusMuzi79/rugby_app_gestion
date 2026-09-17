-- Migration: 20260917000000_buffet_promos_imagenes
--
-- Buffet puede adjuntar una imagen a sus promos (pedido de Agus, 2026-09-17).
-- El bucket 'noticias-imagenes' y la columna noticias.imagen_path ya existían
-- (20260601000002_socios_storage) pero sin ningún flujo real que los usara
-- todavía en ningún rol.
--
-- Convención de path para Buffet: {auth.uid()}/{filename} — su propia carpeta,
-- igual que socios-fotos. Evita la necesidad de crear la noticia antes de
-- poder subir la imagen (a diferencia de {noticia_id}/{filename}, que
-- requeriría un paso intermedio): el cliente sube la imagen primero, con la
-- publicación en un solo insert después.

create policy "noticias_imagenes_insert_buffet" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'noticias-imagenes'
    and (select get_rol()) = 'buffet'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "noticias_imagenes_delete_buffet" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'noticias-imagenes'
    and (select get_rol()) = 'buffet'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
