// Edge Function: importar-deuda
//
// Importador recurrente del reporte de cuentas corrientes NUVIX
// (RPT_Vencimientos) — alimenta el semáforo de morosidad (socios.semaforo).
// El pago no pasa por la app; NUVIX es la fuente de verdad, esto sólo la
// refleja. Ver openspec/changes/importador-deuda-nuvix/design.md.
//
// A diferencia de socios-pagos (--no-verify-jwt, pensada para webhooks/cron),
// esta función tiene verify_jwt ACTIVO — la invoca un humano autenticado
// desde el panel web de Secretaría.
//
// Callers permitidos: secretaria, admin.
//
// Flujo:
//   1. Verificar rol del caller
//   2. Leer el .xls del FormData, parsear con SheetJS (parseDeudaNuvix)
//   3. Si no reconcilia contra el Total General del propio archivo: abortar,
//      no tocar la base, devolver el detalle del desbalance
//   4. Resolver cod_cliente → socio_id vía socios.numero_socio (bulk)
//   5. Persistir todo + recalcular el semáforo en una sola transacción de
//      Postgres (RPC importar_deuda_nuvix, SECURITY DEFINER)
//   6. Devolver el resumen: comprobantes, personas, matcheados, sin match,
//      conteo por color

import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { corsHeaders, jsonOk, jsonError } from '../_shared/cors.ts'
import { parseDeudaNuvix } from '../_shared/parse-deuda-nuvix.ts'
// xlsx es un paquete CJS — Deno lo importa por default export (module.exports),
// mismo paquete y misma forma de leerlo que scripts/import-socios-masivo.mjs.
import XLSX from 'npm:xlsx@0.18.5'

const ROLES_PERMITIDOS = ['secretaria', 'admin']

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonError(405, 'Método no permitido')

  // ─── Verificar JWT + rol ────────────────────────────────────────────────────
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!jwt) return jsonError(401, 'Sin autorización')

  const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(jwt)
  if (authErr || !caller) return jsonError(401, 'Token inválido')

  const { data: callerProfile } = await supabaseAdmin
    .from('profiles')
    .select('rol')
    .eq('id', caller.id)
    .single()

  if (!callerProfile || !ROLES_PERMITIDOS.includes(callerProfile.rol)) {
    return jsonError(403, 'Sin permiso — sólo Secretaría o Admin pueden importar el reporte de deuda')
  }

  // ─── Leer el archivo del FormData ───────────────────────────────────────────
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return jsonError(400, 'Body inválido — se espera FormData con el archivo en el campo "archivo"')
  }

  const archivo = formData.get('archivo')
  if (!(archivo instanceof File)) return jsonError(400, 'archivo es requerido')

  const bytes = new Uint8Array(await archivo.arrayBuffer())

  // deno-lint-ignore no-explicit-any
  let workbook: any
  try {
    workbook = XLSX.read(bytes, { type: 'array', cellDates: true })
  } catch (e) {
    return jsonError(400, `No se pudo leer el archivo (¿es un .xls válido?): ${e instanceof Error ? e.message : String(e)}`)
  }

  const sheetNames: string[] = workbook.SheetNames ?? []
  const sheetName = sheetNames.find((n: string) => n.includes('RPT_Vencimientos')) ?? sheetNames[0]
  const sheet = sheetName ? workbook.Sheets[sheetName] : null
  if (!sheet) return jsonError(400, 'El archivo no tiene ninguna hoja legible')

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, cellDates: true, raw: true }) as unknown[][]

  // ─── Parsear + validar reconciliación ───────────────────────────────────────
  const parsed = parseDeudaNuvix(rows)

  if (!parsed.fechaCorte) {
    return jsonError(400, 'No se encontró la fila "Período Informado:" — no se pudo determinar la fecha de corte del archivo')
  }

  if (!parsed.reconcilia) {
    return jsonError(400,
      'El archivo no reconcilia: la suma de subtotales por cuenta no coincide con el Total General. ' +
      'No se importó nada. Detalle: ' + JSON.stringify(parsed.desbalance)
    )
  }

  // ─── Resolver cod_cliente → socio_id vía socios.numero_socio ────────────────
  const codClientesUnicos = [...new Set(parsed.comprobantes.map(c => c.cod_cliente))]

  const { data: sociosMatch, error: sociosErr } = await supabaseAdmin
    .from('socios')
    .select('id, numero_socio')
    .in('numero_socio', codClientesUnicos)

  if (sociosErr) return jsonError(500, `Error resolviendo socios: ${sociosErr.message}`)

  const socioIdPorCod = new Map<string, string>((sociosMatch ?? []).map(s => [s.numero_socio as string, s.id as string]))

  const comprobantesConSocio = parsed.comprobantes.map(c => ({
    ...c,
    socio_id: socioIdPorCod.get(c.cod_cliente) ?? null,
  }))

  const personas = codClientesUnicos.length
  const sociosMatcheados = new Set(comprobantesConSocio.filter(c => c.socio_id).map(c => c.cod_cliente)).size
  const sinMatch = personas - sociosMatcheados

  // ─── Persistir (transacción vía RPC) ────────────────────────────────────────
  const payload = {
    fecha_corte: parsed.fechaCorte,
    periodo_desde: parsed.periodoDesde,
    periodo_hasta: parsed.periodoHasta,
    archivo_nombre: archivo.name,
    total_vencido: parsed.totalGeneral?.vencido ?? 0,
    total_a_vencer: parsed.totalGeneral?.aVencer ?? 0,
    total_general: parsed.totalGeneral?.total ?? 0,
    // "Comprobantes" para el resumen no incluye las filas SALDO ANTERIOR
    // (no son un comprobante NUVIX real, son el arrastre de saldo previo al
    // período informado) — verificado contra el archivo de referencia:
    // 1792 filas de detalle - 53 SALDO ANTERIOR = 1739, el número que dio el club.
    comprobantes_count: comprobantesConSocio.filter(c => !c.es_saldo_anterior).length,
    personas,
    socios_matcheados: sociosMatcheados,
    sin_match: sinMatch,
    reconcilia: true,
    importado_por: caller.id,
    comprobantes: comprobantesConSocio,
  }

  const { data: resultado, error: rpcErr } = await supabaseAdmin.rpc('importar_deuda_nuvix', {
    p_payload: payload,
  })

  if (rpcErr) return jsonError(500, `Error al guardar la importación: ${rpcErr.message}`)

  return jsonOk({
    importacion_id: resultado?.importacion_id ?? null,
    comprobantes: payload.comprobantes_count,
    personas,
    socios_matcheados: sociosMatcheados,
    sin_match: sinMatch,
    verde: resultado?.verde ?? 0,
    amarillo: resultado?.amarillo ?? 0,
    rojo: resultado?.rojo ?? 0,
    exento: resultado?.exento ?? 0,
  })
})
