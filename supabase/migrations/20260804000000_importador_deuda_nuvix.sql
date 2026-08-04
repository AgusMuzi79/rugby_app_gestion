-- Migration: 20260804000000_importador_deuda_nuvix
--
-- Semáforo de morosidad — importador recurrente del reporte de cuentas
-- corrientes de NUVIX (RPT_Vencimientos). El pago no pasa por la app
-- (MercadoPago descartado por la directiva); la morosidad vive en NUVIX,
-- la app sólo la refleja. Ver openspec/changes/importador-deuda-nuvix/.
--
-- Prerequisito verificado (no hace falta columna nueva): socios.numero_socio
-- ya contiene el Cód. Cliente de NUVIX — lo pobló scripts/import-socios-masivo.mjs
-- para los 1528 socios reales cargados en 2026-07-29/30.
--
-- Diseño:
--   • importaciones_deuda: una fila por archivo importado, fecha_corte UNIQUE
--     (reimportar la misma fecha reemplaza — cascade se lleva los comprobantes).
--   • comprobantes_deuda: detalle completo, socio_id nullable (Proveedores,
--     Bajas y Cesantes no matchean contra numero_socio y se guardan igual,
--     sirven para reportes de deuda total del club).
--   • socios.semaforo (+ deuda_vencida, meses_impagos, mora_max_dias,
--     deuda_actualizada_at): recalculado para TODOS los socios activos en
--     cada importación, no sólo los que aparecen en el archivo nuevo.
--   • Escritura real vía función SECURITY DEFINER (importar_deuda_nuvix),
--     invocada por la Edge Function importar-deuda con service_role — el
--     guard trigger de socios (guard_socio_update, 20260731000001) ya exime
--     conexiones service_role (auth.uid() IS NULL), sin cambios ahí.


-- ============================================================
-- 1. IMPORTACIONES_DEUDA
-- ============================================================

CREATE TABLE importaciones_deuda (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_corte       date          NOT NULL UNIQUE,
  periodo_desde     date,
  periodo_hasta     date,
  archivo_nombre    text,
  total_vencido     numeric(14,2),
  total_a_vencer    numeric(14,2),
  total_general     numeric(14,2),
  comprobantes      int,
  personas          int,
  socios_matcheados int,
  sin_match         int,
  reconcilia        boolean       NOT NULL,
  importado_por     uuid          REFERENCES profiles(id),
  created_at        timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE importaciones_deuda ENABLE ROW LEVEL SECURITY;

CREATE POLICY "secretaria_admin_all_importaciones" ON importaciones_deuda
  FOR ALL TO authenticated
  USING ((select get_rol()) IN ('secretaria', 'admin'))
  WITH CHECK ((select get_rol()) IN ('secretaria', 'admin'));


-- ============================================================
-- 2. COMPROBANTES_DEUDA
-- ============================================================

CREATE TABLE comprobantes_deuda (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  importacion_id    uuid          NOT NULL REFERENCES importaciones_deuda(id) ON DELETE CASCADE,
  socio_id          uuid          REFERENCES socios(id),
  cod_cliente       text          NOT NULL,
  nombre_origen     text,
  tipo              text,                    -- FAC | REC
  prefijo           text,
  numero            text,
  fecha             date,
  vencimiento       date,
  descripcion       text,                    -- string original NUVIX, solo trazabilidad — nunca mostrar crudo en UI
  periodo           text          CHECK (periodo ~ '^\d{4}-\d{2}$'),
  concepto          text          CHECK (concepto IN ('cuota', 'reg_cesantes', 'otro')),
  mora_dias         int,
  vencido           numeric(14,2) NOT NULL DEFAULT 0,
  a_vencer          numeric(14,2) NOT NULL DEFAULT 0,
  es_saldo_anterior boolean       NOT NULL DEFAULT false
);

CREATE INDEX comprobantes_deuda_importacion_id_idx ON comprobantes_deuda (importacion_id);
CREATE INDEX comprobantes_deuda_socio_id_idx ON comprobantes_deuda (socio_id);

ALTER TABLE comprobantes_deuda ENABLE ROW LEVEL SECURITY;

CREATE POLICY "secretaria_admin_all_comprobantes" ON comprobantes_deuda
  FOR ALL TO authenticated
  USING ((select get_rol()) IN ('secretaria', 'admin'))
  WITH CHECK ((select get_rol()) IN ('secretaria', 'admin'));

-- El socio lee sólo sus propios comprobantes (habilita una futura pantalla de
-- detalle de deuda — no hay UI todavía, ver design.md §6 de la change).
CREATE POLICY "socio_select_own_comprobantes" ON comprobantes_deuda
  FOR SELECT TO authenticated
  USING (
    socio_id IN (SELECT id FROM socios WHERE profile_id = (select auth.uid()))
  );


-- ============================================================
-- 3. SOCIOS — columnas del semáforo
-- ============================================================

ALTER TABLE socios
  ADD COLUMN semaforo              text CHECK (semaforo IN ('verde', 'amarillo', 'rojo', 'exento')),
  ADD COLUMN deuda_vencida         numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN meses_impagos         int NOT NULL DEFAULT 0,
  ADD COLUMN mora_max_dias         int NOT NULL DEFAULT 0,
  ADD COLUMN deuda_actualizada_at  timestamptz;

CREATE INDEX socios_semaforo_idx ON socios (semaforo);


-- ============================================================
-- 4. FUNCIÓN TRANSACCIONAL — importar_deuda_nuvix
--
-- Recibe el archivo ya parseado y validado (reconciliación exacta) por la
-- Edge Function. Un solo call = una sola transacción de Postgres: si algo
-- falla a mitad, todo el import se revierte solo.
--
-- No vuelve a validar reconciliación acá — la Edge Function nunca invoca
-- esta función si el archivo no reconcilió (design.md §1). El chequeo de
-- p_reconcilia es defensivo, no la fuente de verdad.
-- ============================================================

CREATE OR REPLACE FUNCTION importar_deuda_nuvix(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_importacion_id uuid;
  v_fecha_corte    date := (p_payload->>'fecha_corte')::date;
BEGIN
  IF NOT COALESCE((p_payload->>'reconcilia')::boolean, false) THEN
    RAISE EXCEPTION 'importar_deuda_nuvix: el payload no reconcilia, no se debería haber llamado a esta función';
  END IF;

  -- Idempotencia: reimportar la misma fecha de corte reemplaza (cascade se
  -- lleva los comprobantes de la importación anterior).
  DELETE FROM importaciones_deuda WHERE fecha_corte = v_fecha_corte;

  INSERT INTO importaciones_deuda (
    fecha_corte, periodo_desde, periodo_hasta, archivo_nombre,
    total_vencido, total_a_vencer, total_general,
    comprobantes, personas, socios_matcheados, sin_match,
    reconcilia, importado_por
  )
  VALUES (
    v_fecha_corte,
    NULLIF(p_payload->>'periodo_desde', '')::date,
    NULLIF(p_payload->>'periodo_hasta', '')::date,
    p_payload->>'archivo_nombre',
    (p_payload->>'total_vencido')::numeric,
    (p_payload->>'total_a_vencer')::numeric,
    (p_payload->>'total_general')::numeric,
    (p_payload->>'comprobantes_count')::int,
    (p_payload->>'personas')::int,
    (p_payload->>'socios_matcheados')::int,
    (p_payload->>'sin_match')::int,
    true,
    NULLIF(p_payload->>'importado_por', '')::uuid
  )
  RETURNING id INTO v_importacion_id;

  INSERT INTO comprobantes_deuda (
    importacion_id, socio_id, cod_cliente, nombre_origen, tipo, prefijo, numero,
    fecha, vencimiento, descripcion, periodo, concepto, mora_dias, vencido, a_vencer, es_saldo_anterior
  )
  SELECT
    v_importacion_id,
    NULLIF(c->>'socio_id', '')::uuid,
    c->>'cod_cliente',
    c->>'nombre_origen',
    c->>'tipo',
    c->>'prefijo',
    c->>'numero',
    NULLIF(c->>'fecha', '')::date,
    NULLIF(c->>'vencimiento', '')::date,
    c->>'descripcion',
    NULLIF(c->>'periodo', ''),
    c->>'concepto',
    NULLIF(c->>'mora_dias', '')::int,
    COALESCE((c->>'vencido')::numeric, 0),
    COALESCE((c->>'a_vencer')::numeric, 0),
    COALESCE((c->>'es_saldo_anterior')::boolean, false)
  FROM jsonb_array_elements(p_payload->'comprobantes') AS c;

  -- Recalcular semáforo de TODOS los socios activos — un socio que salda su
  -- deuda y no vuelve a aparecer en el archivo siguiente tiene que volver a
  -- verde. reg_cesantes se excluye del conteo de meses (plan de
  -- regularización, no cuota social). Exento gana sobre cualquier otro
  -- resultado si la categoría vigente no tiene cargo (monto_mensual = 0).
  WITH periodos_por_socio AS (
    SELECT
      socio_id,
      COUNT(DISTINCT periodo)     AS meses_impagos,
      COALESCE(SUM(vencido), 0)   AS deuda_vencida,
      COALESCE(MAX(mora_dias), 0) AS mora_max_dias
    FROM comprobantes_deuda
    WHERE importacion_id = v_importacion_id
      AND socio_id IS NOT NULL
      AND vencido > 0
      AND concepto IS DISTINCT FROM 'reg_cesantes'
    GROUP BY socio_id
  ),
  activos AS (
    SELECT id FROM socios WHERE estado = 'activo'
  )
  UPDATE socios s
  SET
    semaforo = CASE
      WHEN (SELECT cs.monto_mensual FROM categorias_socio cs WHERE cs.id = s.categoria_id) = 0 THEN 'exento'
      WHEN COALESCE(p.meses_impagos, 0) = 0 THEN 'verde'
      WHEN p.meses_impagos = 1 THEN 'amarillo'
      ELSE 'rojo'
    END,
    deuda_vencida        = COALESCE(p.deuda_vencida, 0),
    meses_impagos        = COALESCE(p.meses_impagos, 0),
    mora_max_dias         = COALESCE(p.mora_max_dias, 0),
    deuda_actualizada_at  = now()
  FROM activos
  LEFT JOIN periodos_por_socio p ON p.socio_id = activos.id
  WHERE s.id = activos.id;

  RETURN jsonb_build_object(
    'importacion_id', v_importacion_id,
    'verde',    (SELECT count(*) FROM socios WHERE estado = 'activo' AND semaforo = 'verde'),
    'amarillo', (SELECT count(*) FROM socios WHERE estado = 'activo' AND semaforo = 'amarillo'),
    'rojo',     (SELECT count(*) FROM socios WHERE estado = 'activo' AND semaforo = 'rojo'),
    'exento',   (SELECT count(*) FROM socios WHERE estado = 'activo' AND semaforo = 'exento')
  );
END;
$$;

REVOKE ALL ON FUNCTION importar_deuda_nuvix(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION importar_deuda_nuvix(jsonb) TO service_role;
