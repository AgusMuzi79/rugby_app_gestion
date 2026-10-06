// Edge Function: importar-servicios
//
// Importador del "Padrón de Servicios por Socio/Frecuencia" de NUVIX desde el
// panel de Secretaría. Deja `socio_servicios` como espejo del archivo para los
// servicios mapeados (Gimnasio, Rugby, Hockey, Carnet Tenis, Rugby Inclusivo,
// Hockey Inclusivo) — ver parse-padron-servicios.ts y
// odd/tasks/import-servicios-panel.md. Los demás servicios nunca se tocan.
//
// Se corre después del Padrón Extendido (importar-socios): matchea por
// socios.numero_socio y nunca crea ni da de baja socios.
//
// Mismo esquema que importar-socios — FormData con `archivo` + `modo`:
//   - preview   → calcula el diff completo, no escribe nada
//   - confirmar → recalcula el diff desde el mismo archivo (no hay estado entre
//                 una llamada y otra) y lo aplica. `bajas_aprobadas` (JSON con
//                 claves "numero_socio|Servicio") son las bajas que quedaron
//                 tildadas en la vista previa: sólo esas se borran.
// La vista previa informa `servicios_ausentes` (servicios mapeados sin ninguna
// fila en el archivo, p. ej. un export parcial) y marca sus bajas con
// `servicio_ausente`; el panel las muestra destildadas.
// Cada fila se aplica por separado; un error puntual no aborta el resto y va a
// `errores` en la respuesta.
//
// Callers permitidos: secretaria, admin.

import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { corsHeaders, jsonOk, jsonError } from '../_shared/cors.ts'
import {
  parsePadronServicios,
  calcularDiffServicios,
  filtrarBajasAprobadas,
  claveVinculo,
  normalizarConcepto,
  MAPEO_CONCEPTOS,
  SERVICIOS_MAPEADOS,
  NOMBRES_CATALOGO,
  type DiffServicios,
  type DiffAgregado,
  type DiffActualizado,
  type DiffEliminado,
  type SocioRef,
  type VinculoActual,
} from '../_shared/parse-padron-servicios.ts'
// xlsx es un paquete CJS — Deno lo importa por default export, mismo patrón
// que importar-socios e importar-deuda.
import XLSX from 'npm:xlsx@0.18.5'

const ROLES_PERMITIDOS = ['secretaria', 'admin']
const PAGINA = 1000
const LOTE = 500

interface ErrorAplicacion {
  numero_socio: string
  nombre:       string
  servicio:     string
  motivo:       string
}

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
    return jsonError(403, 'Sin permiso — sólo Secretaría o Admin pueden importar el padrón de servicios')
  }

  // ─── Leer el archivo + modo del FormData ─────────────────────────────────────
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return jsonError(400, 'Body inválido — se espera FormData con el archivo en el campo "archivo"')
  }

  const archivo = formData.get('archivo')
  if (!(archivo instanceof File)) return jsonError(400, 'archivo es requerido')

  const modo = String(formData.get('modo') ?? 'preview')
  if (modo !== 'preview' && modo !== 'confirmar') return jsonError(400, 'modo debe ser "preview" o "confirmar"')

  // Bajas aprobadas en la vista previa: lista explícita, así el confirmar nunca
  // borra un vínculo que Secretaría no vio.
  let bajasAprobadas = new Set<string>()
  if (modo === 'confirmar') {
    try {
      const parsed = JSON.parse(String(formData.get('bajas_aprobadas') ?? ''))
      if (!Array.isArray(parsed) || !parsed.every((c) => typeof c === 'string')) throw new Error('no es una lista')
      bajasAprobadas = new Set(parsed)
    } catch {
      return jsonError(400, 'bajas_aprobadas es requerido al confirmar: lista JSON de claves "numero_socio|Servicio"')
    }
  }

  // deno-lint-ignore no-explicit-any
  let workbook: any
  try {
    workbook = XLSX.read(new Uint8Array(await archivo.arrayBuffer()), { type: 'array' })
  } catch (e) {
    return jsonError(400, `No se pudo leer el archivo (¿es un .xls válido?): ${e instanceof Error ? e.message : String(e)}`)
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) return jsonError(400, 'El archivo no tiene ninguna hoja legible')

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as unknown[][]
  const padron = parsePadronServicios(rows)

  // Red de seguridad: como el import es espejo, un archivo equivocado sin
  // ninguna fila de servicios mapeados borraría todos los vínculos.
  const filasMapeadas = padron.filas.filter((f) => MAPEO_CONCEPTOS[normalizarConcepto(f.concepto)])
  if (padron.conceptos.length === 0 || filasMapeadas.length === 0) {
    return jsonError(400, 'No se encontró ningún servicio en el archivo — ¿es el "Padrón de Servicios por Socio/Frecuencia"?')
  }

  // ─── Leer la base ─────────────────────────────────────────────────────────────
  const { data: catalogoRaw, error: catalogoErr } = await supabaseAdmin
    .from('servicios_opcionales')
    .select('id, nombre, monto_mensual')
    .in('nombre', [...NOMBRES_CATALOGO])
  if (catalogoErr) return jsonError(500, `Error leyendo el catálogo de servicios: ${catalogoErr.message}`)

  const servicioIdPorNombre = new Map<string, string>()
  const servicioNombrePorId = new Map<string, string>()
  const precios = new Map<string, number>()
  for (const s of catalogoRaw ?? []) {
    const nombre = s.nombre as string
    if (servicioIdPorNombre.has(nombre)) {
      return jsonError(500, `El catálogo tiene más de un servicio llamado "${nombre}" — corregirlo antes de importar`)
    }
    servicioIdPorNombre.set(nombre, s.id as string)
    servicioNombrePorId.set(s.id as string, nombre)
    if (s.monto_mensual !== null && s.monto_mensual !== undefined) precios.set(nombre, Number(s.monto_mensual))
  }
  const faltantes = [...SERVICIOS_MAPEADOS].filter((n) => !servicioIdPorNombre.has(n))
  if (faltantes.length > 0) {
    return jsonError(500, `Faltan servicios en el catálogo: ${faltantes.join(', ')}`)
  }

  // PostgREST corta en 1000 filas por default — paginar siempre (mismo bug
  // que ya se encontró en importar-socios, 2026-08-21).
  let sociosRaw: Record<string, unknown>[] = []
  for (let from = 0; ; from += PAGINA) {
    const { data, error } = await supabaseAdmin
      .from('socios')
      .select('id, numero_socio, excluir_de_import, profiles!socios_profile_id_fkey(nombre)')
      .order('id')
      .range(from, from + PAGINA - 1)
    if (error) return jsonError(500, `Error leyendo socios: ${error.message}`)
    sociosRaw = sociosRaw.concat(data ?? [])
    if (!data || data.length < PAGINA) break
  }

  const socios = new Map<string, SocioRef>()
  const numeroPorSocioId = new Map<string, string>()
  for (const s of sociosRaw) {
    const numero = String(s.numero_socio)
    socios.set(numero, {
      id:              s.id as string,
      nombre:          (s.profiles as { nombre: string } | null)?.nombre ?? '',
      excluirDeImport: !!s.excluir_de_import,
    })
    numeroPorSocioId.set(s.id as string, numero)
  }

  const idsMapeados = [...SERVICIOS_MAPEADOS].map((n) => servicioIdPorNombre.get(n)!)
  let vinculosRaw: Record<string, unknown>[] = []
  for (let from = 0; ; from += PAGINA) {
    const { data, error } = await supabaseAdmin
      .from('socio_servicios')
      .select('id, socio_id, servicio_id, importe, variante_nuvix')
      .in('servicio_id', idsMapeados)
      .order('id')
      .range(from, from + PAGINA - 1)
    if (error) return jsonError(500, `Error leyendo socio_servicios: ${error.message}`)
    vinculosRaw = vinculosRaw.concat(data ?? [])
    if (!data || data.length < PAGINA) break
  }

  const vinculos: VinculoActual[] = []
  for (const v of vinculosRaw) {
    const numeroSocio = numeroPorSocioId.get(v.socio_id as string)
    const servicio = servicioNombrePorId.get(v.servicio_id as string)
    if (!numeroSocio || !servicio) continue
    vinculos.push({
      id:            v.id as string,
      numeroSocio,
      servicio,
      importe:       v.importe as number | string | null,
      varianteNuvix: v.variante_nuvix as string | null,
    })
  }

  // ─── Diff ─────────────────────────────────────────────────────────────────
  const diffCompleto = calcularDiffServicios({ padron, socios, precios, vinculos })

  if (modo === 'preview') {
    return jsonOk(resumenDiff(diffCompleto))
  }

  // ─── Aplicar ─────────────────────────────────────────────────────────────
  const { diff, omitidos } = filtrarBajasAprobadas(diffCompleto, bajasAprobadas)
  const resultado = await aplicarDiff(diff, servicioIdPorNombre)
  const erroresTotales: ErrorAplicacion[] = [
    ...diff.errores.map((e) => ({ numero_socio: e.numeroSocio, nombre: e.nombre, servicio: e.servicio, motivo: e.motivo })),
    ...resultado.errores,
  ]

  const { data: importacion, error: importErr } = await supabaseAdmin
    .from('importaciones_servicios')
    .insert({
      archivo_nombre: archivo.name,
      agregados:      resultado.agregadosOk,
      actualizados:   resultado.actualizadosOk,
      eliminados:     resultado.eliminadosOk,
      omitidos,
      sin_cambio:     diff.sinCambio,
      errores:        erroresTotales.length,
      importado_por:  caller.id,
    })
    .select('id')
    .single()

  if (importErr) console.error('Error registrando importaciones_servicios:', importErr.message)

  // Refleja lo que realmente se aplicó, no el diff calculado antes de aplicar.
  return jsonOk({
    importacion_id: importacion?.id ?? null,
    aplicado:       true,
    agregados:      resultado.agregadosOk,
    actualizados:   resultado.actualizadosOk,
    eliminados:     resultado.eliminadosOk,
    omitidos,
    sin_cambio:     diff.sinCambio,
    conflictos:     diff.conflictos.length,
    sin_match:      diff.sinMatch.length,
    errores:        erroresTotales.length,
    detalle: {
      errores: erroresTotales,
    },
  })
})

// ─── Vista previa ───────────────────────────────────────────────────────────

function resumenDiff(diff: DiffServicios) {
  return {
    agregados:              diff.agregados.length,
    actualizados:           diff.actualizados.length,
    eliminados:             diff.eliminados.length,
    sin_cambio:             diff.sinCambio,
    conflictos:             diff.conflictos.length,
    sin_match:              diff.sinMatch.length,
    conceptos_desconocidos: diff.conceptosDesconocidos.length,
    errores:                diff.errores.length,
    servicios_ausentes:     diff.serviciosAusentes,
    detalle: {
      agregados: diff.agregados.map((a) => ({
        numero_socio: a.numeroSocio, nombre: a.nombre, servicio: a.servicio,
        variante: a.varianteNuvix, importe: a.importe,
      })),
      actualizados: diff.actualizados.map((a) => ({
        numero_socio: a.numeroSocio, nombre: a.nombre, servicio: a.servicio,
        variante: a.varianteNuvix, importe: a.importe,
        variante_anterior: a.varianteAnterior, importe_anterior: a.importeAnterior,
      })),
      eliminados: diff.eliminados.map((e) => ({
        clave: claveVinculo(e.numeroSocio, e.servicio),
        numero_socio: e.numeroSocio, nombre: e.nombre, servicio: e.servicio,
        variante: e.varianteNuvix, importe: e.importe,
        manual: e.varianteNuvix === null,
        servicio_ausente: e.servicioAusente,
      })),
      conflictos: diff.conflictos.map((c) => ({
        numero_socio: c.numeroSocio, nombre: c.nombre, servicio: c.servicio, conceptos: c.conceptos,
      })),
      sin_match: diff.sinMatch.map((s) => ({
        numero_socio: s.numeroSocio, nombre: s.nombre, conceptos: s.conceptos,
      })),
      conceptos_desconocidos: diff.conceptosDesconocidos,
      errores: diff.errores.map((e) => ({
        numero_socio: e.numeroSocio, nombre: e.nombre, servicio: e.servicio, motivo: e.motivo,
      })),
    },
  }
}

// ─── Aplicar ────────────────────────────────────────────────────────────────

function enLotes<T>(xs: T[], tam: number): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < xs.length; i += tam) lotes.push(xs.slice(i, i + tam))
  return lotes
}

async function enParalelo<T>(xs: T[], worker: (x: T) => Promise<void>, concurrencia = 5): Promise<void> {
  let i = 0
  async function siguiente() {
    while (i < xs.length) await worker(xs[i++])
  }
  await Promise.all(Array.from({ length: concurrencia }, siguiente))
}

async function aplicarDiff(diff: DiffServicios, servicioIdPorNombre: Map<string, string>) {
  const errores: ErrorAplicacion[] = []
  let eliminadosOk = 0, actualizadosOk = 0, agregadosOk = 0

  const registrarError = (x: { numeroSocio: string; nombre: string; servicio: string }, motivo: string) => {
    errores.push({ numero_socio: x.numeroSocio, nombre: x.nombre, servicio: x.servicio, motivo })
    console.error(`Error en ${x.numeroSocio} / ${x.servicio}:`, motivo)
  }

  // Bajas — por lote; si un lote falla, fila por fila para aislar el error.
  for (const lote of enLotes<DiffEliminado>(diff.eliminados, LOTE)) {
    const { error } = await supabaseAdmin.from('socio_servicios').delete().in('id', lote.map((e) => e.vinculoId))
    if (!error) { eliminadosOk += lote.length; continue }
    for (const e of lote) {
      const { error: errFila } = await supabaseAdmin.from('socio_servicios').delete().eq('id', e.vinculoId)
      if (errFila) registrarError(e, errFila.message)
      else eliminadosOk++
    }
  }

  // Cambios — cada fila tiene su propio importe/variante, van de a una.
  await enParalelo<DiffActualizado>(diff.actualizados, async (a) => {
    const { error } = await supabaseAdmin
      .from('socio_servicios')
      .update({ importe: a.importe, variante_nuvix: a.varianteNuvix })
      .eq('id', a.vinculoId)
    if (error) registrarError(a, error.message)
    else actualizadosOk++
  })

  // Altas — por lote, con la misma recuperación fila por fila.
  const filaInsert = (a: DiffAgregado) => ({
    socio_id:       a.socioId,
    servicio_id:    servicioIdPorNombre.get(a.servicio)!,
    importe:        a.importe,
    variante_nuvix: a.varianteNuvix,
  })
  for (const lote of enLotes<DiffAgregado>(diff.agregados, LOTE)) {
    const { error } = await supabaseAdmin.from('socio_servicios').insert(lote.map(filaInsert))
    if (!error) { agregadosOk += lote.length; continue }
    for (const a of lote) {
      const { error: errFila } = await supabaseAdmin.from('socio_servicios').insert(filaInsert(a))
      if (errFila) registrarError(a, errFila.message)
      else agregadosOk++
    }
  }

  return { agregadosOk, actualizadosOk, eliminadosOk, errores }
}
