// Edge Function: tenis-invitados
//
// Reserva de canchas de tenis para NO socios, desde la página pública uncasapp.com/tenis (sin
// sesión). Feature reservas-tenis, migración 20261112000000_reservas_tenis.
//
// Actions (body.action), todas POST:
//   disponibilidad        — { fecha:'AAAA-MM-DD' } canchas, turnos ocupados (sin nombres) y turnos
//                           libres por modalidad (sólo los que no dejan un hueco inválido:
//                           dejaHuecoValido). Sólo hoy .. hoy + anticipacion_dias.
//   reservar              — { cancha_id, inicio (ISO), modalidad, titular:{dni,nombre,apellido,email},
//                           jugadores:[{dni, nombre?, apellido?}] } (singles 1, dobles 3, sin el titular).
//                           Un jugador cuyo DNI es de un socio activo entra como socio (precio socio o
//                           carnet, lo resuelve la base); si no, como invitado y necesita nombre y
//                           apellido (si faltan: jugador_sin_nombre + dni). Guarda el turno 15 min
//                           (tenis_invitado_reservar) y manda el mail con el link de confirmación.
//                           => { reserva_id, hold_vence_at, total, jugadores:[{nombre,cargo,motivo}],
//                           email_enviado }.
//   confirmar             — { token } confirma el turno (tenis_invitado_confirmar, idempotente) =>
//                           { ya_confirmada, reserva:{cancha, inicio, fin, modalidad, comprobante_*,
//                           jugadores}, total, alias, comprobante_vence_at }. Sirve para recargar la
//                           página del link.
//   subir-comprobante     — { token, tipo ('jpg'|'png'|'pdf' o MIME), tamano (bytes) } URL firmada para
//                           subir el archivo a tenis-comprobantes/<reserva_id>/<uuid>.<ext>.
//   registrar-comprobante — { token, path } verifica el archivo subido y lo asocia a la reserva
//                           (tenis_invitado_comprobante): queda pendiente de aprobación.
//
// Seguridad:
// - El token del mail son 32 bytes al azar (base64url). La base guarda sólo su SHA-256 y el token
//   nunca se loguea ni vuelve en una respuesta: sólo viaja en el mail.
// - Límite por DNI, mail e IP (cf-connecting-ip) en `reservar`, con claves HMAC en
//   tenis_invitados_intentos (la tabla nunca guarda DNIs, mails ni IPs en claro).
// - CORS sólo para uncasapp.com y el dev local.
//
// Contrato de errores: validación/negocio => HTTP 200 { ok:false, codigo, motivo };
// errores reales => 500 { error }. Éxito => { ok:true, ... }.
//
// Deploy: supabase functions deploy tenis-invitados --no-verify-jwt
// Opcional: supabase secrets set TENIS_HMAC_KEY=<valor al azar> (si falta, RECUPERO_HMAC_KEY o la
// service role key).

import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { enviarEmail, emailTemplate } from '../_shared/email.ts'
import { ipCliente } from '../_shared/recupero-intentos.ts'
import {
  COMPROBANTE_BUCKET,
  COMPROBANTE_MAX_BYTES,
  CONTENT_TYPE_COMPROBANTE,
  UUID_RE,
  clavesLimiteInvitado,
  codigoDeError,
  dejaHuecoValido,
  describirTurno,
  diaSemanaIso,
  duracionMin,
  dentroDeAnticipacion,
  escapeHtml,
  extensionComprobante,
  fechaValida,
  finTurno,
  formatoPesos,
  generarToken,
  hashToken,
  horaInicioReal,
  horaLocal,
  instanteLocal,
  jugadoresRequeridos,
  linkConfirmacion,
  motivoTenis,
  normalizarDni,
  normalizarEmail,
  normalizarNombre,
  pathComprobanteValido,
  sumarDias,
  tokenConForma,
  validarTurno,
  type ClaveLimite,
  type Modalidad,
  type TenisConfig,
} from '../_shared/tenisReglas.ts'
import { cargarConfig } from '../_shared/tenisNotificar.ts'

const ESTADOS_ACTIVOS = ['pendiente_confirmacion', 'pendiente_comprobante', 'confirmada', 'jugada']

// ─── CORS propio: la página pública vive en uncasapp.com ──────────────────────

const ORIGENES = new Set([
  'https://uncasapp.com',
  'https://www.uncasapp.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
])

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ORIGENES.has(origin) ? origin : 'https://uncasapp.com',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

// Los headers CORS se agregan en Deno.serve, por pedido (según su Origin).
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

function rechazo(codigo: string, extra: Record<string, unknown> = {}): Response {
  return json({ ok: false, codigo, motivo: motivoTenis(codigo), ...extra })
}

function errorInterno(contexto: string, err: unknown): Response {
  const detalle = err && typeof err === 'object' && 'message' in err ? (err as { message: string }).message : String(err)
  console.error(`tenis-invitados: ${contexto}:`, detalle)
  return json({ error: 'Error interno' }, 500)
}

/** Error de una RPC: código de negocio => rechazo; cualquier otro => 500. */
function errorRpc(contexto: string, err: { code?: string; message?: string }): Response {
  const codigo = codigoDeError(err)
  return codigo ? rechazo(codigo) : errorInterno(contexto, err)
}

// ─── Entrada ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const headers = cors(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  const res = await atender(req)
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v)
  return res
})

async function atender(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Body inválido' }, 400)
  }

  try {
    switch (body.action) {
      case 'disponibilidad':        return await handleDisponibilidad(body)
      case 'reservar':              return await handleReservar(body, ipCliente((n) => req.headers.get(n)))
      case 'confirmar':             return await handleConfirmar(body)
      case 'subir-comprobante':     return await handleSubirComprobante(body)
      case 'registrar-comprobante': return await handleRegistrarComprobante(body)
      default:                      return json({ error: 'Acción desconocida' }, 400)
    }
  } catch (e) {
    return errorInterno(String(body.action), e)
  }
}

// ─── disponibilidad ───────────────────────────────────────────────────────────

interface Ocupado { cancha_id: string; inicio: string; fin: string }

async function handleDisponibilidad(body: Record<string, unknown>): Promise<Response> {
  const fecha = body.fecha
  if (!fechaValida(fecha)) return rechazo('parametros')
  const cfg = await cargarConfig()
  const ahora = new Date()
  if (!dentroDeAnticipacion(fecha, ahora, cfg)) return rechazo('anticipacion')

  const desdeDia = instanteLocal(fecha, '00:00')
  const hastaDia = instanteLocal(sumarDias(fecha, 1), '00:00')

  const [canchasRes, reservasRes, bloquesRes] = await Promise.all([
    supabaseAdmin.from('tenis_canchas').select('id, nombre, orden').eq('activa', true).order('orden'),
    supabaseAdmin
      .from('tenis_reservas')
      .select('cancha_id, inicio, fin')
      .in('estado', ESTADOS_ACTIVOS)
      .lt('inicio', hastaDia.toISOString())
      .gt('fin', desdeDia.toISOString()),
    supabaseAdmin
      .from('tenis_bloques')
      .select('cancha_id, dia_semana, fecha, hora_desde, hora_hasta, vigente_desde, vigente_hasta')
      .eq('activo', true)
      .or(`fecha.eq.${fecha},dia_semana.eq.${diaSemanaIso(fecha)}`),
  ])
  if (canchasRes.error) return errorInterno('tenis_canchas', canchasRes.error)
  if (reservasRes.error) return errorInterno('tenis_reservas', reservasRes.error)
  if (bloquesRes.error) return errorInterno('tenis_bloques', bloquesRes.error)

  const canchas = (canchasRes.data ?? []).map((c) => ({ id: c.id as string, nombre: c.nombre as string }))
  const ocupados: Ocupado[] = (reservasRes.data ?? []).map((r) => ({
    cancha_id: r.cancha_id as string,
    inicio: new Date(r.inicio as string).toISOString(),
    fin: new Date(r.fin as string).toISOString(),
  }))

  for (const b of bloquesRes.data ?? []) {
    // Recurrentes: sólo dentro de su vigencia. Puntuales: ya filtrados por fecha.
    if (b.dia_semana != null) {
      if (b.vigente_desde && fecha < (b.vigente_desde as string)) continue
      if (b.vigente_hasta && fecha > (b.vigente_hasta as string)) continue
    }
    const inicio = instanteLocal(fecha, b.hora_desde as string).toISOString()
    // hora_hasta '24:00' = hasta la medianoche (como tenis_bloques_dia en la base).
    const hasta = b.hora_hasta as string
    const fin = (hasta.startsWith('24:') ? instanteLocal(sumarDias(fecha, 1), '00:00') : instanteLocal(fecha, hasta)).toISOString()
    const destino = b.cancha_id ? [b.cancha_id as string] : canchas.map((c) => c.id)
    for (const cancha_id of destino) ocupados.push({ cancha_id, inicio, fin })
  }

  return json({
    ok: true,
    fecha,
    config: configPublica(cfg),
    canchas,
    ocupados,
    libres: {
      singles: turnosLibres(fecha, 'singles', canchas, ocupados, ahora, cfg),
      dobles: turnosLibres(fecha, 'dobles', canchas, ocupados, ahora, cfg),
    },
  })
}

function configPublica(cfg: TenisConfig) {
  return {
    hora_desde: cfg.hora_desde,
    hora_hasta: cfg.hora_hasta,
    modulo_min: cfg.modulo_min,
    margen_inicio_min: cfg.margen_inicio_min,
    singles_min: cfg.singles_min,
    dobles_min: cfg.dobles_min,
    anticipacion_dias: cfg.anticipacion_dias,
    hold_min: cfg.hold_min,
    comprobante_horas_antes: cfg.comprobante_horas_antes,
    alias_pago: cfg.alias_pago,
    precio_socio_single: cfg.precio_socio_single,
    precio_socio_dobles: cfg.precio_socio_dobles,
    precio_nosocio_single: cfg.precio_nosocio_single,
    precio_nosocio_dobles: cfg.precio_nosocio_dobles,
  }
}

function turnosLibres(
  fecha: string,
  modalidad: Modalidad,
  canchas: { id: string }[],
  ocupados: Ocupado[],
  ahora: Date,
  cfg: TenisConfig,
) {
  const libres: { cancha_id: string; inicio: string; hora: string; hora_real: string }[] = []
  const primero = instanteLocal(fecha, cfg.hora_desde)
  const ultimo = instanteLocal(fecha, cfg.hora_hasta).getTime() - duracionMin(modalidad, cfg) * 60_000
  for (const cancha of canchas) {
    const suyos = ocupados.filter((o) => o.cancha_id === cancha.id)
    for (let t = primero.getTime(); t <= ultimo; t += cfg.modulo_min * 60_000) {
      const inicio = new Date(t)
      if (validarTurno(inicio, modalidad, ahora, cfg) !== null) continue
      const fin = finTurno(inicio, modalidad, cfg).getTime()
      const pisa = suyos.some((o) => new Date(o.inicio).getTime() < fin && new Date(o.fin).getTime() > t)
      // Optimizador (regla fija, misma que la base): sin huecos de menos de singles_min, salvo hoy.
      if (!pisa && dejaHuecoValido(inicio, modalidad, suyos, ahora, cfg)) {
        libres.push({ cancha_id: cancha.id, inicio: inicio.toISOString(), hora: horaLocal(inicio), hora_real: horaInicioReal(inicio, cfg) })
      }
    }
  }
  return libres
}

// ─── reservar ─────────────────────────────────────────────────────────────────

type JugadorRpc = { dni: string } | { invitado: { dni: string; nombre: string; apellido: string } }

async function handleReservar(body: Record<string, unknown>, ip: string | null): Promise<Response> {
  const t = (body.titular ?? {}) as Record<string, unknown>
  const titular = {
    dni: normalizarDni(t.dni),
    nombre: normalizarNombre(t.nombre),
    apellido: normalizarNombre(t.apellido),
    email: normalizarEmail(t.email),
  }
  if (!titular.dni || !titular.nombre || !titular.apellido || !titular.email) return rechazo('parametros', { campo: 'titular' })

  const canchaId = body.cancha_id
  if (typeof canchaId !== 'string' || !UUID_RE.test(canchaId)) return rechazo('parametros', { campo: 'cancha_id' })
  const inicio = new Date(typeof body.inicio === 'string' ? body.inicio : '')
  const modalidad = body.modalidad

  const cfg = await cargarConfig()
  const codigoTurno = validarTurno(inicio, modalidad, new Date(), cfg)
  if (codigoTurno) return rechazo(codigoTurno)
  const mod = modalidad as Modalidad

  const crudos = Array.isArray(body.jugadores) ? body.jugadores : []
  if (crudos.length !== jugadoresRequeridos(mod)) return rechazo('cantidad_jugadores')
  const jugadores = crudos.map((j) => {
    const o = (j ?? {}) as Record<string, unknown>
    return { dni: normalizarDni(o.dni), nombre: normalizarNombre(o.nombre), apellido: normalizarNombre(o.apellido) }
  })
  if (jugadores.some((j) => !j.dni)) return rechazo('dni_invalido', { campo: 'jugadores' })
  const dnis = [titular.dni, ...jugadores.map((j) => j.dni as string)]
  if (new Set(dnis).size !== dnis.length) return rechazo('jugadores_duplicados')

  // El límite va antes de tocar el padrón: nada de lo que sigue se puede recorrer en loop.
  const limite = await limitar(titular.dni, titular.email, ip)
  if (limite === 'error') return errorInterno('limite', 'tenis_invitados_intentos no respondió')
  if (limite === 'limitado') return rechazo('limitado')

  // La base resuelve cada DNI (tenis_resolver_persona): {dni} = socio activo o invitado ya cargado;
  // {invitado:{...}} = socio activo si el DNI es de uno, si no alta del invitado. Un titular socio
  // da titular_es_socio. La web nunca manda socio_id (la base lo rechaza).
  const pJugadores: JugadorRpc[] = jugadores.map((j) =>
    j.nombre && j.apellido
      ? { invitado: { dni: j.dni as string, nombre: j.nombre, apellido: j.apellido } }
      : { dni: j.dni as string }
  )

  const token = generarToken()
  const { data, error } = await supabaseAdmin.rpc('tenis_invitado_reservar', {
    p_cancha_id: canchaId,
    p_inicio: inicio.toISOString(),
    p_modalidad: mod,
    p_titular: titular,
    p_jugadores: pJugadores,
    p_token_hash: await hashToken(token),
  })
  if (error) {
    // {dni} que no es de un socio ni de un invitado conocido: falta nombre y apellido. La base
    // manda el DNI normalizado en DETAIL (PostgREST: `details`); si no llegara, es el primer
    // jugador que se mandó sin nombre (los demás se resolvieron antes o tienen nombre).
    if (codigoDeError(error) === 'socio_no_encontrado') {
      const dni = normalizarDni((error as { details?: string }).details)
        ?? jugadores.find((j) => !(j.nombre && j.apellido))?.dni
        ?? null
      return rechazo('jugador_sin_nombre', { dni })
    }
    return errorRpc('tenis_invitado_reservar', error)
  }
  const r = (data ?? {}) as { reserva_id?: string; hold_vence_at?: string; total?: number; jugadores?: unknown }
  if (!r.reserva_id) return errorInterno('tenis_invitado_reservar', 'respuesta sin reserva_id')

  const total = Number(r.total ?? 0)
  const { data: cancha } = await supabaseAdmin.from('tenis_canchas').select('nombre').eq('id', canchaId).maybeSingle()
  const emailEnviado = await enviarEmail({
    to: titular.email,
    subject: 'Confirmá tu reserva de tenis — UNCAS',
    html: emailTemplate(`
      <p style="font-size:16px">Hola ${escapeHtml(titular.nombre)},</p>
      <p style="font-size:16px">Reservaste <strong>${escapeHtml(describirTurno(inicio, (cancha?.nombre as string) ?? null, cfg))}</strong>
        (${mod === 'singles' ? 'singles' : 'dobles'}). Total: <strong>${formatoPesos(total)}</strong>.</p>
      <p style="font-size:16px"><strong>Tenés ${cfg.hold_min} minutos para confirmarla.</strong> Si no, el turno se libera.</p>
      <p style="text-align:center;margin:28px 0">
        <a href="${linkConfirmacion(token)}" style="background:#F5B41C;color:#15110A;padding:14px 28px;text-decoration:none;font-weight:bold;border-radius:6px;display:inline-block">CONFIRMAR RESERVA</a>
      </p>
      <p style="font-size:14px;color:#555">Después de confirmar vas a tener que transferir a <strong>${escapeHtml(cfg.alias_pago)}</strong>
        y subir el comprobante hasta ${cfg.comprobante_horas_antes} horas antes del turno, o la reserva se cancela.</p>
      <p style="font-size:14px;color:#555">Si no la pediste vos, ignorá este mail.</p>
    `),
  })

  return json({
    ok: true,
    reserva_id: r.reserva_id,
    hold_vence_at: r.hold_vence_at ?? null,
    total,
    jugadores: jugadoresPublicos(r.jugadores),
    email_enviado: emailEnviado,
  })
}

/** Jugadores del resumen de la base, sólo lo que ve el invitado: nombre, cargo y motivo. */
function jugadoresPublicos(lista: unknown): { nombre: string; cargo: number; motivo: string | null; es_titular: boolean }[] {
  if (!Array.isArray(lista)) return []
  return lista.flatMap((j) => {
    if (!j || typeof j !== 'object') return []
    const o = j as Record<string, unknown>
    return [{
      nombre: typeof o.nombre === 'string' ? o.nombre : '',
      cargo: Number(o.cargo ?? 0),
      motivo: typeof o.motivo === 'string' ? o.motivo : null,
      es_titular: o.es_titular === true,
    }]
  })
}

// Cuenta pedidos por clave en la ventana; si alguna llegó al máximo no registra nada y rechaza.
// No es atómico entre pedidos simultáneos: como mucho deja pasar uno o dos de más.
async function limitar(dni: string, email: string, ip: string | null): Promise<'ok' | 'limitado' | 'error'> {
  const claveHmac = Deno.env.get('TENIS_HMAC_KEY') || Deno.env.get('RECUPERO_HMAC_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!claveHmac) return 'error'
  const claves: ClaveLimite[] = await clavesLimiteInvitado({ dni, email, ip }, claveHmac)
  for (const c of claves) {
    const desde = new Date(Date.now() - c.ventanaSegundos * 1000).toISOString()
    const { count, error } = await supabaseAdmin
      .from('tenis_invitados_intentos')
      .select('clave', { count: 'exact', head: true })
      .eq('clave', c.clave)
      .gte('created_at', desde)
    if (error) {
      console.error('tenis-invitados: conteo de intentos', error.code, error.message)
      return 'error'
    }
    if ((count ?? 0) >= c.maximo) {
      console.info(`tenis-invitados: limitado (clave=${c.clave}, ventana=${c.ventanaSegundos}s)`)
      return 'limitado'
    }
  }
  const { error } = await supabaseAdmin.from('tenis_invitados_intentos').insert(claves.map((c) => ({ clave: c.clave })))
  if (error) {
    console.error('tenis-invitados: registro de intentos', error.code, error.message)
    return 'error'
  }
  return 'ok'
}

// ─── confirmar ────────────────────────────────────────────────────────────────

interface ReservaToken {
  id: string
  cancha_id: string
  inicio: string
  fin: string
  modalidad: string
  estado: string
  comprobante_path: string | null
  comprobante_estado: string | null
  comprobante_motivo: string | null
  comprobante_vence_at: string | null
}

async function reservaPorToken(token: string): Promise<ReservaToken | null> {
  const { data, error } = await supabaseAdmin
    .from('tenis_reservas')
    .select('id, cancha_id, inicio, fin, modalidad, estado, comprobante_path, comprobante_estado, comprobante_motivo, comprobante_vence_at')
    .eq('confirmacion_token_hash', await hashToken(token))
    .eq('origen', 'invitado')
    .maybeSingle()
  if (error) throw new Error(`tenis_reservas por token: ${error.message}`)
  return (data as ReservaToken | null) ?? null
}

async function handleConfirmar(body: Record<string, unknown>): Promise<Response> {
  const token = body.token
  if (!tokenConForma(token)) return rechazo('token_invalido')

  // tenis_invitado_confirmar es idempotente: una recarga del link de una reserva ya confirmada
  // devuelve el mismo resumen. Se mira el estado de antes sólo para avisar "ya estaba confirmada".
  const antes = await reservaPorToken(token)
  const { data, error } = await supabaseAdmin.rpc('tenis_invitado_confirmar', { p_token_hash: await hashToken(token) })
  if (error) return errorRpc('tenis_invitado_confirmar', error)

  const cfg = await cargarConfig()
  // Resumen de la base (tenis_reserva_resumen + alias, comprobante_motivo, titular_nombre).
  const r = (data ?? {}) as Record<string, unknown>
  const inicio = new Date(String(r.inicio ?? antes?.inicio ?? ''))
  const fin = new Date(String(r.fin ?? antes?.fin ?? ''))
  const cancha = typeof r.cancha_nombre === 'string' ? r.cancha_nombre : null
  const valido = !Number.isNaN(inicio.getTime())

  return json({
    ok: true,
    ya_confirmada: !!antes && antes.estado !== 'pendiente_confirmacion',
    reserva: {
      id: (r.reserva_id as string | undefined) ?? antes?.id ?? null,
      cancha,
      inicio: valido ? inicio.toISOString() : null,
      fin: Number.isNaN(fin.getTime()) ? null : fin.toISOString(),
      hora_real: valido ? horaInicioReal(inicio, cfg) : null,
      descripcion: valido ? describirTurno(inicio, cancha, cfg) : null,
      modalidad: r.modalidad ?? null,
      estado: r.estado ?? null,
      comprobante_estado: r.comprobante_estado ?? null,
      comprobante_motivo: r.comprobante_motivo ?? null,
      comprobante_vence_at: r.comprobante_vence_at ?? null,
      jugadores: jugadoresPublicos(r.jugadores),
    },
    total: Number(r.total ?? 0),
    alias: typeof r.alias === 'string' ? r.alias : cfg.alias_pago,
    comprobante_vence_at: r.comprobante_vence_at ?? null,
  })
}

// ─── comprobante ──────────────────────────────────────────────────────────────

/** La reserva del token, si todavía acepta un comprobante; si no, el código del rechazo. */
async function reservaParaComprobante(token: unknown): Promise<ReservaToken | string> {
  if (!tokenConForma(token)) return 'token_invalido'
  const r = await reservaPorToken(token)
  if (!r) return 'token_invalido'
  if (r.estado !== 'pendiente_comprobante' || r.comprobante_estado === 'aprobado') return 'estado_invalido'
  if (r.comprobante_vence_at && new Date(r.comprobante_vence_at).getTime() <= Date.now()) return 'comprobante_vencido'
  return r
}

async function handleSubirComprobante(body: Record<string, unknown>): Promise<Response> {
  const ext = extensionComprobante(body.tipo)
  const tamano = Number(body.tamano)
  if (!ext || !Number.isFinite(tamano) || tamano <= 0 || tamano > COMPROBANTE_MAX_BYTES) return rechazo('comprobante_invalido')

  const r = await reservaParaComprobante(body.token)
  if (typeof r === 'string') return rechazo(r)

  const path = `${r.id}/${crypto.randomUUID()}.${ext}`
  const { data, error } = await supabaseAdmin.storage.from(COMPROBANTE_BUCKET).createSignedUploadUrl(path)
  if (error || !data) return errorInterno('createSignedUploadUrl', error)

  return json({
    ok: true,
    path,
    signed_url: data.signedUrl,
    upload_token: data.token,
    content_type: CONTENT_TYPE_COMPROBANTE[ext],
    max_bytes: COMPROBANTE_MAX_BYTES,
  })
}

async function handleRegistrarComprobante(body: Record<string, unknown>): Promise<Response> {
  const r = await reservaParaComprobante(body.token)
  if (typeof r === 'string') return rechazo(r)
  const path = body.path
  if (!pathComprobanteValido(path, r.id)) return rechazo('comprobante_invalido')

  // La URL firmada no limita el tamaño: se mira el archivo real antes de aceptarlo.
  const [carpeta, archivo] = path.split('/')
  const { data: objetos, error: errList } = await supabaseAdmin.storage.from(COMPROBANTE_BUCKET).list(carpeta, { search: archivo })
  if (errList) return errorInterno('storage.list', errList)
  const objeto = (objetos ?? []).find((o) => o.name === archivo)
  if (!objeto) return rechazo('comprobante_no_subido')
  const bytes = Number((objeto.metadata as Record<string, unknown> | null)?.size ?? 0)
  if (!bytes || bytes > COMPROBANTE_MAX_BYTES) {
    await supabaseAdmin.storage.from(COMPROBANTE_BUCKET).remove([path])
    return rechazo('comprobante_invalido')
  }

  const { error } = await supabaseAdmin.rpc('tenis_invitado_comprobante', {
    p_reserva_id: r.id,
    p_token_hash: await hashToken(body.token as string),
    p_path: path,
  })
  if (error) return errorRpc('tenis_invitado_comprobante', error)

  // Un comprobante anterior (rechazado o reemplazado) ya no sirve.
  if (r.comprobante_path && r.comprobante_path !== path) {
    const { error: errRm } = await supabaseAdmin.storage.from(COMPROBANTE_BUCKET).remove([r.comprobante_path])
    if (errRm) console.error('tenis-invitados: no se pudo borrar el comprobante anterior:', errRm.message)
  }

  return json({ ok: true, comprobante_estado: 'pendiente' })
}
