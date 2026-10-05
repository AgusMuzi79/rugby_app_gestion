// Edge Function: gimnasio-turnos-admin
// Administración del turnero del gimnasio para el encargado (ver 20261005000000_gimnasio_turnos).
//
// Actions (body.action):
//   franjas-listar     — todas las franjas (activas e inactivas) de la plantilla semanal.
//   franja-guardar     — { id?, dia_semana, hora_desde, hora_hasta, cupo, profesor?, activa? } alta o edición.
//                        `profesor` es texto libre opcional (máx. 80); null o '' lo borra; si no viene en una
//                        edición, queda como estaba.
//   franjas-importar   — { filas, modo, solo_vista_previa?, plan_hash? } calendario completo (RPC
//                        gimnasio_importar_franjas): modo 'agregar' | 'reemplazar'; con solo_vista_previa:true no
//                        escribe, sólo cuenta y devuelve `plan_hash` (huella del plan). Al aplicar
//                        (solo_vista_previa false) `plan_hash` es OBLIGATORIO: si el calendario cambió desde la vista
//                        previa => 200 { ok:false, codigo:'plan_cambio' } sin escribir. Validaciones del calendario
//                        => 200 { ok:false, errores:[{fila,motivo}] }; solape con otra franja activa => codigo 'solape'.
//                        La validación de la entrada vive en _shared/calendario.ts (con su check).
//   franja-desactivar  — { franja_id } baja lógica (activa=false). Sus reservas futuras NO se tocan:
//                        se devuelve cuántas quedan para que el encargado decida.
//   excepcion-guardar  — { fecha, franja_id|null, cerrado, cupo_override|null, motivo, solo_vista_previa? } una por
//                        fecha+franja (franja_id null = toda la fecha); si ya existe se actualiza. Cerrar exige
//                        `motivo` (3-300): cancela las reservas afectadas y avisa por push a sus socios. Con
//                        solo_vista_previa:true no escribe ni envía nada, sólo cuenta (ver handleExcepcionGuardar).
//   excepcion-borrar   — { excepcion_id }. No restaura reservas canceladas por un cierre.
//   excepciones-listar — { desde, hasta }.
//   ocupacion          — { fecha } por franja: capacidad, ocupados y la lista de reservas con datos del socio
//                        (sólo lectura: el encargado NO anota a nadie, reservan los socios).
//   reserva-cancelar   — { reserva_id }.
//   config-get / config-guardar — modo_cupos (informativo|bloqueante), ventana de reserva (mes|dias),
//                        anticipación (sólo modo 'dias'), % de fijos, faltas de aviso y de baja, tolerancia.
//
// Seguridad: JWT requerido; el rol sale de profiles.rol del caller (nunca del body) y debe ser
// 'porteria' (el encargado, label "Gimnasio"), 'admin' o 'subcomision'. Todo lo escribe esta función con
// service_role: las tablas no tienen policy de escritura para clientes.
//
// Contrato de errores: fallas de validación/negocio => HTTP 200 { ok:false, motivo, codigo? }
// (supabase.functions.invoke oculta el body de los no-2xx); errores reales de DB => 500.
// Zona horaria: UTC-3 fijo. Día de semana ISO: 1 = lunes … 7 = domingo.

import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { corsHeaders, jsonOk, jsonError } from '../_shared/cors.ts'
import {
  CUPO_MAX,
  esEntero,
  hhmm,
  normalizarHora,
  normalizarProfesor,
  validarImportacion,
} from '../_shared/calendario.ts'

const ROLES_PERMITIDOS = ['porteria', 'admin', 'subcomision']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_DIAS_EXCEPCIONES = 366
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const EXPO_PUSH_CHUNK_SIZE = 100
// Tope por chunk: el push corre después de cancelar y confirmar las reservas, así que si Expo
// se cuelga no debe llevarse puesta la respuesta (el chunk queda como no entregado).
const EXPO_PUSH_TIMEOUT_MS = 8000
const ID_CHUNK_SIZE = 100

// ─── Fechas y horas (UTC-3 fijo) ──────────────────────────────────────────────

function fechaISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function hoyLocal(): string {
  return fechaISO(new Date(Date.now() - 3 * 3600 * 1000))
}

function fechaValida(f: unknown): f is string {
  if (typeof f !== 'string' || !FECHA_RE.test(f)) return false
  const d = new Date(`${f}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && fechaISO(d) === f
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round((new Date(`${hasta}T00:00:00Z`).getTime() - new Date(`${desde}T00:00:00Z`).getTime()) / 86400000)
}

// hhmm, normalizarHora, esEntero, normalizarProfesor y CUPO_MAX viven en ../_shared/calendario.ts.

// ─── Respuestas ───────────────────────────────────────────────────────────────

function rechazo(motivo: string, extra: Record<string, unknown> = {}): Response {
  return jsonOk({ ok: false, motivo, ...extra })
}

// 23P01 = exclusion_violation: el EXCLUDE gimnasio_franjas_sin_solape (dos franjas activas del mismo
// día no pueden pisarse). Es un rechazo de negocio (200), no un error de la base.
const MOTIVO_SOLAPE = 'Esa franja se superpone con otra franja activa del mismo día.'

function esSolape(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === '23P01'
}

function errorDb(contexto: string, err: unknown): Response {
  console.error(`gimnasio-turnos-admin: ${contexto}`, err)
  return jsonError(500, 'Error interno')
}

// ─── Entrada ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!jwt) return jsonError(401, 'Sin autorización')

  const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(jwt)
  if (authErr || !caller) return jsonError(401, 'Token inválido')

  const { data: callerProfile, error: profileErr } = await supabaseAdmin
    .from('profiles')
    .select('rol')
    .eq('id', caller.id)
    .single()
  if (profileErr || !callerProfile) return errorDb('profiles', profileErr)

  if (!ROLES_PERMITIDOS.includes(callerProfile.rol ?? '')) {
    return jsonError(403, 'Sin permiso para administrar los turnos del gimnasio')
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return jsonError(400, 'Body inválido') }

  switch (body.action) {
    case 'franjas-listar':     return handleFranjasListar()
    case 'franja-guardar':     return handleFranjaGuardar(body)
    case 'franjas-importar':   return handleFranjasImportar(body)
    case 'franja-desactivar':  return handleFranjaDesactivar(body)
    case 'excepcion-guardar':  return handleExcepcionGuardar(body)
    case 'excepcion-borrar':   return handleExcepcionBorrar(body)
    case 'excepciones-listar': return handleExcepcionesListar(body)
    case 'ocupacion':          return handleOcupacion(body)
    case 'reserva-cancelar':   return handleReservaCancelar(body)
    case 'config-get':         return handleConfigGet()
    case 'config-guardar':     return handleConfigGuardar(body)
    default:                   return jsonError(400, `Acción desconocida: ${body.action}`)
  }
})

// ─── Utilidades de consulta ───────────────────────────────────────────────────

// Reservas vivas ('reservada') de una franja de hoy en adelante.
async function contarReservasFuturas(franjaId: string): Promise<number | Response> {
  const { count, error } = await supabaseAdmin
    .from('gimnasio_reservas')
    .select('id', { count: 'exact', head: true })
    .eq('franja_id', franjaId)
    .eq('estado', 'reservada')
    .gte('fecha', hoyLocal())
  if (error) return errorDb('contar reservas futuras', error)
  return count ?? 0
}

// ─── franjas ──────────────────────────────────────────────────────────────────

async function handleFranjasListar(): Promise<Response> {
  const { data, error } = await supabaseAdmin
    .from('gimnasio_franjas')
    .select('id, dia_semana, hora_desde, hora_hasta, cupo, profesor, activa')
    .order('dia_semana', { ascending: true })
    .order('hora_desde', { ascending: true })
  if (error) return errorDb('gimnasio_franjas', error)

  return jsonOk({
    ok: true,
    franjas: (data ?? []).map((f) => ({ ...f, hora_desde: hhmm(f.hora_desde), hora_hasta: hhmm(f.hora_hasta) })),
  })
}

async function handleFranjaGuardar(body: Record<string, unknown>): Promise<Response> {
  const id = body.id
  if (id !== undefined && id !== null && (typeof id !== 'string' || !UUID_RE.test(id))) {
    return rechazo('Franja inválida.')
  }
  const diaSemana = body.dia_semana
  const cupo = body.cupo
  if (!esEntero(diaSemana, 1, 7)) return rechazo('El día de la semana debe ser de 1 (lunes) a 7 (domingo).')
  const desde = normalizarHora(body.hora_desde)
  const hasta = normalizarHora(body.hora_hasta)
  if (!desde || !hasta) return rechazo('Los horarios deben tener formato HH:MM.')
  if (desde >= hasta) return rechazo('La hora de inicio debe ser anterior a la de fin.')
  if (!esEntero(cupo, 1, CUPO_MAX)) return rechazo(`El cupo debe ser un número entero entre 1 y ${CUPO_MAX}.`)
  if (body.activa !== undefined && typeof body.activa !== 'boolean') return rechazo('El campo "activa" es inválido.')
  let profesor: string | null | undefined // undefined = no tocar (en una edición)
  if (body.profesor !== undefined) {
    const p = normalizarProfesor(body.profesor)
    if ('error' in p) return rechazo(p.error)
    profesor = p.valor
  }

  let existente: { id: string; dia_semana: number; activa: boolean } | null = null
  if (typeof id === 'string') {
    const { data, error } = await supabaseAdmin
      .from('gimnasio_franjas')
      .select('id, dia_semana, activa')
      .eq('id', id)
      .maybeSingle()
    if (error) return errorDb('gimnasio_franjas', error)
    if (!data) return rechazo('La franja no existe.')
    existente = data
  }
  const activa = typeof body.activa === 'boolean' ? body.activa : (existente?.activa ?? true)

  // Reservas vivas en el futuro: si cambia el día de la semana quedarían en una fecha que ya no
  // corresponde a la franja, así que se bloquea; el resto de los cambios se permite y se avisa.
  let reservasFuturas = 0
  if (existente) {
    const n = await contarReservasFuturas(existente.id)
    if (n instanceof Response) return n
    reservasFuturas = n
    if (existente.dia_semana !== diaSemana && n > 0) {
      return rechazo(
        `La franja tiene ${n} reserva${n === 1 ? '' : 's'} futura${n === 1 ? '' : 's'}: no se puede cambiar el día. ` +
        'Creá una franja nueva y desactivá esta.',
        { codigo: 'reservas_futuras', reservas_futuras: n },
      )
    }
  }

  // Dos franjas activas del mismo día no pueden solaparse. Este chequeo da el mensaje amable; la garantía
  // real es el EXCLUDE de la base (una escritura concurrente que se cuele sale como 23P01, ver abajo).
  if (activa) {
    let q = supabaseAdmin
      .from('gimnasio_franjas')
      .select('id, hora_desde, hora_hasta')
      .eq('activa', true)
      .eq('dia_semana', diaSemana)
      .lt('hora_desde', hasta)
      .gt('hora_hasta', desde)
    if (existente) q = q.neq('id', existente.id)
    const { data: solapadas, error: solErr } = await q
    if (solErr) return errorDb('solapamiento', solErr)
    if (solapadas && solapadas.length > 0) {
      const s = solapadas[0]
      return rechazo(`Se solapa con la franja ${hhmm(s.hora_desde)}–${hhmm(s.hora_hasta)} de ese día.`, {
        codigo: 'solapada',
      })
    }
  }

  const valores: Record<string, unknown> = { dia_semana: diaSemana, hora_desde: desde, hora_hasta: hasta, cupo, activa }
  if (profesor !== undefined) valores.profesor = profesor
  const cols = 'id, dia_semana, hora_desde, hora_hasta, cupo, profesor, activa'
  const { data: guardada, error: saveErr } = existente
    ? await supabaseAdmin.from('gimnasio_franjas').update(valores).eq('id', existente.id).select(cols).single()
    : await supabaseAdmin.from('gimnasio_franjas').insert(valores).select(cols).single()
  if (saveErr && esSolape(saveErr)) return rechazo(MOTIVO_SOLAPE, { codigo: 'solapada' })
  if (saveErr || !guardada) return errorDb('guardar franja', saveErr)

  return jsonOk({
    ok: true,
    franja: { ...guardada, hora_desde: hhmm(guardada.hora_desde), hora_hasta: hhmm(guardada.hora_hasta) },
    reservas_futuras: reservasFuturas,
  })
}

// ─── importar calendario ──────────────────────────────────────────────────────

// Calendario completo: modo 'agregar' (conserva las franjas que el archivo no menciona) o 'reemplazar'
// (desactiva las activas que faltan; nunca borra). La lógica y la atomicidad viven en la RPC
// gimnasio_importar_franjas; acá se revalida el tipo de CADA campo antes de llamarla (el cliente
// no es de fiar; ver validarImportacion) y los rechazos de validación salen como HTTP 200 { ok:false, ... }.
// La vista previa devuelve `plan_hash`; al aplicar hay que enviarlo de vuelta: la RPC rechaza con
// codigo 'plan_cambio' si el plan recalculado ya no es el que el usuario revisó.
async function handleFranjasImportar(body: Record<string, unknown>): Promise<Response> {
  const v = validarImportacion(body)
  if (!v.ok) {
    const { motivo, ...extra } = v
    return rechazo(motivo, extra)
  }

  const { data, error } = await supabaseAdmin.rpc('gimnasio_importar_franjas', {
    p_filas: v.filas,
    p_modo: v.modo,
    p_aplicar: !v.soloVistaPrevia,
    p_plan_hash: v.planHash,
  })
  // Defensa en profundidad: la RPC ya atrapa el 23P01, pero si se escapara también es un rechazo.
  if (error && esSolape(error)) return rechazo(MOTIVO_SOLAPE, { codigo: 'solape' })
  if (error) return errorDb('gimnasio_importar_franjas', error)

  // {ok:false, codigo, motivo, errores?} (errores, plan_cambio, solape...) es un rechazo: 200, no 500.
  return jsonOk(data)
}

async function handleFranjaDesactivar(body: Record<string, unknown>): Promise<Response> {
  const franjaId = body.franja_id
  if (typeof franjaId !== 'string' || !UUID_RE.test(franjaId)) return rechazo('Franja inválida.')

  const { data, error } = await supabaseAdmin
    .from('gimnasio_franjas')
    .update({ activa: false })
    .eq('id', franjaId)
    .select('id')
  if (error && esSolape(error)) return rechazo(MOTIVO_SOLAPE, { codigo: 'solapada' })
  if (error) return errorDb('desactivar franja', error)
  if (!data?.length) return rechazo('La franja no existe.')

  // Las reservas futuras quedan: el encargado decide si las cancela una por una.
  const reservasFuturas = await contarReservasFuturas(franjaId)
  if (reservasFuturas instanceof Response) return reservasFuturas

  const { count: fijos, error: fijosErr } = await supabaseAdmin
    .from('gimnasio_turnos_fijos')
    .select('id', { count: 'exact', head: true })
    .eq('franja_id', franjaId)
    .eq('activo', true)
  if (fijosErr) return errorDb('contar turnos fijos', fijosErr)

  return jsonOk({ ok: true, reservas_futuras: reservasFuturas, turnos_fijos_activos: fijos ?? 0 })
}

// ─── excepciones ──────────────────────────────────────────────────────────────

const MOTIVO_MIN = 3
const MOTIVO_MAX = 300

const DIAS_NOMBRE = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

interface ReservaAfectada {
  reserva_id: string
  socio_id: string
  franja_id: string
  hora_desde: string
  hora_hasta: string
}

// Guarda (o actualiza) una excepción por fecha+franja.
//   · cerrado=true EXIGE `motivo` (3 a 300 caracteres): es el mensaje que ven los socios.
//   · Al confirmar un cierre se cancelan las reservas 'reservada' de la fecha (de la franja, o de
//     todas las que no tengan excepción propia si franja_id es null) y se avisa por push a cada socio
//     afectado. Una falla de push NO deshace la cancelación: se informa en `avisos_fallidos`.
//   · `solo_vista_previa: true` no escribe ni envía nada: devuelve cuántas reservas se cancelarían y a
//     cuántos socios se les avisaría, para que la web lo muestre antes de confirmar.
//   · Editar o borrar un cierre existente NUNCA restaura reservas ni vuelve a avisar: lo único que
//     cancela es lo que todavía esté 'reservada' (con la fecha ya cerrada no se puede reservar, así
//     que repetir el guardado no encuentra nada y es seguro reintentar si algo falló a mitad).
async function handleExcepcionGuardar(body: Record<string, unknown>): Promise<Response> {
  const fecha = body.fecha
  if (!fechaValida(fecha)) return rechazo('La fecha no es válida (AAAA-MM-DD).')

  const franjaRaw = body.franja_id
  let franjaId: string | null = null
  if (franjaRaw !== undefined && franjaRaw !== null) {
    if (typeof franjaRaw !== 'string' || !UUID_RE.test(franjaRaw)) return rechazo('Franja inválida.')
    franjaId = franjaRaw
  }

  if (typeof body.cerrado !== 'boolean') return rechazo('Indicá si el gimnasio está cerrado.')
  const cerrado = body.cerrado
  const overrideRaw = body.cupo_override
  let cupoOverride: number | null = null
  if (overrideRaw !== undefined && overrideRaw !== null) {
    if (!esEntero(overrideRaw, 1, CUPO_MAX)) return rechazo(`El cupo especial debe ser un entero entre 1 y ${CUPO_MAX}.`)
    cupoOverride = overrideRaw
  }
  if (!cerrado && cupoOverride === null) {
    return rechazo('Una excepción abierta necesita un cupo especial; si no, no cambia nada.')
  }

  const motivoTxt = typeof body.motivo === 'string' ? body.motivo.trim() : ''
  if (cerrado && (motivoTxt.length < MOTIVO_MIN || motivoTxt.length > MOTIVO_MAX)) {
    return rechazo(
      `Para cerrar hace falta un mensaje para los socios (entre ${MOTIVO_MIN} y ${MOTIVO_MAX} caracteres).`,
      { codigo: 'motivo_requerido' },
    )
  }
  if (motivoTxt.length > MOTIVO_MAX) return rechazo(`El motivo no puede superar ${MOTIVO_MAX} caracteres.`)
  const motivo = motivoTxt || null

  if (body.solo_vista_previa !== undefined && typeof body.solo_vista_previa !== 'boolean') {
    return rechazo('El campo "solo_vista_previa" es inválido.')
  }
  const soloVistaPrevia = body.solo_vista_previa === true

  if (franjaId) {
    const { data: franja, error } = await supabaseAdmin
      .from('gimnasio_franjas').select('id').eq('id', franjaId).maybeSingle()
    if (error) return errorDb('gimnasio_franjas', error)
    if (!franja) return rechazo('La franja no existe.')
  }

  // Una excepción por fecha+franja: si ya hay, se actualiza.
  let q = supabaseAdmin.from('gimnasio_franjas_excepciones').select('id').eq('fecha', fecha)
  q = franjaId ? q.eq('franja_id', franjaId) : q.is('franja_id', null)
  const { data: previa, error: previaErr } = await q.maybeSingle()
  if (previaErr) return errorDb('buscar excepcion', previaErr)

  // Reservas que el cierre dejaría sin lugar y los tokens de push de sus dueños. Se leen ANTES de
  // escribir nada: si falla alguna lectura se responde 500 sin haber tocado la base.
  let afectadas: ReservaAfectada[] = []
  const tokensPorSocio = new Map<string, string[]>()
  if (cerrado) {
    const { data, error } = await supabaseAdmin.rpc('gimnasio_cierre_afectadas', {
      p_fecha: fecha,
      p_franja_id: franjaId,
    })
    if (error) return errorDb('gimnasio_cierre_afectadas', error)
    afectadas = (data ?? []) as ReservaAfectada[]

    const tokens = await leerTokensPorSocio([...new Set(afectadas.map((a) => a.socio_id))])
    if (tokens === null) return errorDb('push_tokens', 'no se pudieron leer los tokens de los socios afectados')
    for (const [socioId, lista] of tokens) tokensPorSocio.set(socioId, lista)
  }

  if (soloVistaPrevia) {
    const socios = new Set(afectadas.map((a) => a.socio_id))
    const conToken = [...socios].filter((id) => (tokensPorSocio.get(id) ?? []).length > 0).length
    return jsonOk({
      ok: true,
      vista_previa: true,
      reservas_a_cancelar: afectadas.length,
      socios_a_avisar: conToken,
      socios_sin_token: socios.size - conToken,
    })
  }

  const valores = { fecha, franja_id: franjaId, cerrado, cupo_override: cupoOverride, motivo }
  const cols = 'id, fecha, franja_id, cerrado, cupo_override, motivo'
  const { data: guardada, error: saveErr } = previa
    ? await supabaseAdmin.from('gimnasio_franjas_excepciones').update(valores).eq('id', previa.id).select(cols).single()
    : await supabaseAdmin.from('gimnasio_franjas_excepciones').insert(valores).select(cols).single()
  if (saveErr || !guardada) {
    // 23505: carrera con otra alta de la misma fecha+franja.
    if ((saveErr as { code?: string } | null)?.code === '23505') {
      return rechazo('Ya existe una excepción para esa fecha y franja. Probá de nuevo.')
    }
    return errorDb('guardar excepcion', saveErr)
  }

  if (!cerrado) {
    return jsonOk({
      ok: true, excepcion: guardada, reservas_canceladas: 0, avisos_enviados: 0, avisos_fallidos: 0, avisos_sin_token: 0,
    })
  }

  // Cancelación en una sola sentencia UPDATE ... RETURNING (con lock de las franjas), después de
  // guardar el cierre: desde ahí gimnasio_reservar rechaza la fecha y no se cuela ninguna reserva.
  const { data: canceladasRaw, error: cancelErr } = await supabaseAdmin.rpc('gimnasio_cancelar_por_cierre', {
    p_fecha: fecha,
    p_franja_id: franjaId,
  })
  if (cancelErr) return errorDb('gimnasio_cancelar_por_cierre', cancelErr)
  const canceladas = (canceladasRaw ?? []) as ReservaAfectada[]

  // Socios que reservaron entre la lectura previa y la cancelación (carrera poco probable): se
  // buscan sus tokens ahora. Si esa lectura falla no se deshace nada: se cuentan como no avisados.
  const faltantes = [...new Set(canceladas.map((c) => c.socio_id))].filter((id) => !tokensPorSocio.has(id))
  let sinLectura = new Set<string>()
  if (faltantes.length > 0) {
    const extra = await leerTokensPorSocio(faltantes)
    if (extra === null) {
      console.error('gimnasio-turnos-admin: no se pudieron leer los tokens de socios que reservaron durante el cierre')
      sinLectura = new Set(faltantes)
    } else {
      for (const [socioId, tokens] of extra) tokensPorSocio.set(socioId, tokens)
    }
  }

  const resumen = await avisarCierre(canceladas, fecha, motivoTxt, tokensPorSocio, sinLectura)

  return jsonOk({
    ok: true,
    excepcion: guardada,
    reservas_canceladas: canceladas.length,
    ...resumen,
  })
}

// ─── push de cierre ───────────────────────────────────────────────────────────

// socio_id -> tokens Expo válidos de SU propio perfil. Un socio sin perfil o sin token no tiene
// entrada. Devuelve null si falla cualquiera de las lecturas: el caller NO debe tomarlo como
// "sin tokens" (sería avisar a nadie en silencio).
async function leerTokensPorSocio(socioIds: string[]): Promise<Map<string, string[]> | null> {
  const perfilDe = new Map<string, string>() // socio_id -> profile_id
  for (let i = 0; i < socioIds.length; i += ID_CHUNK_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('socios')
      .select('id, profile_id')
      .in('id', socioIds.slice(i, i + ID_CHUNK_SIZE))
    if (error) { console.error('gimnasio-turnos-admin: socios:', error.message); return null }
    for (const s of data ?? []) {
      if (s.profile_id) perfilDe.set(s.id as string, s.profile_id as string)
    }
  }

  const tokensPorPerfil = new Map<string, string[]>()
  const perfiles = [...new Set(perfilDe.values())]
  for (let i = 0; i < perfiles.length; i += ID_CHUNK_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('push_tokens')
      .select('usuario_id, token')
      .in('usuario_id', perfiles.slice(i, i + ID_CHUNK_SIZE))
    if (error) { console.error('gimnasio-turnos-admin: push_tokens:', error.message); return null }
    for (const row of data ?? []) {
      const token = row.token as string
      if (!token.startsWith('ExponentPushToken[') && !token.startsWith('ExpoPushToken[')) continue
      const arr = tokensPorPerfil.get(row.usuario_id as string) ?? []
      arr.push(token)
      tokensPorPerfil.set(row.usuario_id as string, arr)
    }
  }

  const out = new Map<string, string[]>()
  for (const [socioId, perfilId] of perfilDe) {
    const tokens = tokensPorPerfil.get(perfilId)
    if (tokens?.length) out.set(socioId, tokens)
  }
  return out
}

function unirLista(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}

// Un push por socio (no por reserva): si perdió varias franjas el mismo día van juntas en una línea.
// 'Jueves 09/10 18:00–19:00: <mensaje>'.
function armarMensajeCierre(fecha: string, franjas: ReservaAfectada[], motivo: string, to: string) {
  const [, mm, dd] = fecha.split('-')
  const dia = DIAS_NOMBRE[(new Date(`${fecha}T00:00:00Z`).getUTCDay() + 6) % 7]
  const horarios = franjas
    .slice()
    .sort((a, b) => a.hora_desde.localeCompare(b.hora_desde))
    .map((f) => `${hhmm(f.hora_desde)}–${hhmm(f.hora_hasta)}`)
  return {
    to,
    title: franjas.length > 1 ? 'Gimnasio: turnos cancelados' : 'Gimnasio: turno cancelado',
    body: `${dia} ${dd}/${mm} ${unirLista(horarios)}: ${motivo}`,
    data: { type: 'gimnasio_turno_cancelado', fecha },
    sound: 'default',
  }
}

// Envía el aviso a cada socio con reservas canceladas. Entregado = al menos un ticket `ok` entre
// los tokens de ESE socio. Expo responde 200 aunque algunos tickets fallen (p. ej.
// DeviceNotRegistered): `data` es un array de tickets en el mismo orden que los mensajes. Un body
// ausente o malformado cuenta como no entregado.
async function avisarCierre(
  canceladas: ReservaAfectada[],
  fecha: string,
  motivo: string,
  tokensPorSocio: Map<string, string[]>,
  sinLectura: Set<string>,
): Promise<{ avisos_enviados: number; avisos_fallidos: number; avisos_sin_token: number }> {
  const porSocio = new Map<string, ReservaAfectada[]>()
  for (const c of canceladas) {
    const lista = porSocio.get(c.socio_id) ?? []
    lista.push(c)
    porSocio.set(c.socio_id, lista)
  }

  let sinToken = 0
  let fallidos = sinLectura.size
  const mensajes: { socioId: string; msg: ReturnType<typeof armarMensajeCierre> }[] = []
  const conMensaje = new Set<string>()
  for (const [socioId, franjas] of porSocio) {
    if (sinLectura.has(socioId)) continue
    const tokens = tokensPorSocio.get(socioId) ?? []
    if (tokens.length === 0) { sinToken++; continue }
    conMensaje.add(socioId)
    for (const to of tokens) mensajes.push({ socioId, msg: armarMensajeCierre(fecha, franjas, motivo, to) })
  }

  const entregados = new Set<string>()
  for (let i = 0; i < mensajes.length; i += EXPO_PUSH_CHUNK_SIZE) {
    const chunk = mensajes.slice(i, i + EXPO_PUSH_CHUNK_SIZE)
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Accept-Encoding': 'gzip, deflate' },
        body: JSON.stringify(chunk.map((c) => c.msg)),
        signal: AbortSignal.timeout(EXPO_PUSH_TIMEOUT_MS),
      })
      if (!res.ok) {
        console.error('gimnasio-turnos-admin: Expo push falló:', res.status, await res.text())
        continue
      }
      const json = await res.json().catch(() => null) as { data?: unknown } | null
      const tickets = json?.data
      if (!Array.isArray(tickets) || tickets.length !== chunk.length) {
        console.error('gimnasio-turnos-admin: Expo push con formato inesperado, chunk tratado como no entregado')
        continue
      }
      tickets.forEach((t, idx) => {
        if ((t as { status?: string } | null)?.status === 'ok') entregados.add(chunk[idx].socioId)
        else console.error('gimnasio-turnos-admin: ticket de Expo con error:', JSON.stringify(t))
      })
    } catch (e) {
      console.error('gimnasio-turnos-admin: error enviando push:', e)
    }
  }

  fallidos += [...conMensaje].filter((id) => !entregados.has(id)).length
  return { avisos_enviados: entregados.size, avisos_fallidos: fallidos, avisos_sin_token: sinToken }
}

async function handleExcepcionBorrar(body: Record<string, unknown>): Promise<Response> {
  const id = body.excepcion_id
  if (typeof id !== 'string' || !UUID_RE.test(id)) return rechazo('Excepción inválida.')

  const { data, error } = await supabaseAdmin
    .from('gimnasio_franjas_excepciones')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) return errorDb('borrar excepcion', error)
  if (!data?.length) return rechazo('La excepción no existe.')

  return jsonOk({ ok: true })
}

async function handleExcepcionesListar(body: Record<string, unknown>): Promise<Response> {
  const desde = body.desde
  const hasta = body.hasta
  if (!fechaValida(desde) || !fechaValida(hasta)) {
    return rechazo('Las fechas "desde" y "hasta" son obligatorias (AAAA-MM-DD).')
  }
  if (hasta < desde) return rechazo('El rango de fechas es inválido.')
  if (diasEntre(desde, hasta) + 1 > MAX_DIAS_EXCEPCIONES) {
    return rechazo(`El rango no puede superar ${MAX_DIAS_EXCEPCIONES} días.`)
  }

  const { data, error } = await supabaseAdmin
    .from('gimnasio_franjas_excepciones')
    .select('id, fecha, franja_id, cerrado, cupo_override, motivo')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: true })
  if (error) return errorDb('gimnasio_franjas_excepciones', error)

  return jsonOk({ ok: true, excepciones: data ?? [] })
}

// ─── ocupación ────────────────────────────────────────────────────────────────

interface FilaDisponibilidad {
  franja_id: string
  dia_semana: number
  hora_desde: string
  hora_hasta: string
  cupo_base: number
  capacidad: number
  ocupados: number
  ocupados_fijos: number
  cerrado: boolean
  motivo_cierre: string | null
  profesor: string | null
}

type FranjaEmbed = {
  dia_semana: number; hora_desde: string; hora_hasta: string; cupo: number; profesor: string | null; activa: boolean
} | null
type SocioEmbed = { numero_socio: string; dni: string; profiles: { nombre: string } | null } | null

async function handleOcupacion(body: Record<string, unknown>): Promise<Response> {
  const fecha = body.fecha
  if (!fechaValida(fecha)) return rechazo('La fecha no es válida (AAAA-MM-DD).')

  const { data: disp, error: dispErr } = await supabaseAdmin.rpc('gimnasio_disponibilidad', {
    p_desde: fecha,
    p_hasta: fecha,
  })
  if (dispErr) return errorDb('gimnasio_disponibilidad', dispErr)

  const { data: reservas, error: resErr } = await supabaseAdmin
    .from('gimnasio_reservas')
    .select(
      'id, franja_id, estado, origen, socios(numero_socio, dni, profiles!socios_profile_id_fkey(nombre)), ' +
      'gimnasio_franjas(dia_semana, hora_desde, hora_hasta, cupo, profesor, activa)',
    )
    .eq('fecha', fecha)
    .order('created_at', { ascending: true })
  if (resErr) return errorDb('gimnasio_reservas', resErr)

  interface FranjaOut {
    franja_id: string
    hora_desde: string
    hora_hasta: string
    capacidad: number
    ocupados: number
    ocupados_fijos: number
    cerrado: boolean
    motivo_cierre: string | null
    profesor: string | null
    inactiva: boolean
    reservas: unknown[]
  }
  const porFranja = new Map<string, FranjaOut>()
  for (const f of (disp ?? []) as FilaDisponibilidad[]) {
    porFranja.set(f.franja_id, {
      franja_id: f.franja_id,
      hora_desde: hhmm(f.hora_desde),
      hora_hasta: hhmm(f.hora_hasta),
      capacidad: f.capacidad,
      ocupados: f.ocupados,
      ocupados_fijos: f.ocupados_fijos,
      cerrado: f.cerrado,
      motivo_cierre: f.motivo_cierre,
      profesor: f.profesor,
      inactiva: false,
      reservas: [],
    })
  }

  for (const r of (reservas ?? []) as unknown as {
    id: string; franja_id: string; estado: string; origen: string
    socios: SocioEmbed; gimnasio_franjas: FranjaEmbed
  }[]) {
    let franja = porFranja.get(r.franja_id)
    if (!franja) {
      // Franja desactivada que todavía tiene reservas ese día: se muestra igual, marcada como inactiva.
      const fe = r.gimnasio_franjas
      if (!fe) continue
      franja = {
        franja_id: r.franja_id,
        hora_desde: hhmm(fe.hora_desde),
        hora_hasta: hhmm(fe.hora_hasta),
        capacidad: fe.cupo,
        ocupados: 0,
        ocupados_fijos: 0,
        cerrado: false,
        motivo_cierre: null,
        profesor: fe.profesor,
        inactiva: true,
        reservas: [],
      }
      porFranja.set(r.franja_id, franja)
    }
    // Para las activas `ocupados` ya viene del RPC; para una inactiva se cuenta acá.
    if (franja.inactiva && r.estado !== 'cancelada') franja.ocupados += 1
    franja.reservas.push({
      reserva_id: r.id,
      estado: r.estado,
      origen: r.origen,
      numero_socio: r.socios?.numero_socio ?? null,
      nombre: r.socios?.profiles?.nombre ?? '—',
      dni: r.socios?.dni ?? null,
    })
  }

  const franjas = [...porFranja.values()].sort((a, b) => a.hora_desde.localeCompare(b.hora_desde))
  return jsonOk({ ok: true, fecha, franjas })
}

// ─── cancelar reserva ─────────────────────────────────────────────────────────

async function handleReservaCancelar(body: Record<string, unknown>): Promise<Response> {
  const id = body.reserva_id
  if (typeof id !== 'string' || !UUID_RE.test(id)) return rechazo('Reserva inválida.')

  const { data: reserva, error } = await supabaseAdmin
    .from('gimnasio_reservas')
    .select('id, estado')
    .eq('id', id)
    .maybeSingle()
  if (error) return errorDb('gimnasio_reservas', error)
  if (!reserva) return rechazo('No encontramos esa reserva.')
  if (reserva.estado !== 'reservada') return rechazo('Esa reserva ya no se puede cancelar.')

  const { data: upd, error: updErr } = await supabaseAdmin
    .from('gimnasio_reservas')
    .update({ estado: 'cancelada' })
    .eq('id', id)
    .eq('estado', 'reservada')
    .select('id')
  if (updErr) return errorDb('cancelar reserva', updErr)
  if (!upd?.length) return rechazo('Esa reserva ya no se puede cancelar.')

  return jsonOk({ ok: true })
}

// ─── config ───────────────────────────────────────────────────────────────────

const CONFIG_COLS =
  'modo_cupos, ventana_reserva, anticipacion_dias, pct_cupo_fijos, faltas_aviso, faltas_baja, semanas_fijos, tolerancia_min'

async function handleConfigGet(): Promise<Response> {
  const { data, error } = await supabaseAdmin.from('gimnasio_config').select(CONFIG_COLS).eq('id', 1).single()
  if (error || !data) return errorDb('gimnasio_config', error)
  return jsonOk({ ok: true, config: data })
}

// Rangos válidos por campo numérico de gimnasio_config (los CHECK de la tabla son más laxos).
const RANGOS_CONFIG: Record<string, [number, number, string]> = {
  // Máximo 30: el listado de turnos del socio cubre hasta 31 días (hoy + anticipación). Sólo rige
  // en ventana 'dias'.
  anticipacion_dias: [0, 30, 'La anticipación debe ser de 0 a 30 días.'],
  pct_cupo_fijos: [0, 100, 'El porcentaje de cupo para fijos debe ser de 0 a 100.'],
  faltas_aviso: [1, 20, 'Las faltas para avisar deben ser de 1 a 20.'],
  faltas_baja: [2, 30, 'Las faltas para liberar el horario deben ser de 2 a 30.'],
  semanas_fijos: [1, 12, 'Las semanas de turnos fijos deben ser de 1 a 12.'],
  tolerancia_min: [0, 120, 'La tolerancia debe ser de 0 a 120 minutos.'],
}

async function handleConfigGuardar(body: Record<string, unknown>): Promise<Response> {
  const cambios: Record<string, string | number> = {}

  if (body.modo_cupos !== undefined) {
    if (body.modo_cupos !== 'informativo' && body.modo_cupos !== 'bloqueante') {
      return rechazo('El modo de cupos debe ser "informativo" o "bloqueante".')
    }
    cambios.modo_cupos = body.modo_cupos
  }
  if (body.ventana_reserva !== undefined) {
    if (body.ventana_reserva !== 'mes' && body.ventana_reserva !== 'dias') {
      return rechazo('La ventana de reserva debe ser "mes" o "dias".')
    }
    cambios.ventana_reserva = body.ventana_reserva
  }
  for (const [campo, [min, max, mensaje]] of Object.entries(RANGOS_CONFIG)) {
    if (body[campo] === undefined) continue
    if (!esEntero(body[campo], min, max)) return rechazo(mensaje)
    cambios[campo] = body[campo] as number
  }
  if (Object.keys(cambios).length === 0) return rechazo('No hay cambios para guardar.')

  // La baja tiene que venir DESPUÉS del aviso. Se valida con los valores resultantes (los que
  // llegan más los guardados), porque el cambio puede traer sólo uno de los dos.
  if (cambios.faltas_aviso !== undefined || cambios.faltas_baja !== undefined) {
    const { data: actual, error: actualErr } = await supabaseAdmin
      .from('gimnasio_config').select('faltas_aviso, faltas_baja').eq('id', 1).single()
    if (actualErr || !actual) return errorDb('gimnasio_config', actualErr)
    const aviso = (cambios.faltas_aviso as number | undefined) ?? actual.faltas_aviso
    const baja = (cambios.faltas_baja as number | undefined) ?? actual.faltas_baja
    if (baja <= aviso) {
      return rechazo(
        `Las faltas para liberar el horario (${baja}) tienen que ser más que las del aviso (${aviso}).`,
        { codigo: 'faltas_orden' },
      )
    }
  }

  const { data, error } = await supabaseAdmin
    .from('gimnasio_config')
    .update(cambios)
    .eq('id', 1)
    .select(CONFIG_COLS)
    .single()
  if (error || !data) return errorDb('guardar config', error)

  return jsonOk({ ok: true, config: data })
}
