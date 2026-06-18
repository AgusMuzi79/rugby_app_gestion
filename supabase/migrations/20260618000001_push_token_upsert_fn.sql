-- Migration: 20260618000001_push_token_upsert_fn
-- Función SECURITY DEFINER para registrar push tokens de forma confiable.
-- Bypass RLS: borra cualquier fila con el mismo token (independiente del owner)
-- e inserta la nueva. Protección: solo el caller puede registrar su propio token.

CREATE OR REPLACE FUNCTION register_push_token(
  p_token      TEXT,
  p_plataforma TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM push_tokens WHERE token = p_token;
  INSERT INTO push_tokens (usuario_id, token, plataforma)
  VALUES (auth.uid(), p_token, p_plataforma);
END;
$$;

GRANT EXECUTE ON FUNCTION register_push_token(TEXT, TEXT) TO authenticated;
