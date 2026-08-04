-- Migration: 20260804000001_fix_semaforo_incluye_pendiente
--
-- Fix descubierto al probar la migración 20260804000000 contra el archivo
-- real en producción (todos_desde_el_2022.xls, vía la Edge Function
-- importar-deuda ya deployada): el semáforo dio 0/0/0/0 en los 1528 socios
-- reales de la carga masiva.
--
-- Causa: importar_deuda_nuvix() filtraba "socios activos" por
-- estado = 'activo' — literal al pedido original ("quedarse sólo con
-- socios activos"). Pero estado='activo' en este schema significa "foto de
-- carnet validada", un paso manual de secretaría que nunca se hizo en bulk
-- para los 1528 socios importados (quedaron en 'pendiente', el default de
-- import-socios-masivo.mjs). Verificado en el panel web /secretaria/socios
-- filtrando por ACTIVO: 0 resultados.
--
-- "Socios activos" en el sentido de negocio (miembros vigentes del club,
-- no dados de baja) != socios.estado = 'activo' (onboarding de la app).
-- Decisión de Agus (2026-08-04): el semáforo participa para
-- estado IN ('activo', 'pendiente') — sólo se excluye 'inactivo' (baja) e
-- implícitamente 'moroso' (legacy del flujo de tarjeta descartado, no debería
-- quedar ningún socio real en ese estado).
--
-- CREATE OR REPLACE del mismo cuerpo con el filtro corregido — no cambia
-- la firma ni las policies/grants de la migración anterior.

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

  -- Recalcular semáforo de TODOS los socios "vigentes" (activo o pendiente
  -- de validar foto — no dados de baja). Ver nota arriba: no es lo mismo
  -- que estado='activo'.
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
  vigentes AS (
    SELECT id FROM socios WHERE estado IN ('activo', 'pendiente')
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
  FROM vigentes
  LEFT JOIN periodos_por_socio p ON p.socio_id = vigentes.id
  WHERE s.id = vigentes.id;

  RETURN jsonb_build_object(
    'importacion_id', v_importacion_id,
    'verde',    (SELECT count(*) FROM socios WHERE estado IN ('activo', 'pendiente') AND semaforo = 'verde'),
    'amarillo', (SELECT count(*) FROM socios WHERE estado IN ('activo', 'pendiente') AND semaforo = 'amarillo'),
    'rojo',     (SELECT count(*) FROM socios WHERE estado IN ('activo', 'pendiente') AND semaforo = 'rojo'),
    'exento',   (SELECT count(*) FROM socios WHERE estado IN ('activo', 'pendiente') AND semaforo = 'exento')
  );
END;
$$;
