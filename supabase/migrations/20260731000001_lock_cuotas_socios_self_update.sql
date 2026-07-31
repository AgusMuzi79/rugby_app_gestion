-- Migration: 20260731000001_lock_cuotas_socios_self_update
--
-- Hallazgos #2 y #3 de la auditoría pre-producción (2026-07-31):
-- mismo patrón que profiles_update_own (ver 20260731000000) — las policies
-- de "propio registro" en cuotas y socios permiten UPDATE de la fila sin
-- restringir columnas, así que el socio puede escribir cualquier campo.
--
-- #2. cuotas_update_own_comprobante (20260624000001) — el socio puede hacer
--     UPDATE cuotas SET estado='pagado' o SET monto=0 en su propia cuota.
--     El único uso legítimo del cliente (useCuotas.ts → subirComprobante) es
--     SET estado='en_revision', comprobante_path=... sobre una cuota 'pendiente'.
--
-- #3. socios_update_own_foto (20260624000000) — el socio puede hacer
--     UPDATE socios SET foto_validada=true, estado='activo', categoria_id=...
--     El único uso legítimo del cliente (useSobre.ts → cambiarFoto) es
--     SET foto_path=..., foto_validada=false.
--
-- Fix: triggers BEFORE UPDATE, mismo diseño que guard_profiles_role_update —
-- exentos: conexiones service_role (auth.uid() IS NULL, todas las Edge
-- Functions) y staff con policy de UPDATE propia sobre la tabla.


-- ============================================================
-- cuotas
-- ============================================================

CREATE OR REPLACE FUNCTION guard_cuota_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- secretaria/admin: acceso total (cuotas_update_staff)
  IF get_rol() IN ('secretaria', 'admin') THEN
    RETURN NEW;
  END IF;

  -- el propio socio: nunca puede tocar monto/periodo/socio_id
  IF NEW.monto    IS DISTINCT FROM OLD.monto
     OR NEW.periodo  IS DISTINCT FROM OLD.periodo
     OR NEW.socio_id IS DISTINCT FROM OLD.socio_id
  THEN
    RAISE EXCEPTION 'No autorizado para modificar ese campo de la cuota';
  END IF;

  -- único cambio de estado permitido: declarar comprobante sobre una cuota pendiente
  IF NEW.estado IS DISTINCT FROM OLD.estado
     AND NOT (OLD.estado = 'pendiente' AND NEW.estado = 'en_revision')
  THEN
    RAISE EXCEPTION 'No autorizado para cambiar el estado de la cuota a %', NEW.estado;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_cuotas_update ON cuotas;

CREATE TRIGGER guard_cuotas_update
  BEFORE UPDATE ON cuotas
  FOR EACH ROW EXECUTE FUNCTION guard_cuota_update();


-- ============================================================
-- socios
-- ============================================================

CREATE OR REPLACE FUNCTION guard_socio_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- secretaria/subcomision/admin: acceso total (socios_update_staff)
  IF get_rol() IN ('secretaria', 'subcomision', 'admin') THEN
    RETURN NEW;
  END IF;

  -- el propio socio: nunca puede autovalidarse la foto
  IF NEW.foto_validada IS DISTINCT FROM OLD.foto_validada AND NEW.foto_validada THEN
    RAISE EXCEPTION 'No autorizado para autovalidar la foto';
  END IF;

  -- ni tocar ningún otro campo salvo foto_path/foto_validada
  IF (NEW.estado, NEW.categoria_id, NEW.dni, NEW.numero_socio, NEW.profile_id,
      NEW.cabecera_id, NEW.fecha_nacimiento, NEW.mp_customer_id, NEW.mp_card_id,
      NEW.mp_card_last_four, NEW.mp_card_brand, NEW.mp_card_retries, NEW.mp_card_retry_at)
     IS DISTINCT FROM
     (OLD.estado, OLD.categoria_id, OLD.dni, OLD.numero_socio, OLD.profile_id,
      OLD.cabecera_id, OLD.fecha_nacimiento, OLD.mp_customer_id, OLD.mp_card_id,
      OLD.mp_card_last_four, OLD.mp_card_brand, OLD.mp_card_retries, OLD.mp_card_retry_at)
  THEN
    RAISE EXCEPTION 'No autorizado para modificar ese campo del socio';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_socios_update ON socios;

CREATE TRIGGER guard_socios_update
  BEFORE UPDATE ON socios
  FOR EACH ROW EXECUTE FUNCTION guard_socio_update();
