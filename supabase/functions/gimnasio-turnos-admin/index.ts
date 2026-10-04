// Edge Function: gimnasio-turnos-admin
// Administración del turnero del gimnasio para el encargado (ver 20261005000000_gimnasio_turnos).
//
// Actions (body.action):
//   franjas-listar     — todas las franjas (activas e inactivas) de la plantilla semanal.
//   franja-guardar     — { id?, dia_semana, hora_desde, hora_hasta, cupo, activa? } alta o edición.
//   franja-desactivar  — { franja_id } baja lógica (activa=false). Sus reservas futuras NO se tocan:
//                        se devuelve cuántas quedan para que el encargado decida.
//   excepcion-guardar  — { fecha, franja_id|null, cerrado, cupo_override|null, motivo? } una por fecha+franja
//                        (franja_id null = toda la fecha); si ya existe se actualiza.
//   excepcion-borrar   — { excepcion_id }.
//   excepciones-listar — { desde, hasta }.
//   ocupacion          — { fecha } por franja: capacidad, ocupados y la lista de reservas con datos del socio.
//   reserva-manual     — { dni, franja_id, fecha } anota a un socio con origen 'encargado'.
//   reserva-cancelar   — { reserva_id }.
//   config-get / config-guardar — modo_cupos (informativo|bloqueante), anticipación, % de fijos, etc.
//   limites-listar / limite-guardar — tope de días por semana por servicio o categoría (null = sin límite).
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

const ROLES_PERMITIDOS = ['porteria', 'admin', 'subcomision']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d(:00)?$/
const MAX_DIAS_EXCEPCIONES = 366
const CUPO_MAX = 500

// Motivos para el encargado según el `codigo` de gimnasio_reservar (3ª persona: habla del socio).
const MOTIVOS_RESERVA: Record<string, string> = {
  parametros: 'Faltan datos para reservar.',
  origen_invalido: 'Origen de reserva inválido.',
  socio_inexistente: 'El socio no existe.',
  franja_inexistente: 'La franja no existe.',
  franja_inactiva: 'La franja está inactiva.',
  dia_invalido: 'La fecha no corresponde al día de la franja.',
  cerrado: 'El gimnasio está cerrado en esa fecha.',
  pasado: 'Esa franja ya comenzó o ya pasó.',
  duplicada: 'El socio ya tiene una reserva en esa franja.',
  cupo_lleno: 'No quedan lugares en esa franja.',
  cupo_fijos_lleno: 'No quedan lugares para turnos fijos en esa franja.',
  tope_semanal: 'El socio alcanzó el máximo de días por semana de su servicio.',
}

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

function hhmm(hora: string): string {
  return hora.slice(0, 5)
}

// 'HH:MM' o 'HH:MM:00' => 'HH:MM:00'
function normalizarHora(h: unknown): string | null {
  if (typeof h !== 'string' || !HORA_RE.test(h)) return null
  return `${h.slice(0, 5)}:00`
}

function esEntero(n: unknown, min: number, max: number): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max
}

// ─── Respuestas ───────────────────────────────────────────────────────────────

function rechazo(motivo: string, extra: Record<string, unknown> = {}): Response {
  return jsonOk({ ok: false, motivo, ...extra })
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
    case 'franja-desactivar':  return handleFranjaDesactivar(body)
    case 'excepcion-guardar':  return handleExcepcionGuardar(body)
    case 'excepcion-borrar':   return handleExcepcionBorrar(body)
    case 'excepciones-listar': return handleExcepcionesListar(body)
    case 'ocupacion':          return handleOcupacion(body)
    case 'reserva-manual':     return handleReservaManual(body)
    case 'reserva-cancelar':   return handleReservaCancelar(body)
    case 'config-get':         return handleConfigGet()
    case 'config-guardar':     return handleConfigGuardar(body)
    case 'limites-listar':     return handleLimitesListar()
    case 'limite-guardar':     return handleLimiteGuardar(body)
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
    .select('id, dia_semana, hora_desde, hora_hasta, cupo, activa')
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

  // Dos franjas activas del mismo día no pueden solaparse (no hay constraint en DB, se valida acá).
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

  const valores = { dia_semana: diaSemana, hora_desde: desde, hora_hasta: hasta, cupo, activa }
  const { data: guardada, error: saveErr } = existente
    ? await supabaseAdmin.from('gimnasio_franjas').update(valores).eq('id', existente.id)
        .select('id, dia_semana, hora_desde, hora_hasta, cupo, activa').single()
    : await supabaseAdmin.from('gimnasio_franjas').insert(valores)
        .select('id, dia_semana, hora_desde, hora_hasta, cupo, activa').single()
  if (saveErr || !guardada) return errorDb('guardar franja', saveErr)

  return jsonOk({
    ok: true,
    franja: { ...guardada, hora_desde: hhmm(guardada.hora_desde), hora_hasta: hhmm(guardada.hora_hasta) },
    reservas_futuras: reservasFuturas,
  })
}

async function handleFranjaDesactivar(body: Record<string, unknown>): Promise<Response> {
  const franjaId = body.franja_id
  if (typeof franjaId !== 'string' || !UUID_RE.test(franjaId)) return rechazo('Franja inválida.')

  const { data, error } = await supabaseAdmin
    .from('gimnasio_franjas')
    .update({ activa: false })
    .eq('id', franjaId)
    .select('id')
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
  const motivo = typeof body.motivo === 'string' ? body.motivo.trim().slice(0, 200) || null : null

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

  // Si cierra, avisar cuántas reservas vivas quedan en esa fecha (no se cancelan solas).
  let reservasAfectadas = 0
  if (cerrado) {
    let rq = supabaseAdmin
      .from('gimnasio_reservas')
      .select('id', { count: 'exact', head: true })
      .eq('fecha', fecha)
      .eq('estado', 'reservada')
    if (franjaId) rq = rq.eq('franja_id', franjaId)
    const { count, error: cntErr } = await rq
    if (cntErr) return errorDb('contar reservas afectadas', cntErr)
    reservasAfectadas = count ?? 0
  }

  return jsonOk({ ok: true, excepcion: guardada, reservas_afectadas: reservasAfectadas })
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
}

type FranjaEmbed = { dia_semana: number; hora_desde: string; hora_hasta: string; cupo: number; activa: boolean } | null
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
      'gimnasio_franjas(dia_semana, hora_desde, hora_hasta, cupo, activa)',
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

// ─── reservas manuales ────────────────────────────────────────────────────────

async function handleReservaManual(body: Record<string, unknown>): Promise<Response> {
  const dni = typeof body.dni === 'string' ? body.dni.trim() : ''
  if (!dni || dni.length > 20) return rechazo('Ingresá un DNI válido.')
  const franjaId = body.franja_id
  const fecha = body.fecha
  if (typeof franjaId !== 'string' || !UUID_RE.test(franjaId)) return rechazo('Franja inválida.')
  if (!fechaValida(fecha)) return rechazo('La fecha no es válida (AAAA-MM-DD).')

  const { data: socios, error: socioErr } = await supabaseAdmin
    .from('socios')
    .select('id, numero_socio, profiles!socios_profile_id_fkey(nombre)')
    .eq('dni', dni)
    .limit(2)
  if (socioErr) return errorDb('socios', socioErr)
  if (!socios?.length) return rechazo('No hay ningún socio con ese DNI.', { codigo: 'socio_inexistente' })
  if (socios.length > 1) return rechazo('Hay más de un socio con ese DNI. Consultá con Secretaría.', { codigo: 'dni_repetido' })
  const socio = socios[0] as unknown as { id: string; numero_socio: string; profiles: { nombre: string } | null }

  const { data, error } = await supabaseAdmin.rpc('gimnasio_reservar', {
    p_socio_id: socio.id,
    p_franja_id: franjaId,
    p_fecha: fecha,
    p_origen: 'encargado',
  })
  if (error) return errorDb('gimnasio_reservar', error)

  const r = data as Record<string, unknown>
  if (!r?.ok) {
    const codigo = String(r?.codigo ?? '')
    return rechazo(MOTIVOS_RESERVA[codigo] ?? String(r?.motivo ?? 'No se pudo reservar.'), { codigo })
  }

  return jsonOk({
    ok: true,
    reserva_id: r.reserva_id,
    capacidad: r.capacidad,
    ocupados: r.ocupados,
    socio: { numero_socio: socio.numero_socio, nombre: socio.profiles?.nombre ?? '—' },
  })
}

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

const CONFIG_COLS = 'modo_cupos, anticipacion_dias, pct_cupo_fijos, faltas_aviso, semanas_fijos, tolerancia_min'

async function handleConfigGet(): Promise<Response> {
  const { data, error } = await supabaseAdmin.from('gimnasio_config').select(CONFIG_COLS).eq('id', 1).single()
  if (error || !data) return errorDb('gimnasio_config', error)
  return jsonOk({ ok: true, config: data })
}

// Rangos válidos por campo numérico de gimnasio_config (los CHECK de la tabla son más laxos).
const RANGOS_CONFIG: Record<string, [number, number, string]> = {
  anticipacion_dias: [0, 60, 'La anticipación debe ser de 0 a 60 días.'],
  pct_cupo_fijos: [0, 100, 'El porcentaje de cupo para fijos debe ser de 0 a 100.'],
  faltas_aviso: [1, 20, 'Las faltas para avisar deben ser de 1 a 20.'],
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
  for (const [campo, [min, max, mensaje]] of Object.entries(RANGOS_CONFIG)) {
    if (body[campo] === undefined) continue
    if (!esEntero(body[campo], min, max)) return rechazo(mensaje)
    cambios[campo] = body[campo] as number
  }
  if (Object.keys(cambios).length === 0) return rechazo('No hay cambios para guardar.')

  const { data, error } = await supabaseAdmin
    .from('gimnasio_config')
    .update(cambios)
    .eq('id', 1)
    .select(CONFIG_COLS)
    .single()
  if (error || !data) return errorDb('guardar config', error)

  return jsonOk({ ok: true, config: data })
}

// ─── límites de días por semana ───────────────────────────────────────────────

async function handleLimitesListar(): Promise<Response> {
  const { data: servicios, error: servErr } = await supabaseAdmin
    .from('servicios_opcionales')
    .select('id, nombre')
    .eq('activo', true)
    .ilike('nombre', '%gimnasio%')
    .order('nombre', { ascending: true })
  if (servErr) return errorDb('servicios_opcionales', servErr)

  const { data: limites, error: limErr } = await supabaseAdmin
    .from('gimnasio_limites')
    .select('servicio_id, categoria_nombre, dias_por_semana')
  if (limErr) return errorDb('gimnasio_limites', limErr)

  const porServicio = new Map<string, number | null>()
  const porCategoria = new Map<string, number | null>()
  for (const l of limites ?? []) {
    if (l.servicio_id) porServicio.set(l.servicio_id, l.dias_por_semana)
    if (l.categoria_nombre) porCategoria.set(l.categoria_nombre, l.dias_por_semana)
  }

  // dias_por_semana null = sin límite (con o sin fila configurada). `configurado` distingue si hay fila.
  const items = [
    ...(servicios ?? []).map((s) => ({
      servicio_id: s.id,
      categoria_nombre: null as string | null,
      nombre: s.nombre,
      dias_por_semana: porServicio.get(s.id) ?? null,
      configurado: porServicio.has(s.id),
    })),
    // Cliente Gimnasio es una categoría, no tiene servicio propio: se lista siempre.
    {
      servicio_id: null as string | null,
      categoria_nombre: 'Cliente Gimnasio' as string | null,
      nombre: 'Cliente Gimnasio',
      dias_por_semana: porCategoria.get('Cliente Gimnasio') ?? null,
      configurado: porCategoria.has('Cliente Gimnasio'),
    },
  ]

  return jsonOk({ ok: true, limites: items })
}

async function handleLimiteGuardar(body: Record<string, unknown>): Promise<Response> {
  const servicioRaw = body.servicio_id
  const categoriaRaw = body.categoria_nombre
  const tieneServicio = servicioRaw !== undefined && servicioRaw !== null
  const tieneCategoria = categoriaRaw !== undefined && categoriaRaw !== null
  if (tieneServicio === tieneCategoria) {
    return rechazo('Indicá un servicio o una categoría (sólo uno de los dos).')
  }

  const dias = body.dias_por_semana
  if (dias !== null && !esEntero(dias, 1, 7)) {
    return rechazo('Los días por semana deben ser de 1 a 7, o null para sin límite.')
  }

  let servicioId: string | null = null
  let categoriaNombre: string | null = null
  if (tieneServicio) {
    if (typeof servicioRaw !== 'string' || !UUID_RE.test(servicioRaw)) return rechazo('Servicio inválido.')
    const { data, error } = await supabaseAdmin
      .from('servicios_opcionales').select('id').eq('id', servicioRaw).maybeSingle()
    if (error) return errorDb('servicios_opcionales', error)
    if (!data) return rechazo('El servicio no existe.')
    servicioId = servicioRaw
  } else {
    if (typeof categoriaRaw !== 'string' || !categoriaRaw.trim()) return rechazo('Categoría inválida.')
    const { data, error } = await supabaseAdmin
      .from('categorias_socio').select('nombre').eq('nombre', categoriaRaw.trim()).limit(1)
    if (error) return errorDb('categorias_socio', error)
    if (!data?.length) return rechazo('La categoría no existe.')
    categoriaNombre = categoriaRaw.trim()
  }

  let q = supabaseAdmin.from('gimnasio_limites').select('id')
  q = servicioId ? q.eq('servicio_id', servicioId) : q.eq('categoria_nombre', categoriaNombre!)
  const { data: previa, error: previaErr } = await q.maybeSingle()
  if (previaErr) return errorDb('buscar limite', previaErr)

  const valores = { servicio_id: servicioId, categoria_nombre: categoriaNombre, dias_por_semana: dias as number | null }
  const cols = 'id, servicio_id, categoria_nombre, dias_por_semana'
  const { data: guardado, error: saveErr } = previa
    ? await supabaseAdmin.from('gimnasio_limites').update(valores).eq('id', previa.id).select(cols).single()
    : await supabaseAdmin.from('gimnasio_limites').insert(valores).select(cols).single()
  if (saveErr || !guardado) {
    if ((saveErr as { code?: string } | null)?.code === '23505') {
      return rechazo('Ya existe un límite para ese servicio o categoría. Probá de nuevo.')
    }
    return errorDb('guardar limite', saveErr)
  }

  return jsonOk({ ok: true, limite: guardado })
}
