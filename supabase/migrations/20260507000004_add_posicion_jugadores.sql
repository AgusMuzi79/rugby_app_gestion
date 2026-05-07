-- Add posicion field to jugadores
ALTER TABLE jugadores ADD COLUMN IF NOT EXISTS posicion text;

-- Create fichajes storage bucket (private, max 10 MB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fichajes',
  'fichajes',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
