// Edge Function: importar-socios
//
// Importador mensual del padrón de socios (Padron Extendido.xlt.xls, export
// NUVIX plano). Ver openspec/changes/importador-mensual-socios/.
//
// A diferencia de importar-deuda, acá "ausencia = baja" bloquea logins
// reales, así que corre en 2 modos (mismo archivo, campo `modo` en el FormData):
//   - preview   → calcula el diff completo, no escribe nada
//   - confirmar → recalcula el diff y lo aplica (altas/bajas/reingresos/cambios)
//
// No usa una función SQL SECURITY DEFINER como importar_deuda_nuvix — las
// altas y bajas necesitan auth.admin.createUser/updateUserById, que no se
// puede invocar desde una función Postgres pura (ver design.md §2/§8). Cada
// fila se procesa individualmente; un error puntual no aborta el resto del
// import, va a `errores_aplicacion` en la respuesta.
//
// Fuera de esta primera versión (ver design.md/tasks.md):
//   - Reconciliación de servicios opcionales/categoría de liquidación
//     (padrón de servicios, archivo aparte, Crystal Reports con bandas)
//   - Resolución de cabecera_id (el archivo lo da por NOMBRE, no código —
//     matchear por nombre es frágil, se decide aparte)
//   - Vínculo con jugadores/UAR (fuera de alcance, ver proposal.md)
//
// Callers permitidos: secretaria, admin.

import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { corsHeaders, jsonOk, jsonError } from '../_shared/cors.ts'
import { parsePadronSocios, categoriaNombreDb, type SocioPadron } from '../_shared/parse-padron-socios.ts'
import { enviarEmail, emailTemplate } from '../_shared/email.ts'
import { generateSecret } from '../_shared/totp.ts'
// xlsx es un paquete CJS — Deno lo importa por default export, mismo patrón
// que importar-deuda y scripts/import-socios-masivo.mjs.
import XLSX from 'npm:xlsx@0.18.5'

const ROLES_PERMITIDOS = ['secretaria', 'admin']

type MotivoBaja = 'ausencia' | 'cesante'

interface SocioDb {
  id:              string
  estado:          'activo' | 'pendiente' | 'inactivo'
  categoriaId:     string | null
  fechaNacimiento: string | null
  profileId:       string
  fotoValidada:    boolean
  cobroConTarjeta: boolean
}

interface DiffAlta {
  numeroSocio: string
  nombre:      string
  categoriaId: string
  dni:         string
  fechaNacimiento: string | null
  email:       string
  cobroConTarjeta: boolean
}

interface DiffBaja {
  numeroSocio: string
  nombre:      string
  socioId:     string
  profileId:   string
  motivo:      MotivoBaja
}

interface DiffReingreso {
  numeroSocio: string
  nombre:      string
  socioId:     string
  profileId:   string
  fotoValidada: boolean
  cobroConTarjeta: boolean
}

interface DiffActualizar {
  numeroSocio: string
  nombre:      string
  socioId:     string
  categoriaId: string | null
  fechaNacimiento: string | null
  cobroConTarjeta: boolean | null
}

interface DiffError {
  numeroSocio: string
  nombre:      string
  motivo:      string
}

interface Diff {
  altas:        DiffAlta[]
  bajas:        DiffBaja[]
  reingresos:   DiffReingreso[]
  actualizados: DiffActualizar[]
  sinCambio:    number
  errores:      DiffError[]
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
    return jsonError(403, 'Sin permiso — sólo Secretaría o Admin pueden importar el padrón de socios')
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
  const filas: SocioPadron[] = parsePadronSocios(rows)
  if (filas.length === 0) {
    return jsonError(400, 'No se pudo leer ninguna fila — ¿es el archivo correcto ("Padron Extendido")?')
  }

  // ─── Calcular diff contra la base ───────────────────────────────────────────
  // PostgREST devuelve máximo 1000 filas por default sin paginar — con ~1500
  // socios esto truncaba silenciosamente el mapa y hacía que cualquier socio
  // fuera del primer lote (orden no garantizado) apareciera como "alta"
  // aunque ya existiera. Mismo bug ya conocido en este proyecto (ver
  // selectAllRows en app/lib/supabase.ts y web/lib/supabase.ts) — acá faltaba
  // aplicarlo. Encontrado en vivo probando el import (2026-08-21).
  let sociosDbRaw: Record<string, unknown>[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from('socios')
      .select('id, numero_socio, estado, categoria_id, fecha_nacimiento, profile_id, foto_validada, excluir_de_import, cobro_con_tarjeta')
      .range(from, from + 999)
    if (error) return jsonError(500, `Error leyendo socios: ${error.message}`)
    sociosDbRaw = sociosDbRaw.concat(data ?? [])
    if (!data || data.length < 1000) break
  }

  const sociosDb = new Map<string, SocioDb>(
    (sociosDbRaw ?? [])
      .filter(s => !s.excluir_de_import)
      .map(s => [String(s.numero_socio), {
        id:              s.id as string,
        estado:          s.estado as SocioDb['estado'],
        categoriaId:     s.categoria_id as string | null,
        fechaNacimiento: s.fecha_nacimiento as string | null,
        profileId:       s.profile_id as string,
        fotoValidada:    s.foto_validada as boolean,
        cobroConTarjeta: s.cobro_con_tarjeta as boolean,
      }])
  )

  const { data: categoriasRaw } = await supabaseAdmin.from('categorias_socio').select('id, nombre')
  const categoriaIdPorNombre = new Map<string, string>((categoriasRaw ?? []).map(c => [c.nombre as string, c.id as string]))

  const diff = calcularDiff(filas, sociosDb, categoriaIdPorNombre)

  if (modo === 'preview') {
    return jsonOk(resumenDiff(diff))
  }

  // ─── Aplicar ─────────────────────────────────────────────────────────────
  const resultado = await aplicarDiff(diff)
  const erroresTotales = [...diff.errores, ...resultado.errores]

  const { data: importacion, error: importErr } = await supabaseAdmin
    .from('importaciones_socios')
    .insert({
      archivo_nombre: archivo.name,
      altas:          resultado.altasOk.length,
      bajas:          resultado.bajasOk.length,
      actualizados:   resultado.actualizadosOk.length + resultado.reingresosOk.length,
      sin_cambio:     diff.sinCambio,
      errores:        erroresTotales.length,
      importado_por:  caller.id,
    })
    .select('id')
    .single()

  if (importErr) console.error('Error registrando importaciones_socios:', importErr.message)

  if (importacion?.id && resultado.socioIdsAfectados.length > 0) {
    await supabaseAdmin
      .from('socios')
      .update({ ultima_importacion_id: importacion.id })
      .in('id', resultado.socioIdsAfectados)
  }

  // Mails de baja — fire and forget, no bloquea la respuesta al panel
  EdgeRuntime.waitUntil(enviarMailsBaja(resultado.bajasParaMail))

  // Ojo: esto refleja lo que REALMENTE se aplicó (resultado.*Ok), no el diff
  // calculado antes de aplicar — un alta puede figurar en el diff y fallar
  // al crearse (ver aplicarDiff), así que el número real puede ser menor.
  return jsonOk({
    importacion_id: importacion?.id ?? null,
    aplicado:      true,
    altas:         resultado.altasOk.length,
    bajas:         resultado.bajasOk.length,
    reingresos:    resultado.reingresosOk.length,
    actualizados:  resultado.actualizadosOk.length,
    sin_cambio:    diff.sinCambio,
    errores:       erroresTotales.length,
    detalle: {
      altas:        resultado.altasOk.map(a => ({ numero_socio: a.numeroSocio, nombre: a.nombre })),
      bajas:        resultado.bajasOk.map(b => ({ numero_socio: b.numeroSocio, nombre: b.nombre, motivo: b.motivo })),
      reingresos:   resultado.reingresosOk.map(r => ({ numero_socio: r.numeroSocio, nombre: r.nombre })),
      actualizados: resultado.actualizadosOk.map(u => ({ numero_socio: u.numeroSocio, nombre: u.nombre })),
      errores:      erroresTotales.map(e => ({ numero_socio: e.numeroSocio, nombre: e.nombre, motivo: e.motivo })),
    },
  })
})

// ─── Diff ───────────────────────────────────────────────────────────────────

function calcularDiff(
  filas: SocioPadron[],
  sociosDb: Map<string, SocioDb>,
  categoriaIdPorNombre: Map<string, string>,
): Diff {
  const diff: Diff = { altas: [], bajas: [], reingresos: [], actualizados: [], sinCambio: 0, errores: [] }

  const filaPorNumeroSocio    = new Map(filas.map(f => [f.numeroSocio, f]))
  const vigentesPorNumeroSocio = new Map(filas.filter(f => f.estado === 'SOCIO').map(f => [f.numeroSocio, f]))

  // Altas / actualizados / reingresos / sin_cambio — a partir de lo vigente en el archivo
  for (const [numeroSocio, fila] of vigentesPorNumeroSocio) {
    const categoriaNombre = categoriaNombreDb(fila.categoriaRaw)
    const categoriaId     = categoriaNombre ? categoriaIdPorNombre.get(categoriaNombre) ?? null : null

    const existente = sociosDb.get(numeroSocio)

    if (!existente) {
      if (!categoriaId) {
        diff.errores.push({ numeroSocio, nombre: fila.nombre, motivo: `categoría sin mapear: "${fila.categoriaRaw}"` })
        continue
      }
      diff.altas.push({
        numeroSocio, nombre: fila.nombre, categoriaId,
        dni: fila.dni, fechaNacimiento: fila.fechaNacimiento, email: fila.email,
        cobroConTarjeta: fila.pagaConTarjeta,
      })
      continue
    }

    if (existente.estado === 'inactivo') {
      diff.reingresos.push({
        numeroSocio, nombre: fila.nombre,
        socioId: existente.id, profileId: existente.profileId, fotoValidada: existente.fotoValidada,
        cobroConTarjeta: fila.pagaConTarjeta,
      })
      continue
    }

    // activo/pendiente — ¿cambió categoría, fecha de nacimiento o forma de cobro?
    const cambioCategoria = !!categoriaId && categoriaId !== existente.categoriaId
    const cambioFecha     = !!fila.fechaNacimiento && fila.fechaNacimiento !== existente.fechaNacimiento
    const cambioTarjeta   = fila.pagaConTarjeta !== existente.cobroConTarjeta
    if (cambioCategoria || cambioFecha || cambioTarjeta) {
      diff.actualizados.push({
        numeroSocio, nombre: fila.nombre, socioId: existente.id,
        categoriaId:     cambioCategoria ? categoriaId : null,
        fechaNacimiento: cambioFecha ? fila.fechaNacimiento : null,
        cobroConTarjeta: cambioTarjeta ? fila.pagaConTarjeta : null,
      })
    } else {
      diff.sinCambio++
    }
  }

  // Bajas — todo lo que hoy está activo/pendiente en la base y no es "vigente" en el archivo
  for (const [numeroSocio, socio] of sociosDb) {
    if (socio.estado !== 'activo' && socio.estado !== 'pendiente') continue
    if (vigentesPorNumeroSocio.has(numeroSocio)) continue

    const filaOriginal = filaPorNumeroSocio.get(numeroSocio)
    const motivo: MotivoBaja = filaOriginal?.estado === 'CESANTES' ? 'cesante' : 'ausencia'

    diff.bajas.push({
      numeroSocio,
      nombre:    filaOriginal?.nombre ?? '',
      socioId:   socio.id,
      profileId: socio.profileId,
      motivo,
    })
  }

  return diff
}

function resumenDiff(diff: Diff) {
  return {
    altas:        diff.altas.length,
    bajas:        diff.bajas.length,
    reingresos:   diff.reingresos.length,
    actualizados: diff.actualizados.length,
    sin_cambio:   diff.sinCambio,
    errores:      diff.errores.length,
    detalle: {
      altas:        diff.altas.map(a => ({ numero_socio: a.numeroSocio, nombre: a.nombre })),
      bajas:        diff.bajas.map(b => ({ numero_socio: b.numeroSocio, nombre: b.nombre, motivo: b.motivo })),
      reingresos:   diff.reingresos.map(r => ({ numero_socio: r.numeroSocio, nombre: r.nombre })),
      actualizados: diff.actualizados.map(u => ({ numero_socio: u.numeroSocio, nombre: u.nombre })),
      errores:      diff.errores.map(e => ({ numero_socio: e.numeroSocio, nombre: e.nombre, motivo: e.motivo })),
    },
  }
}

// ─── Aplicar ────────────────────────────────────────────────────────────────

async function aplicarDiff(diff: Diff) {
  const socioIdsAfectados: string[] = []
  const bajasParaMail: { profileId: string; nombre: string; motivo: MotivoBaja }[] = []
  const altasOk: DiffAlta[] = []
  const bajasOk: DiffBaja[] = []
  const reingresosOk: DiffReingreso[] = []
  const actualizadosOk: DiffActualizar[] = []
  const errores: DiffError[] = []

  for (const alta of diff.altas) {
    try {
      let email = alta.email
      let { data: userData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: alta.dni,
        email_confirm: true,
        user_metadata: { nombre: alta.nombre },
      })

      // Red de seguridad: el parser ya resuelve mails compartidos entre
      // familiares (resolverEmailsDuplicados en parse-padron-socios.ts), pero
      // por si igual colisiona contra un mail ya existente (ej. alguien con
      // cuenta creada por otra vía) — un solo reintento con el mail sintético
      // en vez de perder el alta entera.
      const yaExiste = createErr?.message?.toLowerCase().includes('already') || createErr?.message?.toLowerCase().includes('exists')
      if (yaExiste && !email.endsWith('@uncas.local')) {
        email = `socio-${alta.numeroSocio}@uncas.local`
        ;({ data: userData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: alta.dni,
          email_confirm: true,
          user_metadata: { nombre: alta.nombre },
        }))
      }

      if (createErr || !userData.user) throw new Error(createErr?.message ?? 'sin usuario')
      const userId = userData.user.id

      const { error: profileErr } = await supabaseAdmin
        .from('profiles')
        .insert({ id: userId, nombre: alta.nombre, rol: 'socio', roles: ['socio'], divisiones: null })
      if (profileErr) { await supabaseAdmin.auth.admin.deleteUser(userId); throw new Error(profileErr.message) }

      const { data: socioData, error: socioErr } = await supabaseAdmin
        .from('socios')
        .insert({
          profile_id:       userId,
          numero_socio:     alta.numeroSocio,
          dni:              alta.dni,
          categoria_id:     alta.categoriaId,
          fecha_nacimiento: alta.fechaNacimiento,
          estado:           'pendiente',
          foto_validada:    false,
          cobro_con_tarjeta: alta.cobroConTarjeta,
        })
        .select('id')
        .single()
      if (socioErr || !socioData) { await supabaseAdmin.auth.admin.deleteUser(userId); throw new Error(socioErr?.message ?? 'sin id') }

      const { error: secretErr } = await supabaseAdmin
        .from('socios_secrets')
        .insert({ socio_id: socioData.id, totp_secret: generateSecret() })
      if (secretErr) console.error(`[warn] TOTP de ${alta.numeroSocio}: ${secretErr.message}`)

      socioIdsAfectados.push(socioData.id)
      altasOk.push(alta)
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e)
      errores.push({ numeroSocio: alta.numeroSocio, nombre: alta.nombre, motivo })
      console.error(`Error dando de alta a ${alta.numeroSocio} (${alta.nombre}):`, motivo)
    }
  }

  for (const baja of diff.bajas) {
    try {
      const [banRes, socioRes] = await Promise.all([
        supabaseAdmin.auth.admin.updateUserById(baja.profileId, { ban_duration: '876000h' }),
        supabaseAdmin.from('socios').update({ estado: 'inactivo' }).eq('id', baja.socioId),
      ])
      if (banRes.error) throw new Error(banRes.error.message)
      if (socioRes.error) throw new Error(socioRes.error.message)

      socioIdsAfectados.push(baja.socioId)
      bajasParaMail.push({ profileId: baja.profileId, nombre: baja.nombre, motivo: baja.motivo })
      bajasOk.push(baja)
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e)
      errores.push({ numeroSocio: baja.numeroSocio, nombre: baja.nombre, motivo })
      console.error(`Error dando de baja a ${baja.numeroSocio} (${baja.nombre}):`, motivo)
    }
  }

  for (const r of diff.reingresos) {
    try {
      const nuevoEstado = r.fotoValidada ? 'activo' : 'pendiente'
      const [unbanRes, socioRes] = await Promise.all([
        supabaseAdmin.auth.admin.updateUserById(r.profileId, { ban_duration: 'none' }),
        supabaseAdmin.from('socios').update({ estado: nuevoEstado, cobro_con_tarjeta: r.cobroConTarjeta }).eq('id', r.socioId),
      ])
      if (unbanRes.error) throw new Error(unbanRes.error.message)
      if (socioRes.error) throw new Error(socioRes.error.message)

      socioIdsAfectados.push(r.socioId)
      reingresosOk.push(r)
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e)
      errores.push({ numeroSocio: r.numeroSocio, nombre: r.nombre, motivo })
      console.error(`Error reingresando a ${r.numeroSocio} (${r.nombre}):`, motivo)
    }
  }

  for (const u of diff.actualizados) {
    try {
      const patch: Record<string, unknown> = {}
      if (u.categoriaId)             patch.categoria_id     = u.categoriaId
      if (u.fechaNacimiento)         patch.fecha_nacimiento = u.fechaNacimiento
      if (u.cobroConTarjeta !== null) patch.cobro_con_tarjeta = u.cobroConTarjeta

      const { error } = await supabaseAdmin.from('socios').update(patch).eq('id', u.socioId)
      if (error) throw new Error(error.message)

      socioIdsAfectados.push(u.socioId)
      actualizadosOk.push(u)
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e)
      errores.push({ numeroSocio: u.numeroSocio, nombre: u.nombre, motivo })
      console.error(`Error actualizando a ${u.numeroSocio} (${u.nombre}):`, motivo)
    }
  }

  return { altasOk, bajasOk, reingresosOk, actualizadosOk, errores, socioIdsAfectados, bajasParaMail }
}

// ─── Mail de baja ─────────────────────────────────────────────────────────────
//
// Decisión del club (design.md §7): toda baja del importador manda mail —
// texto distinto si es por ausencia del padrón o específicamente por estar
// en situación de cesante.

async function enviarMailsBaja(bajas: { profileId: string; nombre: string; motivo: MotivoBaja }[]): Promise<void> {
  if (bajas.length === 0) return
  let enviados = 0, omitidos = 0, errores = 0

  for (const b of bajas) {
    const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(b.profileId)
    const email = user?.email ?? ''
    if (!email || email.endsWith('@uncas.local')) { omitidos++; continue }

    const html = b.motivo === 'cesante'
      ? emailTemplate(`
          <p style="font-size:15px">Hola ${b.nombre},</p>
          <p style="font-size:15px;line-height:1.6">Te informamos que tu cuenta en la app quedó dada de baja por figurar en situación de <strong>cesante</strong> (plan de regularización de deuda) en los registros del club.</p>
          <p style="font-size:15px;line-height:1.6">Para regularizar tu situación y recuperar el acceso, contactate con Secretaría.</p>
        `)
      : emailTemplate(`
          <p style="font-size:15px">Hola ${b.nombre},</p>
          <p style="font-size:15px;line-height:1.6">Te informamos que tu cuenta en la app de UNCAS Rugby Club fue dada de baja, según los registros actuales del club.</p>
          <p style="font-size:15px;line-height:1.6">Si creés que se trata de un error, contactate con Secretaría.</p>
        `)

    const ok = await enviarEmail({ to: email, subject: 'Baja de tu cuenta — UNCAS Rugby Club', html })
    ok ? enviados++ : errores++
  }

  console.log(`Mails de baja: ${enviados} enviados, ${omitidos} omitidos (sin mail válido), ${errores} con error, de ${bajas.length}.`)
}
