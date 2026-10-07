-- Migration: 20261010000000_deuda_debito_antes_del_22
--
-- Socios con débito automático (socios.cobro_con_tarjeta = true) no figuran
-- como deudores de la cuota del mes antes de que se les cobre el débito.
--
-- Problema (2026-10-07): Secretaría importó el reporte NUVIX el día del
-- vencimiento de la cuota de octubre. 119 de los 122 socios avisados debían
-- sólo octubre y 98 de ellos pagan por débito automático, que recién se cobra
-- el 15/10 (fechas_debito_automatico). Para el semáforo y la app aparecían
-- como deudores de algo que todavía no se les podía haber cobrado.
--
-- Cambio: si la fecha de corte es anterior al corte del débito del mes
-- (fecha de débito cargada por Secretaría en fechas_debito_automatico + 3
-- días de margen para que NUVIX registre el cobro; si no hay fecha cargada
-- ese mes, el día 22), los comprobantes de este import de concepto 'cuota'
-- del período de la fecha de corte, con vencido > 0, de socios con débito
-- automático, se reclasifican como "a vencer": vencido pasa a a_vencer,
-- mora_dias = 0 y vencimiento = la fecha de débito de ese mes (o el día 22).
-- Si la fecha de corte cae dentro de los 3 días de margen (el débito ya pasó
-- pero NUVIX todavía no lo registra), el vencimiento es la fecha de corte:
-- GREATEST(fecha de débito, fecha de corte), para no mostrar "a vencer" con
-- una fecha pasada.
-- Se hace antes de calcular el semáforo, así que ese socio queda verde si no
-- debe otra cosa. La app ya muestra a_vencer en "PRÓXIMOS VENCIMIENTOS —
-- Vence el …" (app/hooks/useDeudaDetalle.ts), no hace falta build mobile.
--
-- Desde el corte no se reclasifica nada: el débito ya se cobró y quien sigue
-- debiendo la cuota del mes (débito rechazado) queda amarillo, igual que
-- antes. El corte depende de la fecha del débito y no del día 22 porque
-- Secretaría importa el reporte todos los días y el aviso del 22 sale a las
-- 10:00, antes del import de ese día: usa el reporte del 21, que tiene que
-- mostrar ya como deuda los débitos rechazados.
--
-- El 22 de respaldo coincide con el día del aviso de deuda
-- (DIA_AVISO_DEUDA en supabase/functions/_shared/recordatorio-deuda.ts).
-- Las fechas de débito cargadas son <= 17 (corte <= 20).
--
-- importaciones_deuda.total_vencido / total_a_vencer quedan como los informa
-- NUVIX (son la reconciliación contra el Total General del archivo); la
-- reclasificación sólo toca comprobantes_deuda y lo que se deriva de ella.
--
-- Resto de la función: idéntica a 20260804000002_fix_semaforo_exento_categoria.sql.

CREATE OR REPLACE FUNCTION importar_deuda_nuvix(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_importacion_id uuid;
  v_fecha_corte    date := (p_payload->>'fecha_corte')::date;
  -- Días después de la fecha de débito hasta que NUVIX refleja el cobro.
  c_margen_debito_dias CONSTANT int := 3;
  -- Día de respaldo si Secretaría no cargó la fecha de débito del mes.
  c_dia_debito_respaldo CONSTANT int := 22;
  v_fecha_debito   date;
  v_corte_debito   date;
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

  -- Débito automático todavía sin cobrar: la cuota del mes es "a vencer".
  SELECT min(f.fecha) INTO v_fecha_debito
    FROM fechas_debito_automatico f
   WHERE to_char(f.fecha, 'YYYY-MM') = to_char(v_fecha_corte, 'YYYY-MM');
  v_corte_debito := COALESCE(
    v_fecha_debito + c_margen_debito_dias,
    make_date(
      extract(year FROM v_fecha_corte)::int,
      extract(month FROM v_fecha_corte)::int,
      c_dia_debito_respaldo
    )
  );

  IF v_fecha_corte < v_corte_debito THEN
    UPDATE comprobantes_deuda cd
    SET
      a_vencer    = cd.a_vencer + cd.vencido,
      vencido     = 0,
      mora_dias   = 0,
      -- CASE y no COALESCE(GREATEST(...)): GREATEST ignora los NULL, así que
      -- sin fecha de débito devolvería la fecha de corte en vez del día 22.
      vencimiento = CASE
        WHEN v_fecha_debito IS NULL THEN make_date(
          extract(year FROM v_fecha_corte)::int,
          extract(month FROM v_fecha_corte)::int,
          c_dia_debito_respaldo
        )
        ELSE GREATEST(v_fecha_debito, v_fecha_corte)
      END
    FROM socios s
    WHERE cd.importacion_id = v_importacion_id
      AND cd.socio_id = s.id
      AND s.cobro_con_tarjeta
      AND cd.concepto = 'cuota'
      AND NOT cd.es_saldo_anterior
      AND cd.periodo = to_char(v_fecha_corte, 'YYYY-MM')
      AND cd.vencido > 0;
  END IF;

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
