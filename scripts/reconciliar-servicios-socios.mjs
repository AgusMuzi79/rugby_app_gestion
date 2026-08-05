// Reconciliación de categorías, servicios y precios de Socios contra el Padrón de
// Servicios real de NUVIX — openspec/changes/actualizar-servicios-socios.
//
// Uso:
//   cd scripts && npm install   (si hace falta — usa las mismas deps que import-socios-masivo.mjs)
//   SUPABASE_SERVICE_ROLE_KEY=... node reconciliar-servicios-socios.mjs             # dry-run (default)
//   SUPABASE_SERVICE_ROLE_KEY=... node reconciliar-servicios-socios.mjs --commit    # corre en serio
//
// La service_role key se consigue en Supabase Dashboard → Project Settings → API → service_role (secret).
// Nunca se commitea ni se imprime en este script. Hace falta incluso en dry-run: el diff
// se calcula contra el estado real de la base, no sólo contra los CSV.
//
// En dry-run (default) el script es 100% de sólo lectura — no escribe nada, ni siquiera
// el registro de auditoría en `reconciliaciones_socios` (ese INSERT sólo ocurre con --commit,
// junto con el resto de los cambios, para que "dry-run no escribe nada" sea literal).
//
// Reglas de seguridad (ver openspec/changes/actualizar-servicios-socios):
//   - Todo el matcheo es por socios.numero_socio == nuvix_cod_cliente. Nunca por nombre/DNI.
//   - Nunca se crea ni se borra un socio. Un numero_socio sin match queda listado, no se inserta.
//   - Las 6 cuentas institucionales de NUVIX (categoria_padron='Cliente') se excluyen por regla
//     explícita antes de intentar matchear — nunca fueron socios.
//   - No se toca auth.users ni profiles.
//   - El precio real de un servicio viene siempre del CSV (importe_liquidacion), nunca se
//     deriva de una regla propia — el catálogo (servicios_opcionales.monto_mensual) es sólo
//     informativo y esta migración no lo usa para decidir qué cobrarle a nadie.
//   - Idempotente: correr dos veces con el mismo CSV da 0 diffs pendientes la segunda vez.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const args = process.argv.slice(2)
const COMMIT = args.includes('--commit')

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tlexvbattnzpmdftjsao.supabase.co'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SERVICE_ROLE_KEY) {
  console.error('Falta SUPABASE_SERVICE_ROLE_KEY en el entorno. Hace falta incluso en dry-run (el diff se calcula contra la base real).')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const DATA_DIR = path.join(__dirname, '..', 'data', 'import')

// ─── Parser CSV (maneja comillas/comas embebidas — split naive rompe con 6 filas del maestro) ──

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; continue }
        inQuotes = false; continue
      }
      field += c; continue
    }
    if (c === '"') { inQuotes = true; continue }
    if (c === ',') { row.push(field); field = ''; continue }
    if (c === '\r') continue
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue }
    field += c
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

function readCsv(filename) {
  const text = fs.readFileSync(path.join(DATA_DIR, filename), 'utf8')
  const rows = parseCsv(text).filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''))
  const header = rows[0]
  return rows.slice(1).map((r) => {
    const o = {}
    header.forEach((h, idx) => { o[h] = r[idx] ?? '' })
    return o
  })
}

// ─── Servicios relevantes (catálogo post-migración 20260805000001) ─────────────────────────────

const SERVICIOS_RELEVANTES = [
  'Tenis', 'Gimnasio', 'Rugby', 'Hockey', 'Carnet Tenis', 'Hockey Inclusivo', 'Rugby Inclusivo',
]

// ─── Carga de CSV ────────────────────────────────────────────────────────────────────────────

const maestra = readCsv('socios_activos_maestra.csv')
const serviciosCsv = readCsv('socios_servicios.csv')
const preciosCsv = readCsv('precios_conceptos.csv')

// ─── Carga de estado real de la base (paginado — PostgREST tope 1000 filas) ────────────────────

async function selectAll(table, columns) {
  const pageSize = 1000
  let all = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + pageSize - 1)
    if (error) throw new Error(`selectAll(${table}): ${error.message}`)
    all = all.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

async function cargarEstadoActual() {
  const categorias = await selectAll('categorias_socio', 'id, nombre, monto_mensual')
  const servicios = await selectAll('servicios_opcionales', 'id, nombre, monto_mensual, activo')
  const socios = await selectAll('socios', 'id, numero_socio, categoria_id')
  const vinculos = await selectAll('socio_servicios', 'id, socio_id, servicio_id, importe, variante_nuvix')

  return {
    categoriaIdByNombre: new Map(categorias.map((c) => [c.nombre, c.id])),
    categoriaNombreById: new Map(categorias.map((c) => [c.id, c.nombre])),
    categoriaMontoByNombre: new Map(categorias.map((c) => [c.nombre, Number(c.monto_mensual)])),
    servicioIdByNombre: new Map(servicios.map((s) => [s.nombre, s.id])),
    servicioNombreById: new Map(servicios.map((s) => [s.id, s.nombre])),
    servicioMontoByNombre: new Map(servicios.map((s) => [s.nombre, Number(s.monto_mensual)])),
    socioIdByNumeroSocio: new Map(socios.map((s) => [s.numero_socio, s.id])),
    socioCategoriaIdById: new Map(socios.map((s) => [s.id, s.categoria_id])),
    vinculosPorSocioId: (() => {
      const m = new Map()
      for (const v of vinculos) {
        if (!m.has(v.socio_id)) m.set(v.socio_id, [])
        m.get(v.socio_id).push(v)
      }
      return m
    })(),
    totalSocios: socios.length,
  }
}

// ─── Clasificación de filas del maestro ─────────────────────────────────────────────────────

function clasificarSocios(maestra, estado) {
  const excluidosInstitucionales = []
  const noMatcheados = []
  const matcheados = []

  for (const row of maestra) {
    if (row.categoria_padron === 'Cliente') {
      excluidosInstitucionales.push({ numero_socio: row.nuvix_cod_cliente, nombre: row.nombre })
      continue
    }
    const socioId = estado.socioIdByNumeroSocio.get(row.nuvix_cod_cliente)
    if (!socioId) {
      noMatcheados.push({ numero_socio: row.nuvix_cod_cliente, nombre: row.nombre })
      continue
    }
    matcheados.push({ ...row, socio_id: socioId })
  }

  return { excluidosInstitucionales, noMatcheados, matcheados }
}

// ─── Diff de categorías ──────────────────────────────────────────────────────────────────────

function diffCategorias(matcheados, estado) {
  const aActualizar = []
  for (const row of matcheados) {
    if (!row.categoria_liquidacion) continue // sin liquidación — no se toca acá
    const categoriaActualId = estado.socioCategoriaIdById.get(row.socio_id)
    const categoriaActualNombre = estado.categoriaNombreById.get(categoriaActualId) ?? null
    if (row.categoria_liquidacion === categoriaActualNombre) continue

    const categoriaNuevaId = estado.categoriaIdByNombre.get(row.categoria_liquidacion)
    if (!categoriaNuevaId) {
      throw new Error(`Categoría "${row.categoria_liquidacion}" (numero_socio ${row.nuvix_cod_cliente}) no existe en categorias_socio — abortar, no crear categorías nuevas silenciosamente.`)
    }

    aActualizar.push({
      numero_socio: row.nuvix_cod_cliente,
      nombre: row.nombre,
      socio_id: row.socio_id,
      categoria_actual: categoriaActualNombre,
      categoria_nueva: row.categoria_liquidacion,
      categoria_nueva_id: categoriaNuevaId,
    })
  }
  return aActualizar
}

// ─── Diff de vínculos socio↔servicio — declarativo contra socios_servicios.csv ─────────────────

function diffServicios(serviciosCsv, matcheados, estado) {
  const numeroSocioToSocioId = new Map(matcheados.map((r) => [r.nuvix_cod_cliente, r.socio_id]))

  // objetivo: Map<socio_id, Map<servicioNombre, {importe, variante}>>
  const objetivo = new Map()
  const filasSinMatch = []
  for (const row of serviciosCsv) {
    const socioId = numeroSocioToSocioId.get(row.nuvix_cod_cliente)
    if (!socioId) { filasSinMatch.push(row); continue } // institucional o no matcheado — ya reportado en socios
    if (!objetivo.has(socioId)) objetivo.set(socioId, new Map())
    objetivo.get(socioId).set(row.servicio, {
      importe: Number(row.importe_liquidacion),
      variante: row.variante_nuvix,
    })
  }

  const porServicio = {}
  for (const nombre of SERVICIOS_RELEVANTES) porServicio[nombre] = { agregar: [], eliminar: [], actualizar: [] }

  const socioIdsRelevantes = new Set([...objetivo.keys(), ...estado.vinculosPorSocioId.keys()])

  for (const socioId of socioIdsRelevantes) {
    const target = objetivo.get(socioId) ?? new Map()
    const actualesTodos = estado.vinculosPorSocioId.get(socioId) ?? []
    const actuales = new Map(
      actualesTodos
        .map((v) => [estado.servicioNombreById.get(v.servicio_id), v])
        .filter(([nombre]) => SERVICIOS_RELEVANTES.includes(nombre))
    )

    for (const [nombre, datos] of target) {
      if (!actuales.has(nombre)) {
        porServicio[nombre].agregar.push({ socio_id: socioId, ...datos })
      } else {
        const actual = actuales.get(nombre)
        const importeDistinto = Number(actual.importe) !== datos.importe
        const varianteDistinta = actual.variante_nuvix !== datos.variante
        if (importeDistinto || varianteDistinta) {
          porServicio[nombre].actualizar.push({ socio_id: socioId, vinculo_id: actual.id, ...datos })
        }
      }
    }
    for (const [nombre, actual] of actuales) {
      if (!target.has(nombre)) {
        porServicio[nombre].eliminar.push({ socio_id: socioId, vinculo_id: actual.id })
      }
    }
  }

  // vigentes_post = actuales - eliminados + agregados, por servicio (actualizar no cambia el conteo)
  const vigentesPostPorServicio = {}
  let totalVigentesPost = 0
  for (const nombre of SERVICIOS_RELEVANTES) {
    const actualesCount = [...estado.vinculosPorSocioId.values()]
      .flat()
      .filter((v) => estado.servicioNombreById.get(v.servicio_id) === nombre).length
    const post = actualesCount - porServicio[nombre].eliminar.length + porServicio[nombre].agregar.length
    vigentesPostPorServicio[nombre] = post
    totalVigentesPost += post
  }

  return { porServicio, filasSinMatch, vigentesPostPorServicio, totalVigentesPost }
}

// ─── Reporte: socios sin liquidación (para revisión de Secretaría) ─────────────────────────────

function calcularSinLiquidacion(matcheados) {
  return matcheados
    .filter((r) => (r.revisar || '').includes('SIN_LIQUIDACION') || (r.revisar || '').includes('SIN_CUOTA_EN_LIQUIDACION'))
    .map((r) => ({
      numero_socio: r.nuvix_cod_cliente,
      nombre: r.nombre,
      motivo: (r.revisar || '').includes('SIN_LIQUIDACION') ? 'SIN_LIQUIDACION' : 'SIN_CUOTA_EN_LIQUIDACION',
    }))
}

// ─── Reporte: becas pendientes de decisión (no se aplica nada — sólo informativo) ───────────────

function calcularBecasPendientes(matcheados) {
  const becados = matcheados.filter(
    (r) => r.categoria_padron.startsWith('Becado') && r.categoria_liquidacion && r.categoria_liquidacion !== r.categoria_padron
  )
  const activoMayorMenor = becados.filter((r) => ['Activo Mayor', 'Activo Menor'].includes(r.categoria_liquidacion))
  const otraCategoria = becados.filter((r) => !['Activo Mayor', 'Activo Menor'].includes(r.categoria_liquidacion))
  return {
    total: becados.length,
    aterrizan_activo_mayor_menor: activoMayorMenor.length,
    aterrizan_otra_categoria: otraCategoria.length,
    detalle: becados.map((r) => ({
      numero_socio: r.nuvix_cod_cliente,
      nombre: r.nombre,
      categoria_padron: r.categoria_padron,
      categoria_liquidacion: r.categoria_liquidacion,
      beca_pct: r.beca_pct,
    })),
  }
}

// ─── Reporte: precios de catálogo (informativo) vs. precios_conceptos.csv ──────────────────────

function diffPreciosCatalogo(preciosCsv, estado) {
  const categoriasSocio = []
  for (const p of preciosCsv.filter((p) => p.tipo === 'Cuota')) {
    if (!estado.categoriaMontoByNombre.has(p.nombre)) continue // ej. "Cliente Gym", "Rincón del Hincha" — sin categoría hoy
    const actual = estado.categoriaMontoByNombre.get(p.nombre)
    const nuevo = Number(p.importe)
    if (actual !== nuevo) categoriasSocio.push({ nombre: p.nombre, actual, nuevo })
  }

  const serviciosOpcionales = []
  for (const p of preciosCsv.filter((p) => p.tipo === 'Servicio')) {
    if (!estado.servicioMontoByNombre.has(p.nombre)) continue // ej. "Gimnasio Alícuota" — sin fila de catálogo
    const actual = estado.servicioMontoByNombre.get(p.nombre)
    const nuevo = Number(p.importe)
    if (actual !== nuevo) serviciosOpcionales.push({ nombre: p.nombre, actual, nuevo })
  }

  return { categoriasSocio, serviciosOpcionales }
}

// ─── Facturación mensual estimada (sólo chequeo — no se usa para decidir nada) ─────────────────

function calcularFacturacionEstimada(matcheados) {
  let total = 0
  for (const r of matcheados) {
    total += Number(r.cuota_importe || 0) + Number(r.servicios_importe || 0)
  }
  return total
}

// ─── Armado del reporte ──────────────────────────────────────────────────────────────────────

function armarReporte(estado, clasificacion, diffCat, diffServ, sinLiquidacion, becas, diffPrecios, facturacion) {
  const porServicioResumen = {}
  for (const [nombre, d] of Object.entries(diffServ.porServicio)) {
    porServicioResumen[nombre] = {
      agregar: d.agregar.length,
      eliminar: d.eliminar.length,
      actualizar_importe: d.actualizar.length,
      vigentes_post: diffServ.vigentesPostPorServicio[nombre],
    }
  }

  return {
    dry_run: !COMMIT,
    socios: {
      en_maestro: maestra.length,
      excluidos_institucionales: clasificacion.excluidosInstitucionales.length,
      excluidos_institucionales_detalle: clasificacion.excluidosInstitucionales,
      esperados_en_base: 1528,
      matcheados_en_base: clasificacion.matcheados.length,
      no_matcheados: clasificacion.noMatcheados,
    },
    categorias: {
      a_actualizar: diffCat.length,
      detalle: diffCat,
    },
    servicios: {
      por_servicio: porServicioResumen,
      total_vinculos_post: diffServ.totalVigentesPost,
      detalle: diffServ.porServicio,
      filas_csv_sin_match: diffServ.filasSinMatch,
    },
    precios_catalogo_informativo: diffPrecios,
    revisar_secretaria: {
      sin_liquidacion: sinLiquidacion.length,
      detalle: sinLiquidacion,
    },
    becas_pendiente_decision: becas,
    facturacion_mensual_estimada: facturacion,
  }
}

// ─── Aplicación real (sólo si --commit) ─────────────────────────────────────────────────────

async function pool(items, worker, concurrency = 5) {
  let i = 0
  async function next() {
    while (i < items.length) {
      const idx = i++
      await worker(items[idx], idx)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, next))
}

async function aplicar(diffCat, diffServ, estado) {
  const errores = []

  console.log(`\nAplicando ${diffCat.length} cambios de categoría...`)
  await pool(diffCat, async (c) => {
    const { error } = await supabase.from('socios').update({ categoria_id: c.categoria_nueva_id }).eq('id', c.socio_id)
    if (error) errores.push({ tipo: 'categoria', numero_socio: c.numero_socio, error: error.message })
  })

  for (const [nombre, d] of Object.entries(diffServ.porServicio)) {
    const servicioId = estado.servicioIdByNombre.get(nombre)
    if (!servicioId) { errores.push({ tipo: 'servicio_no_encontrado', nombre }); continue }

    if (d.eliminar.length) {
      console.log(`  ${nombre}: eliminando ${d.eliminar.length} vínculos...`)
      await pool(d.eliminar, async (e) => {
        const { error } = await supabase.from('socio_servicios').delete().eq('id', e.vinculo_id)
        if (error) errores.push({ tipo: 'eliminar_vinculo', nombre, error: error.message })
      })
    }
    if (d.agregar.length) {
      console.log(`  ${nombre}: agregando ${d.agregar.length} vínculos...`)
      await pool(d.agregar, async (a) => {
        const { error } = await supabase.from('socio_servicios').insert({
          socio_id: a.socio_id, servicio_id: servicioId, importe: a.importe, variante_nuvix: a.variante,
        })
        if (error) errores.push({ tipo: 'agregar_vinculo', nombre, error: error.message })
      })
    }
    if (d.actualizar.length) {
      console.log(`  ${nombre}: actualizando importe de ${d.actualizar.length} vínculos...`)
      await pool(d.actualizar, async (u) => {
        const { error } = await supabase.from('socio_servicios')
          .update({ importe: u.importe, variante_nuvix: u.variante })
          .eq('id', u.vinculo_id)
        if (error) errores.push({ tipo: 'actualizar_vinculo', nombre, error: error.message })
      })
    }
  }

  return errores
}

// ─── Main ────────────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Leyendo CSV: ${maestra.length} socios, ${serviciosCsv.length} vínculos, ${preciosCsv.length} conceptos de precio.`)
  console.log('Leyendo estado actual de la base...')
  const estado = await cargarEstadoActual()
  console.log(`  ${estado.totalSocios} socios en la base.`)

  const clasificacion = clasificarSocios(maestra, estado)
  const diffCat = diffCategorias(clasificacion.matcheados, estado)
  const diffServ = diffServicios(serviciosCsv, clasificacion.matcheados, estado)
  const sinLiquidacion = calcularSinLiquidacion(clasificacion.matcheados)
  const becas = calcularBecasPendientes(clasificacion.matcheados)
  const diffPrecios = diffPreciosCatalogo(preciosCsv, estado)
  const facturacion = calcularFacturacionEstimada(clasificacion.matcheados)

  const reporte = armarReporte(estado, clasificacion, diffCat, diffServ, sinLiquidacion, becas, diffPrecios, facturacion)

  console.log('\n' + JSON.stringify(reporte, null, 2))

  console.log('\n─── Resumen ───')
  console.log(`Socios en maestro: ${reporte.socios.en_maestro}`)
  console.log(`Excluidos institucionales: ${reporte.socios.excluidos_institucionales} (esperado: 6)`)
  console.log(`No matcheados: ${reporte.socios.no_matcheados.length} (esperado: 0)`)
  console.log(`Categorías a actualizar: ${diffCat.length} (esperado: 59)`)
  console.log(`Sin liquidación (revisar Secretaría): ${sinLiquidacion.length} (esperado: 34)`)
  console.log(`Becados pendiente de decisión: ${becas.total} (esperado: 31)`)
  console.log(`Facturación mensual estimada: $${facturacion.toLocaleString('es-AR')} (esperado: $57.185.000)`)
  for (const [nombre, d] of Object.entries(reporte.servicios.por_servicio)) {
    console.log(`  ${nombre}: +${d.agregar} / -${d.eliminar} / ~${d.actualizar_importe} → quedan ${d.vigentes_post}`)
  }
  console.log(`Total vínculos socio↔servicio post: ${reporte.servicios.total_vinculos_post} (esperado: 970)`)

  if (!COMMIT) {
    console.log('\nDry-run: no se escribió nada en la base (ni siquiera el registro de auditoría). Corré con --commit cuando esté confirmado.')
    return
  }

  console.log('\nAplicando cambios en serio...')
  const errores = await aplicar(diffCat, diffServ, estado)

  const { error: logError } = await supabase.from('reconciliaciones_socios').insert({
    dry_run: false,
    resumen: { ...reporte, dry_run: false, errores },
  })
  if (logError) console.error(`  [warn] no se pudo guardar el registro de auditoría: ${logError.message}`)

  if (errores.length) {
    console.error(`\n${errores.length} errores durante la aplicación:`)
    console.error(JSON.stringify(errores, null, 2))
    process.exitCode = 1
  } else {
    console.log('\nListo, sin errores.')
  }
}

main().catch((err) => {
  console.error('\nError fatal:', err.message)
  process.exit(1)
})
