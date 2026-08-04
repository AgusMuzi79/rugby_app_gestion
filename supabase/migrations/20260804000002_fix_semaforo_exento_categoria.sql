-- Migration: 20260804000002_fix_semaforo_exento_categoria
--
-- Segundo fix descubierto probando 20260804000001 en producción: con
-- "vigentes" corregido (activo+pendiente), el resultado dio
-- rojo 77 / amarillo 79 / verde 719 / exento 653 — exento explotó porque
-- "exento" estaba definido como cualquier categoría con monto_mensual = 0,
-- y esa condición también incluye "Dependiente Grupo Familiar" (654 socios
-- están en esa categoría — el grueso del club son dependientes de un
-- titular). Verificado en supabase/migrations/20260714000000: esa categoría
-- es $0 porque "Se factura a través del titular del grupo" — no porque el
-- dependiente esté eximido de deuda. Su propia cuenta puede perfectamente
-- tener comprobantes en NUVIX (o no tener ninguno, lo cual da verde
-- correctamente por el camino normal, no por exención).
--
-- "Exento" debería ser sólo las categorías genuinamente sin cargo:
-- Vitalicio, Becado Rugby, Becado Hockey, Becado Tenis. Fix: filtrar por
-- nombre de categoría en vez de monto_mensual = 0.

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
      WHEN (SELECT cs.nombre FROM categorias_socio cs WHERE cs.id = s.categoria_id)
           IN ('Vitalicio', 'Becado Rugby', 'Becado Hockey', 'Becado Tenis') THEN 'exento'
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
