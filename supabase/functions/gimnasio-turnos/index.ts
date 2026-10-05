// Edge Function: gimnasio-turnos
// Turnero del gimnasio para el socio / cliente de gimnasio (ver 20261005000000_gimnasio_turnos).
//
// Actions (body.action):
//   listar        — { desde?, hasta? } disponibilidad por día y franja con si el caller ya reservó. Rango por
//                   defecto: hoy .. último día del mes en curso (ventana 'mes') o hoy .. hoy + anticipacion_dias
//                   (ventana 'dias'); nunca más de 31 días. Las franjas cerradas traen `motivo_cierre`.
//   reservar      — { franja_id, fecha } reserva atómica vía RPC gimnasio_reservar (origen 'socio'). No hay tope
//                   de días por semana: sólo rige la ventana de reserva de la config.
//   cancelar      — { reserva_id } cancela UNA reserva propia que todavía no empezó. Si vino de un
//                   turno fijo se cancela sólo esa ocurrencia, el turno fijo sigue activo.
//   mis-reservas  — reservas vigentes (hoy en adelante) + turnos fijos activos del caller.
//   crear-fijo    — { franja_id } alta de turno fijo: valida elegibilidad y que quede lugar en el porcentaje de cupo
//                   reservado a fijos y materializa YA las reservas de las próximas semanas (RPC
//                   gimnasio_materializar_fijos; después las renueva el cron `gimnasio-turnos-fijos`). Devuelve
//                   { ok, turno_fijo_id, reservas_creadas, motivo_parcial? }.
//   cancelar-fijo — { turno_fijo_id } desactiva el turno fijo y cancela sus ocurrencias futuras 'reservada'.
//
// Seguridad: JWT requerido; rol 'socio' o 'cliente_gimnasio' (el rol sale de profiles.rol del caller,
// nunca del body) y el caller necesita el servicio de Gimnasio (misma regla que `tieneServicioGimnasio`
// de socios-qr). Todo se resuelve contra el socio del propio caller: no se acepta un socio_id externo.
//
// Contrato de errores: fallas de validación/negocio => HTTP 200 { ok:false, motivo, codigo? }
// (supabase.functions.invoke oculta el body de los no-2xx); errores reales de DB => 500.
// Zona horaria: UTC-3 fijo, igual que socios-qr. Día de semana ISO: 1 = lunes … 7 = domingo.

import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { corsHeaders, jsonOk, jsonError } from '../_shared/cors.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_DIAS_RANGO = 31

// Motivos para el socio según el `codigo` estable que devuelve gimnasio_reservar.
const MOTIVOS: Record<string, string> = {
  parametros: 'Faltan datos para reservar.',
  origen_invalido: 'No se pudo reservar. Probá de nuevo.',
  socio_inexistente: 'No encontramos tu registro de socio.',
  franja_inexistente: 'Esa franja ya no existe.',
  franja_inactiva: 'Esa franja ya no está disponible.',
  dia_invalido: 'La fecha no corresponde al día de esa franja.',
  cerrado: 'El gimnasio está cerrado en esa fecha.',
  pasado: 'Ese horario ya comenzó o ya pasó.',
  fuera_de_mes: 'Todavía no se pueden reservar turnos del mes que viene.',
  duplicada: 'Ya tenés una reserva en esa franja.',
  cupo_lleno: 'Ya no quedan lugares en esa franja.',
  cupo_fijos_lleno: 'Ya no quedan lugares para turnos fijos en esa franja.',
}

// ─── Fechas (UTC-3 fijo) ──────────────────────────────────────────────────────

function fechaISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function hoyLocal(): string {
  return fechaISO(new Date(Date.now() - 3 * 3600 * 1000))
}

function sumarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return fechaISO(d)
}

function diaISO(fecha: string): number {
  const d = new Date(`${fecha}T00:00:00Z`).getUTCDay()
  return d === 0 ? 7 : d
}

// Último día del mes de `fecha` ('AAAA-MM-DD'): el día 0 del mes siguiente en UTC.
function finDeMes(fecha: string): string {
  const [anio, mes] = fecha.split('-').map(Number)
  return fechaISO(new Date(Date.UTC(anio, mes, 0)))
}

function fechaValida(f: unknown): f is string {
  if (typeof f !== 'string' || !FECHA_RE.test(f)) return false
  const d = new Date(`${f}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && fechaISO(d) === f
}

// `horaDesde` viene de Postgres como 'HH:MM:SS'.
function yaComenzo(fecha: string, horaDesde: string): boolean {
  return new Date(`${fecha}T${horaDesde}-03:00`).getTime() <= Date.now()
}

function hhmm(hora: string): string {
  return hora.slice(0, 5)
}

// ─── Respuestas ───────────────────────────────────────────────────────────────

function rechazo(motivo: string, extra: Record<string, unknown> = {}): Response {
  return jsonOk({ ok: false, motivo, ...extra })
}

function errorDb(contexto: string, err: unknown): Response {
  console.error(`gimnasio-turnos: ${contexto}`, err)
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

  const callerRol = callerProfile.rol ?? ''
  if (callerRol !== 'socio' && callerRol !== 'cliente_gimnasio') {
    return jsonError(403, 'Sólo socios o clientes de gimnasio pueden usar los turnos')
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return jsonError(400, 'Body inválido') }

  // Socio del caller + elegibilidad (servicio de Gimnasio), común a todas las acciones.
  const ctx = await resolverSocio(caller.id)
  if (ctx instanceof Response) return ctx

  switch (body.action) {
    case 'listar':        return handleListar(ctx.socioId, body)
    case 'reservar':      return handleReservar(ctx.socioId, body)
    case 'cancelar':      return handleCancelar(ctx.socioId, body)
    case 'mis-reservas':  return handleMisReservas(ctx.socioId)
    case 'crear-fijo':    return handleCrearFijo(ctx.socioId, body)
    case 'cancelar-fijo': return handleCancelarFijo(ctx.socioId, body)
    default:              return jsonError(400, `Acción desconocida: ${body.action}`)
  }
})

// ─── Socio del caller y elegibilidad ──────────────────────────────────────────

async function resolverSocio(profileId: string): Promise<{ socioId: string } | Response> {
  const { data: socio, error } = await supabaseAdmin
    .from('socios')
    .select('id, estado, categoria_id, categorias_socio(nombre)')
    .eq('profile_id', profileId)
    .maybeSingle()
  if (error) return errorDb('socios', error)
  if (!socio) return rechazo('No encontramos tu registro de socio.')

  const categoria = (socio as unknown as { categorias_socio: { nombre: string } | null })
    .categorias_socio?.nombre ?? null

  const elegible = await tieneServicioGimnasio(socio.id, categoria)
  if (elegible instanceof Response) return elegible
  if (!elegible) return rechazo('No tenés el servicio de Gimnasio contratado. Consultá con Secretaría.')

  return { socioId: socio.id }
}

// Misma regla que `tieneServicioGimnasio` de socios-qr: categoría 'Cliente Gimnasio' o un servicio
// activo cuyo nombre contenga "gimnasio". Acá un error de lectura es 500, no "no tiene el servicio".
async function tieneServicioGimnasio(
  socioId: string,
  categoriaNombre: string | null,
): Promise<boolean | Response> {
  if (categoriaNombre === 'Cliente Gimnasio') return true

  const { data, error } = await supabaseAdmin
    .from('socio_servicios')
    .select('servicios_opcionales!inner(nombre, activo)')
    .eq('socio_id', socioId)
    .eq('servicios_opcionales.activo', true)
    .ilike('servicios_opcionales.nombre', '%gimnasio%')
    .limit(1)
  if (error) return errorDb('socio_servicios', error)

  return (data?.length ?? 0) > 0
}

// ─── Lecturas compartidas ─────────────────────────────────────────────────────

type ConfigTurnos = { ventana_reserva: 'mes' | 'dias'; anticipacion_dias: number; pct_cupo_fijos: number }

async function leerConfig(): Promise<ConfigTurnos | Response> {
  const { data, error } = await supabaseAdmin
    .from('gimnasio_config')
    .select('ventana_reserva, anticipacion_dias, pct_cupo_fijos')
    .eq('id', 1)
    .single()
  if (error || !data) return errorDb('gimnasio_config', error)
  return data as ConfigTurnos
}

// ─── listar ───────────────────────────────────────────────────────────────────

interface FilaDisponibilidad {
  franja_id: string
  fecha: string
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

async function handleListar(socioId: string, body: Record<string, unknown>): Promise<Response> {
  const cfg = await leerConfig()
  if (cfg instanceof Response) return cfg

  const hoy = hoyLocal()
  if (body.desde !== undefined && body.desde !== null && !fechaValida(body.desde)) {
    return rechazo('La fecha "desde" no es válida (AAAA-MM-DD).')
  }
  if (body.hasta !== undefined && body.hasta !== null && !fechaValida(body.hasta)) {
    return rechazo('La fecha "hasta" no es válida (AAAA-MM-DD).')
  }

  // No se listan días pasados: "desde" se acota a hoy.
  let desde = (body.desde as string | undefined | null) ?? hoy
  if (desde < hoy) desde = hoy
  // Rango por defecto según la ventana de reserva. 'mes': hasta el último día del mes en curso
  // (a lo sumo 31 días desde hoy). 'dias': hoy..hoy+anticipación incluye anticipación+1 días, y se
  // acota para que nunca supere MAX_DIAS_RANGO aunque la config guardada tenga un valor más alto.
  const hastaPorDefecto = cfg.ventana_reserva === 'mes'
    ? finDeMes(hoy)
    : sumarDias(hoy, Math.min(cfg.anticipacion_dias, MAX_DIAS_RANGO - 1))
  const hasta = (body.hasta as string | undefined | null) ?? hastaPorDefecto
  if (hasta < desde) return rechazo('El rango de fechas es inválido.')
  const cantDias = Math.round((new Date(`${hasta}T00:00:00Z`).getTime() - new Date(`${desde}T00:00:00Z`).getTime()) / 86400000) + 1
  if (cantDias > MAX_DIAS_RANGO) return rechazo(`El rango no puede superar ${MAX_DIAS_RANGO} días.`)

  const { data: disp, error: dispErr } = await supabaseAdmin.rpc('gimnasio_disponibilidad', {
    p_desde: desde,
    p_hasta: hasta,
  })
  if (dispErr) return errorDb('gimnasio_disponibilidad', dispErr)

  // Reservas vivas del caller en el rango: sirven para marcar "ya reservada".
  const { data: propias, error: propiasErr } = await supabaseAdmin
    .from('gimnasio_reservas')
    .select('id, franja_id, fecha')
    .eq('socio_id', socioId)
    .neq('estado', 'cancelada')
    .gte('fecha', desde)
    .lte('fecha', hasta)
  if (propiasErr) return errorDb('gimnasio_reservas', propiasErr)

  const reservaPorFranjaFecha = new Map<string, string>()
  for (const r of propias ?? []) reservaPorFranjaFecha.set(`${r.franja_id}|${r.fecha}`, r.id)

  const porFecha = new Map<string, unknown[]>()
  for (const f of (disp ?? []) as FilaDisponibilidad[]) {
    const reservaId = reservaPorFranjaFecha.get(`${f.franja_id}|${f.fecha}`) ?? null
    const lista = porFecha.get(f.fecha) ?? []
    lista.push({
      franja_id: f.franja_id,
      hora_desde: hhmm(f.hora_desde),
      hora_hasta: hhmm(f.hora_hasta),
      capacidad: f.capacidad,
      ocupados: f.ocupados,
      disponibles: Math.max(0, f.capacidad - f.ocupados),
      cerrado: f.cerrado,
      // Mensaje que cargó el encargado al cerrar (la pantalla lo muestra bajo "Cerrado").
      motivo_cierre: f.cerrado ? f.motivo_cierre : null,
      // Profesor de la franja (texto libre del encargado), o null si no cargó ninguno.
      profesor: f.profesor ?? null,
      pasada: yaComenzo(f.fecha, f.hora_desde),
      reservada: reservaId !== null,
      reserva_id: reservaId,
    })
    porFecha.set(f.fecha, lista)
  }

  const dias: { fecha: string; dia_semana: number; franjas: unknown[] }[] = []
  for (let i = 0; i < cantDias; i++) {
    const fecha = sumarDias(desde, i)
    dias.push({ fecha, dia_semana: diaISO(fecha), franjas: porFecha.get(fecha) ?? [] })
  }

  return jsonOk({
    ok: true,
    desde,
    hasta,
    ventana_reserva: cfg.ventana_reserva,
    anticipacion_dias: cfg.anticipacion_dias, // sólo rige en ventana 'dias'
    dias,
  })
}

// ─── reservar ─────────────────────────────────────────────────────────────────

async function handleReservar(socioId: string, body: Record<string, unknown>): Promise<Response> {
  const franjaId = body.franja_id
  const fecha = body.fecha
  if (typeof franjaId !== 'string' || !UUID_RE.test(franjaId)) return rechazo('Franja inválida.')
  if (!fechaValida(fecha)) return rechazo('La fecha no es válida (AAAA-MM-DD).')

  const { data, error } = await supabaseAdmin.rpc('gimnasio_reservar', {
    p_socio_id: socioId,
    p_franja_id: franjaId,
    p_fecha: fecha,
    p_origen: 'socio',
  })
  if (error) return errorDb('gimnasio_reservar', error)

  const r = data as Record<string, unknown>
  if (!r?.ok) {
    const codigo = String(r?.codigo ?? '')
    let motivo = MOTIVOS[codigo] ?? String(r?.motivo ?? 'No se pudo reservar.')
    if (codigo === 'anticipacion') {
      motivo = `Sólo podés reservar con hasta ${r.anticipacion_dias} días de anticipación.`
    }
    return rechazo(motivo, { codigo })
  }

  return jsonOk({
    ok: true,
    reserva_id: r.reserva_id,
    franja_id: r.franja_id,
    fecha: r.fecha,
    capacidad: r.capacidad,
    ocupados: r.ocupados,
  })
}

// ─── cancelar ─────────────────────────────────────────────────────────────────

async function handleCancelar(socioId: string, body: Record<string, unknown>): Promise<Response> {
  const reservaId = body.reserva_id
  if (typeof reservaId !== 'string' || !UUID_RE.test(reservaId)) return rechazo('Reserva inválida.')

  const { data: reserva, error } = await supabaseAdmin
    .from('gimnasio_reservas')
    .select('id, socio_id, fecha, estado, gimnasio_franjas(hora_desde)')
    .eq('id', reservaId)
    .maybeSingle()
  if (error) return errorDb('gimnasio_reservas', error)

  // Una reserva ajena responde igual que una inexistente: no se revela que existe.
  if (!reserva || reserva.socio_id !== socioId) return rechazo('No encontramos esa reserva.')
  if (reserva.estado !== 'reservada') return rechazo('Esa reserva ya no se puede cancelar.')

  const horaDesde = (reserva as unknown as { gimnasio_franjas: { hora_desde: string } | null })
    .gimnasio_franjas?.hora_desde
  if (!horaDesde) return errorDb('gimnasio_franjas', 'franja sin datos')
  if (yaComenzo(reserva.fecha, horaDesde)) return rechazo('Ese horario ya comenzó, no se puede cancelar.')

  // El filtro por estado evita pisar una reserva que mientras tanto pasó a asistio/falto.
  const { data: actualizadas, error: updErr } = await supabaseAdmin
    .from('gimnasio_reservas')
    .update({ estado: 'cancelada' })
    .eq('id', reservaId)
    .eq('socio_id', socioId)
    .eq('estado', 'reservada')
    .select('id')
  if (updErr) return errorDb('cancelar reserva', updErr)
  if (!actualizadas?.length) return rechazo('Esa reserva ya no se puede cancelar.')

  return jsonOk({ ok: true })
}

// ─── mis-reservas ─────────────────────────────────────────────────────────────

async function handleMisReservas(socioId: string): Promise<Response> {
  const hoy = hoyLocal()

  const { data: reservas, error } = await supabaseAdmin
    .from('gimnasio_reservas')
    .select('id, fecha, origen, turno_fijo_id, franja_id, gimnasio_franjas(dia_semana, hora_desde, hora_hasta)')
    .eq('socio_id', socioId)
    .eq('estado', 'reservada')
    .gte('fecha', hoy)
    .order('fecha', { ascending: true })
  if (error) return errorDb('gimnasio_reservas', error)

  const { data: fijos, error: fijosErr } = await supabaseAdmin
    .from('gimnasio_turnos_fijos')
    .select('id, franja_id, faltas_consecutivas, gimnasio_franjas(dia_semana, hora_desde, hora_hasta)')
    .eq('socio_id', socioId)
    .eq('activo', true)
  if (fijosErr) return errorDb('gimnasio_turnos_fijos', fijosErr)

  type Franja = { dia_semana: number; hora_desde: string; hora_hasta: string } | null
  const franjaDe = (row: unknown): Franja => (row as { gimnasio_franjas: Franja }).gimnasio_franjas

  const reservasOut = (reservas ?? [])
    .map((r) => {
      const f = franjaDe(r)
      return {
        reserva_id: r.id,
        franja_id: r.franja_id,
        fecha: r.fecha,
        dia_semana: f?.dia_semana ?? diaISO(r.fecha),
        hora_desde: f ? hhmm(f.hora_desde) : null,
        hora_hasta: f ? hhmm(f.hora_hasta) : null,
        origen: r.origen,
        turno_fijo_id: r.turno_fijo_id,
        // Falta poco o ya empezó: la app no ofrece cancelar.
        cancelable: f ? !yaComenzo(r.fecha, f.hora_desde) : false,
        _hora: f?.hora_desde ?? '00:00:00',
      }
    })
    // Las de hoy que ya terminaron no son "próximas".
    .filter((r) => r.fecha > hoy || r.hora_hasta === null || !yaTermino(r.fecha, r.hora_hasta))
    .sort((a, b) => (a.fecha + a._hora).localeCompare(b.fecha + b._hora))
    .map(({ _hora: _, ...resto }) => resto)

  const fijosOut = (fijos ?? [])
    .map((t) => {
      const f = franjaDe(t)
      return {
        turno_fijo_id: t.id,
        franja_id: t.franja_id,
        dia_semana: f?.dia_semana ?? null,
        hora_desde: f ? hhmm(f.hora_desde) : null,
        hora_hasta: f ? hhmm(f.hora_hasta) : null,
        faltas_consecutivas: t.faltas_consecutivas,
      }
    })
    .sort((a, b) => (a.dia_semana ?? 0) - (b.dia_semana ?? 0) || (a.hora_desde ?? '').localeCompare(b.hora_desde ?? ''))

  return jsonOk({ ok: true, reservas: reservasOut, fijos: fijosOut })
}

function yaTermino(fecha: string, horaHasta: string): boolean {
  return new Date(`${fecha}T${horaHasta}:00-03:00`).getTime() <= Date.now()
}

// ─── crear-fijo ───────────────────────────────────────────────────────────────

async function handleCrearFijo(socioId: string, body: Record<string, unknown>): Promise<Response> {
  const franjaId = body.franja_id
  if (typeof franjaId !== 'string' || !UUID_RE.test(franjaId)) return rechazo('Franja inválida.')

  const cfg = await leerConfig()
  if (cfg instanceof Response) return cfg

  const { data: franja, error: franjaErr } = await supabaseAdmin
    .from('gimnasio_franjas')
    .select('id, dia_semana, cupo, activa')
    .eq('id', franjaId)
    .maybeSingle()
  if (franjaErr) return errorDb('gimnasio_franjas', franjaErr)
  if (!franja || !franja.activa) return rechazo('Esa franja no está disponible.')

  // Fijos activos del caller: no puede tener dos en la misma franja.
  const { data: propios, error: propiosErr } = await supabaseAdmin
    .from('gimnasio_turnos_fijos')
    .select('franja_id')
    .eq('socio_id', socioId)
    .eq('activo', true)
  if (propiosErr) return errorDb('gimnasio_turnos_fijos', propiosErr)

  if ((propios ?? []).some((p) => p.franja_id === franjaId)) {
    return rechazo('Ya tenés un turno fijo en esa franja.', { codigo: 'duplicado' })
  }

  // Lugar para fijos: el cupo base de la franja reservado a fijos (pct_cupo_fijos). No es un lock:
  // la reserva efectiva de cada fecha vuelve a validarse en gimnasio_reservar.
  const maxFijos = Math.floor((franja.cupo * cfg.pct_cupo_fijos) / 100)
  const { count: fijosActivos, error: cuentaErr } = await supabaseAdmin
    .from('gimnasio_turnos_fijos')
    .select('id', { count: 'exact', head: true })
    .eq('franja_id', franjaId)
    .eq('activo', true)
  if (cuentaErr) return errorDb('contar fijos', cuentaErr)
  if ((fijosActivos ?? 0) >= maxFijos) {
    return rechazo('Ya no quedan lugares para turnos fijos en esa franja.', { codigo: 'cupo_fijos_lleno' })
  }

  const { data: creado, error: insErr } = await supabaseAdmin
    .from('gimnasio_turnos_fijos')
    .insert({ socio_id: socioId, franja_id: franjaId })
    .select('id')
    .single()
  if (insErr) {
    // 23505: carrera con otra alta del mismo turno fijo (índice único parcial socio+franja activos).
    if ((insErr as { code?: string }).code === '23505') {
      return rechazo('Ya tenés un turno fijo en esa franja.', { codigo: 'duplicado' })
    }
    return errorDb('crear turno fijo', insErr)
  }

  // Reservas de las próximas semanas, de una vez (el cron sólo renueva). Si esto falla el turno fijo
  // ya está creado: se responde 500 igual (no se oculta el error de la base) y el cron lo completa
  // en su próxima corrida, porque la materialización es idempotente.
  const { data: mat, error: matErr } = await supabaseAdmin.rpc('gimnasio_materializar_fijos', {
    p_turno_fijo_id: creado.id,
  })
  if (matErr || !mat) return errorDb('materializar turno fijo', matErr)

  // Fechas que no se pudieron reservar (cupo lleno, cerrado, ...). 'pasado' (hoy, franja ya empezada)
  // no se cuenta: nadie espera reservar un horario que ya comenzó.
  const porCodigo = (mat.omitidas?.por_codigo ?? {}) as Record<string, number>
  const noReservadas = Object.entries(porCodigo)
    .filter(([codigo]) => codigo !== 'pasado')
    .reduce((acc, [, n]) => acc + n, 0)
  const errores = (mat.errores ?? []) as unknown[]
  if (errores.length > 0) {
    console.error('gimnasio-turnos: error al materializar el turno fijo:', JSON.stringify(errores))
  }

  const out: Record<string, unknown> = { ok: true, turno_fijo_id: creado.id, reservas_creadas: mat.creadas ?? 0 }
  if (errores.length > 0) {
    out.motivo_parcial = 'No se pudieron reservar todas las fechas. Lo vamos a reintentar automáticamente.'
  } else if (noReservadas > 0) {
    out.motivo_parcial = noReservadas === 1
      ? 'No se pudo reservar 1 fecha por cupo o cierre.'
      : `No se pudieron reservar ${noReservadas} fechas por cupo o cierre.`
  }
  return jsonOk(out)
}

// ─── cancelar-fijo ────────────────────────────────────────────────────────────

async function handleCancelarFijo(socioId: string, body: Record<string, unknown>): Promise<Response> {
  const fijoId = body.turno_fijo_id
  if (typeof fijoId !== 'string' || !UUID_RE.test(fijoId)) return rechazo('Turno fijo inválido.')

  const { data: fijo, error } = await supabaseAdmin
    .from('gimnasio_turnos_fijos')
    .select('id, socio_id, activo')
    .eq('id', fijoId)
    .maybeSingle()
  if (error) return errorDb('gimnasio_turnos_fijos', error)
  if (!fijo || fijo.socio_id !== socioId) return rechazo('No encontramos ese turno fijo.')
  if (!fijo.activo) return rechazo('Ese turno fijo ya estaba cancelado.')

  const { error: offErr } = await supabaseAdmin
    .from('gimnasio_turnos_fijos')
    .update({ activo: false })
    .eq('id', fijoId)
    .eq('socio_id', socioId)
  if (offErr) return errorDb('desactivar turno fijo', offErr)

  // Ocurrencias futuras todavía 'reservada'. La de hoy que ya empezó se deja como está
  // (asistencia/falta la resuelve el Lector o el cron).
  const { data: futuras, error: futErr } = await supabaseAdmin
    .from('gimnasio_reservas')
    .select('id, fecha, gimnasio_franjas(hora_desde)')
    .eq('turno_fijo_id', fijoId)
    .eq('socio_id', socioId)
    .eq('estado', 'reservada')
    .gte('fecha', hoyLocal())
  if (futErr) return errorDb('reservas del turno fijo', futErr)

  const ids = (futuras ?? [])
    .filter((r) => {
      const hora = (r as unknown as { gimnasio_franjas: { hora_desde: string } | null }).gimnasio_franjas?.hora_desde
      return hora ? !yaComenzo(r.fecha, hora) : true
    })
    .map((r) => r.id)

  let canceladas = 0
  if (ids.length > 0) {
    const { data: upd, error: updErr } = await supabaseAdmin
      .from('gimnasio_reservas')
      .update({ estado: 'cancelada' })
      .in('id', ids)
      .eq('estado', 'reservada')
      .select('id')
    if (updErr) return errorDb('cancelar ocurrencias', updErr)
    canceladas = upd?.length ?? 0
  }

  return jsonOk({ ok: true, reservas_canceladas: canceladas })
}
