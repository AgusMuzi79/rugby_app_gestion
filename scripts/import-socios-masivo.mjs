// Import masivo del padrón real de socios (Tabla de datos NUVIX + padrón UAR).
//
// Uso:
//   cd scripts && npm install
//   SUPABASE_SERVICE_ROLE_KEY=... node import-socios-masivo.mjs                 # dry-run (default, no escribe nada)
//   SUPABASE_SERVICE_ROLE_KEY=... node import-socios-masivo.mjs --commit        # corre en serio
//   node import-socios-masivo.mjs --file "C:\ruta\otro.xlsx"                    # override del archivo fuente
//
// La service_role key se consigue en Supabase Dashboard → Project Settings → API → service_role (secret).
// Nunca se commitea ni se imprime en este script.
//
// Decisiones aplicadas (ver memoria del proyecto / conversación):
//   - Categoría "Cliente" (6 socios, sin precio confirmado): excluidos de esta carga.
//   - Servicio "Tenis Carnet" (155 socios): catálogo separado creado en la migración previa,
//     pero acá se los vincula al servicio "Tenis" existente (misma cuota, sin duplicar cargo).
//   - DNI inválido/faltante (~48 filas): se genera un DNI sintético "SD{cod_cliente}" (único,
//     claramente marcado). No podrán loguearse con un DNI real hasta que secretaría lo cargue.
//   - Fichaje UAR vigente = ult_fichaje_uar === temporada actual → fichado_temporada_actual = true.
//   - cabecera_id se resuelve en una segunda pasada (necesita que todos los socios ya existan).
//   - El script es idempotente: si el DNI (o numero_socio para los sintéticos) ya existe, se saltea.

import XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const args = process.argv.slice(2)
const COMMIT = args.includes('--commit')
const fileArgIdx = args.indexOf('--file')
const FILE_PATH = fileArgIdx >= 0
  ? args[fileArgIdx + 1]
  : path.join(__dirname, '..', 'data', 'import', 'socios_activos_maestra.xlsx')

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tlexvbattnzpmdftjsao.supabase.co'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SEASON_YEAR = String(new Date().getFullYear())

if (COMMIT && !SERVICE_ROLE_KEY) {
  console.error('Falta SUPABASE_SERVICE_ROLE_KEY en el entorno. No se puede correr --commit sin ella.')
  process.exit(1)
}

const supabase = SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : null

// ─── Parseo del archivo ────────────────────────────────────────────────────────

const wb = XLSX.readFile(FILE_PATH)
const sheet = wb.Sheets['Socios activos']
if (!sheet) { console.error('No se encontró la hoja "Socios activos" en el archivo.'); process.exit(1) }

const json = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false })
const header = json[3]
const col = (name) => {
  const i = header.indexOf(name)
  if (i === -1) throw new Error(`Columna no encontrada en el header: ${name}`)
  return i
}

const C = {
  cod: col('nuvix_cod_cliente'),
  nombre: col('nombre'),
  documento: col('documento'),
  documentoValido: col('documento_valido'),
  fechaNacimiento: col('fecha_nacimiento'),
  emailLogin: col('email_login'),
  categoriaSocio: col('categoria_socio'),
  servicioOpcional: col('servicio_opcional'),
  cabeceraCod: col('cabecera_cod_cliente'),
  enUar: col('en_uar'),
  division: col('division'),
  ultFichajeUar: col('ult_fichaje_uar'),
}

const rawRows = json.slice(4).filter((r) => r && r[C.cod])

// ─── Mapeo de categoría de división por nombre (edad/género) ──────────────────

function mapCategoriaDivision(nombreDivision) {
  if (/Femenino/i.test(nombreDivision)) return 'femenino'
  if (/Inclusivo/i.test(nombreDivision)) return 'mixed'
  if (/^Mayores/i.test(nombreDivision)) return 'superior'
  if (/^Infantil$/i.test(nombreDivision)) return 'infantil'
  const m = nombreDivision.match(/^M(\d+)/)
  if (m) {
    const n = parseInt(m[1], 10)
    if (n <= 12) return 'infantil'
    if (n <= 18) return 'juvenil'
    return 'superior'
  }
  return 'juvenil' // fallback defensivo, no debería pisarse con la data actual
}

// ─── Transformación de filas ────────────────────────────────────────────────────

const EXCLUDED_CATEGORIA = 'Cliente'

const excluded = []
const rows = []

for (const r of rawRows) {
  const categoriaSocio = r[C.categoriaSocio]
  if (categoriaSocio === EXCLUDED_CATEGORIA) {
    excluded.push({ cod: r[C.cod], nombre: r[C.nombre], motivo: 'categoria_cliente_sin_precio' })
    continue
  }

  const documentoValido = r[C.documentoValido] === 'TRUE'
  const cod = r[C.cod]
  const dni = documentoValido ? r[C.documento].trim() : `SD${cod}`
  const enUar = r[C.enUar] === 'TRUE'
  const division = r[C.division] || null
  const fechaNacimiento = r[C.fechaNacimiento] || null

  let servicioNombre = r[C.servicioOpcional] || null
  if (servicioNombre === 'Tenis Carnet') servicioNombre = 'Tenis' // decisión: misma cuota que Tenis

  rows.push({
    cod,
    nombre: r[C.nombre],
    dni,
    dniSintetico: !documentoValido,
    fechaNacimiento,
    emailLogin: r[C.emailLogin],
    categoriaSocioNombre: categoriaSocio,
    servicioNombre,
    servicioOriginal: r[C.servicioOpcional] || null,
    // el maestro pone el propio cod en cabecera_cod_cliente para los titulares (auto-referencia) — ignorar ese caso
    cabeceraCod: (r[C.cabeceraCod] && r[C.cabeceraCod] !== r[C.cod]) ? r[C.cabeceraCod] : null,
    enUar,
    division,
    fichadoVigente: r[C.ultFichajeUar] === SEASON_YEAR,
  })
}

// divisiones necesarias (solo entre los que están en UAR con división asignada)
const divisionesNecesarias = new Map()
for (const row of rows) {
  if (row.enUar && row.division && !divisionesNecesarias.has(row.division)) {
    divisionesNecesarias.set(row.division, mapCategoriaDivision(row.division))
  }
}

// ─── Reporte (dry-run y commit comparten esto) ─────────────────────────────────

function printSummary() {
  console.log('='.repeat(70))
  console.log(`Archivo: ${FILE_PATH}`)
  console.log(`Modo: ${COMMIT ? 'COMMIT (escribe en la DB)' : 'DRY-RUN (no escribe nada)'}`)
  console.log(`Temporada actual (para fichaje vigente): ${SEASON_YEAR}`)
  console.log('='.repeat(70))

  console.log(`\nFilas totales en el archivo: ${rawRows.length}`)
  console.log(`Excluidas (categoría "Cliente"): ${excluded.length}`)
  console.log(`A importar: ${rows.length}`)

  const sintetico = rows.filter((r) => r.dniSintetico)
  console.log(`\nCon DNI sintético (SD{cod}, sin documento válido): ${sintetico.length}`)
  if (sintetico.length) {
    console.log('  Muestra:', sintetico.slice(0, 5).map((r) => `${r.nombre} → ${r.dni}`).join(' | '))
  }

  const conCabecera = rows.filter((r) => r.cabeceraCod)
  console.log(`\nCon cabecera de grupo familiar a resolver: ${conCabecera.length}`)

  const conServicio = rows.filter((r) => r.servicioNombre)
  console.log(`\nCon servicio opcional vinculado: ${conServicio.length}`)
  const porServicio = {}
  for (const r of conServicio) porServicio[r.servicioNombre] = (porServicio[r.servicioNombre] || 0) + 1
  console.log('  Por servicio:', JSON.stringify(porServicio))
  const tenisCarnetOriginal = rows.filter((r) => r.servicioOriginal === 'Tenis Carnet').length
  console.log(`  (De los cuales ${tenisCarnetOriginal} eran "Tenis Carnet" en el origen → vinculados a "Tenis")`)

  const enUarConDivision = rows.filter((r) => r.enUar && r.division)
  console.log(`\nJugadores UAR a vincular (con división): ${enUarConDivision.length}`)
  console.log(`  Fichaje vigente (${SEASON_YEAR}): ${enUarConDivision.filter((r) => r.fichadoVigente).length}`)
  console.log(`  Sin fichaje vigente (entrenan, no habilitados para mesa): ${enUarConDivision.filter((r) => !r.fichadoVigente).length}`)

  console.log(`\nDivisiones a crear (si no existen ya): ${divisionesNecesarias.size}`)
  const divisionesOrdenadas = [...divisionesNecesarias.entries()].sort()
  for (const [nombre, categoria] of divisionesOrdenadas) {
    const count = rows.filter((r) => r.division === nombre).length
    console.log(`  ${nombre.padEnd(20)} → categoria='${categoria}'  (${count} jugadores)`)
  }

  const porCategoriaSocio = {}
  for (const r of rows) porCategoriaSocio[r.categoriaSocioNombre] = (porCategoriaSocio[r.categoriaSocioNombre] || 0) + 1
  console.log('\nPor categoría de socio:')
  for (const [k, v] of Object.entries(porCategoriaSocio)) console.log(`  ${k.padEnd(28)} ${v}`)

  console.log('\n' + '='.repeat(70))
}

// ─── Ejecución real ─────────────────────────────────────────────────────────────

async function run() {
  printSummary()

  if (!COMMIT) {
    console.log('\nDry-run: no se escribió nada. Corré con --commit cuando esté confirmado.')
    return
  }

  console.log('\nIniciando carga real contra Supabase...\n')

  // PostgREST devuelve máximo 1000 filas por default — paginar para tablas que pueden superarlo.
  async function selectAll(table, columns) {
    const pageSize = 1000
    let all = []
    let from = 0
    for (;;) {
      const { data, error } = await supabase.from(table).select(columns).range(from, from + pageSize - 1)
      if (error) throw error
      all = all.concat(data)
      if (data.length < pageSize) break
      from += pageSize
    }
    return all
  }

  // 1. Referencias
  const { data: categorias, error: catErr } = await supabase.from('categorias_socio').select('id, nombre')
  if (catErr) throw catErr
  const categoriaIdByNombre = new Map(categorias.map((c) => [c.nombre, c.id]))

  const { data: servicios, error: servErr } = await supabase.from('servicios_opcionales').select('id, nombre')
  if (servErr) throw servErr
  const servicioIdByNombre = new Map(servicios.map((s) => [s.nombre, s.id]))

  const { data: divisionesExistentes, error: divErr } = await supabase.from('divisiones').select('id, nombre')
  if (divErr) throw divErr
  const divisionIdByNombre = new Map(divisionesExistentes.map((d) => [d.nombre, d.id]))

  // 2. Crear divisiones faltantes
  for (const [nombre, categoria] of divisionesNecesarias) {
    if (divisionIdByNombre.has(nombre)) continue
    const { data, error } = await supabase
      .from('divisiones')
      .insert({ nombre, categoria, deporte: 'rugby' })
      .select('id')
      .single()
    if (error) throw new Error(`Error creando división ${nombre}: ${error.message}`)
    divisionIdByNombre.set(nombre, data.id)
    console.log(`  división creada: ${nombre} (${categoria})`)
  }

  // 3. Índice de socios existentes por dni (idempotencia)
  const sociosExistentes = await selectAll('socios', 'id, dni, numero_socio')
  const socioIdByDni = new Map(sociosExistentes.map((s) => [s.dni, s.id]))

  const codToSocioId = new Map()
  const results = { creados: 0, saltados: 0, errores: [] }

  // 4. Pool de concurrencia simple
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

  await pool(rows, async (row) => {
    try {
      if (socioIdByDni.has(row.dni)) {
        codToSocioId.set(row.cod, socioIdByDni.get(row.dni))
        results.saltados++
        return
      }

      const categoriaId = categoriaIdByNombre.get(row.categoriaSocioNombre)
      if (!categoriaId) throw new Error(`Categoría no encontrada en DB: ${row.categoriaSocioNombre}`)

      const { data: userData, error: createErr } = await supabase.auth.admin.createUser({
        email: row.emailLogin,
        password: row.dni,
        email_confirm: true,
        user_metadata: { nombre: row.nombre },
      })
      if (createErr || !userData.user) throw new Error(`Auth: ${createErr?.message ?? 'sin usuario'}`)
      const userId = userData.user.id

      const { error: profileErr } = await supabase
        .from('profiles')
        .insert({ id: userId, nombre: row.nombre, rol: 'socio', roles: ['socio'], divisiones: null })
      if (profileErr) { await supabase.auth.admin.deleteUser(userId); throw new Error(`Profile: ${profileErr.message}`) }

      const { data: socioData, error: socioErr } = await supabase
        .from('socios')
        .insert({
          profile_id: userId,
          numero_socio: row.cod,
          dni: row.dni,
          fecha_nacimiento: row.fechaNacimiento,
          categoria_id: categoriaId,
          estado: 'pendiente',
          foto_validada: false,
        })
        .select('id')
        .single()
      if (socioErr || !socioData) { await supabase.auth.admin.deleteUser(userId); throw new Error(`Socio: ${socioErr?.message ?? 'sin id'}`) }

      codToSocioId.set(row.cod, socioData.id)

      if (row.servicioNombre) {
        const servicioId = servicioIdByNombre.get(row.servicioNombre)
        if (servicioId) {
          const { error: servLinkErr } = await supabase
            .from('socio_servicios')
            .insert({ socio_id: socioData.id, servicio_id: servicioId })
          if (servLinkErr) console.error(`  [warn] servicio ${row.nombre}: ${servLinkErr.message}`)
        }
      }

      if (row.enUar && row.division) {
        const divisionId = divisionIdByNombre.get(row.division)
        const { error: jugadorErr } = await supabase
          .from('jugadores')
          .insert({
            nombre_completo: row.nombre,
            dni: row.dni,
            fecha_nacimiento: row.fechaNacimiento,
            division_id: divisionId,
            activo: true,
            fichado_temporada_actual: row.fichadoVigente,
            socio_id: socioData.id,
          })
        if (jugadorErr) console.error(`  [warn] jugador ${row.nombre}: ${jugadorErr.message}`)
      }

      results.creados++
    } catch (e) {
      results.errores.push({ cod: row.cod, nombre: row.nombre, error: e.message })
    }
  })

  console.log(`\nCreados: ${results.creados} | Saltados (ya existían): ${results.saltados} | Errores: ${results.errores.length}`)
  if (results.errores.length) {
    console.log('\nErrores:')
    for (const e of results.errores) console.log(`  ${e.cod} ${e.nombre}: ${e.error}`)
  }

  // 5. Segunda pasada: cabecera_id
  console.log('\nResolviendo cabecera_id...')
  let cabeceraOk = 0
  let cabeceraFaltante = 0
  for (const row of rows) {
    if (!row.cabeceraCod) continue
    const socioId = codToSocioId.get(row.cod)
    const cabeceraId = codToSocioId.get(row.cabeceraCod)
    if (!socioId || !cabeceraId) { cabeceraFaltante++; continue }
    const { error } = await supabase.from('socios').update({ cabecera_id: cabeceraId }).eq('id', socioId)
    if (error) console.error(`  [warn] cabecera_id de ${row.nombre}: ${error.message}`)
    else cabeceraOk++
  }
  console.log(`  cabecera_id seteado en ${cabeceraOk} socios (${cabeceraFaltante} sin resolver)`)

  console.log('\nListo.')
}

run().catch((e) => {
  console.error('\nError fatal:', e)
  process.exit(1)
})
