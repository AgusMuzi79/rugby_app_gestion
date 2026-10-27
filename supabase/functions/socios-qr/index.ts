// Edge Function: socios-qr
// Gestión del carnet digital QR TOTP.
//
// Actions:
//   get-secret     — Entrega el TOTP secret al dispositivo del socio (una vez por sesión/dispositivo).
//                    El secret se almacena en expo-secure-store y genera el QR localmente.
//                    Con `socio_id` en el body, entrega el secret de un DEPENDIENTE MENOR DE 13
//                    del caller (titular de grupo familiar viendo el carnet de su hijo — ver
//                    migración 20260915000000_titular_ve_carnet_menores).
//   validate       — Lector escanea el QR y recibe estado del socio + foto.
//   validate-dni   — Fallback sin QR (socio sin el celular encima): busca directo por DNI,
//                    sin código TOTP. Misma respuesta que validate.
//   listar-accesos — Panel web de Lector: historial de ingresos de un rango de días (tabla `accesos`).
//   registrar-invitado — Anota el ingreso de un no-socio (DNI obligatorio, nombre opcional) y
//                    devuelve cuántas veces entró ese DNI en los últimos 30 días, para que
//                    se lo derive a Secretaría cuando se repite (ver 20261003000001_accesos_invitados).
//   registrar-offline — La tablet dejó pasar SIN CONEXIÓN y encoló los escaneos: los valida
//                    a posteriori (código a la hora del escaneo, estado y servicio a la hora
//                    de sincronizar) y los registra con sin_conexion = true (y denegado si
//                    la validación falla). Ver 20261029000001_accesos_sin_conexion.
//
// Turnero (T7): en validate/validate-dni de una cuenta Lector (rol='porteria') la respuesta
//   suma `turno` (franja vigente, reserva del socio, mensaje para la tablet; ver
//   gimnasio_turno_actual en 20261008000000_gimnasio_lector_turno). Si el modo es
//   'bloqueante' y no hay reserva, el escaneo se deniega como el gate de servicio. Es
//   FAIL-OPEN: cualquier falla al calcular el turno se loguea y el escaneo sigue como antes.
//
// Seguridad:
//   get-secret:   JWT requerido, rol='socio' o 'cliente_gimnasio', retorna su propio secret o
//                 (con `socio_id`) el de un dependiente menor de 13 — validado server-side acá
//                 mismo (cabecera_id + edad), no delegado a RLS: socios_secrets no tiene ninguna
//                 policy de SELECT ni para el propio socio ni para el titular, sólo el
//                 service_role de esta función puede leerla.
//                 rol='tutor' (adulto no socio, ver 20261009000000_tutor_menores): `socio_id`
//                 obligatorio y vinculado al caller en tutores_menores (ver handleGetSecretTutor).
//   validate(-dni)/listar-accesos: JWT requerido, rol='porteria'/'canchero'/'buffet' (o secretaria/admin/subcomision).
//                   El caller NUNCA recibe el secret — solo info del socio.
//                   validate-dni no tiene el TOTP como segundo factor — confía en que el
//                   dispositivo ya está autenticado como Lector (mismo trust boundary que
//                   validate); el DNI no es secreto, así que cualquiera que lo sepa puede
//                   disparar la consulta desde la tablet — trade-off aceptado a cambio de
//                   tener un fallback cuando el socio no lleva el teléfono.
//
// Cada validate/validate-dni exitoso llamado por una cuenta Lector (rol='porteria'),
// Canchero (rol='canchero') o Buffet (rol='buffet') deja un registro en `accesos`
// (ver 20260902000000_accesos_gimnasio.sql) — es lo que alimenta listar-accesos, con
// `punto` distinto según el rol (gimnasio/tenis/buffet, ver PUNTO_POR_ROL). Un caller
// secretaria/admin/subcomision (ej. probando un QR) no genera registro — no
// representa un ingreso real.

import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { corsHeaders, jsonOk, jsonError } from '../_shared/cors.ts'
import { codigoValidoEnInstante, matchingStep } from '../_shared/totp.ts'
import { VENTANA_DUPLICADO_MS, leerItemOffline, leerLoteOffline, type ItemOffline } from '../_shared/accesos-offline.ts'
import { esTutorDe } from '../_shared/tutores.ts'
import { contarVecesInvitadoPorVisita, enTandas, hoyAR, resolverRango, traerTodasLasPaginas } from '../_shared/accesosRango.ts'
import { nombreVisible } from '../_shared/nombre-padron.ts'
import { motivoRechazoPorEstado } from '../_shared/estado-acceso.ts'
import { normalizarDni } from '../_shared/login-identificador.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // ─── Verificar JWT ────────────────────────────────────────────────────────────
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!jwt) return jsonError(401, 'Sin autorización')

  const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(jwt)
  if (authErr || !caller) return jsonError(401, 'Token inválido')

  const { data: callerProfile } = await supabaseAdmin
    .from('profiles')
    .select('rol')
    .eq('id', caller.id)
    .single()

  const callerRol = callerProfile?.rol ?? ''

  // ─── Routing ──────────────────────────────────────────────────────────────────
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return jsonError(400, 'Body inválido') }

  const { action } = body

  if (action === 'get-secret')     return handleGetSecret(callerRol, caller.id, body)
  if (action === 'validate')       return handleValidate(body, callerRol)
  if (action === 'validate-dni')   return handleValidateDni(body, callerRol)
  if (action === 'listar-accesos') return handleListarAccesos(body, callerRol)
  if (action === 'registrar-invitado') return handleRegistrarInvitado(body, callerRol)
  if (action === 'registrar-offline')  return handleRegistrarOffline(body, callerRol)

  return jsonError(400, `Acción desconocida: ${action}`)
})

// ─── Entregar TOTP secret al dispositivo del socio ────────────────────────────
//
// El socio llama esto en su primer login (o tras reinstalar la app).
// El secret viaja sobre HTTPS y se guarda en expo-secure-store.
// NO se regenera el secret en cada llamada — siempre es el mismo.

// Mismo umbral y misma fórmula que useAccesoRestringido.ts (EDAD_MINIMA=13)
// y que es_menor_de_13() en SQL — duplicado a propósito: esta función corre
// con service_role y no puede apoyarse en la policy de RLS (que además no
// existe para socios_secrets), tiene que validar el vínculo ella misma.
function esMenorDe13(fechaNacimiento: string | null): boolean {
  if (!fechaNacimiento) return false
  const limite = new Date()
  limite.setFullYear(limite.getFullYear() - 13)
  return new Date(fechaNacimiento) > limite
}

async function handleGetSecret(
  callerRol: string,
  callerId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  if (callerRol === 'tutor') return handleGetSecretTutor(callerId, body)

  // 'cliente_gimnasio' también es una fila real de `socios` (ver migración
  // 20260911000000_rol_cliente_gimnasio) — mismo carnet QR/TOTP que un socio.
  if (callerRol !== 'socio' && callerRol !== 'cliente_gimnasio') {
    return jsonError(403, 'Sólo socios o clientes de gimnasio pueden obtener su secret')
  }

  // Buscar socio_id del caller (titular, si pide el de un dependiente)
  const { data: callerSocio, error: callerSocioErr } = await supabaseAdmin
    .from('socios')
    .select('id, estado')
    .eq('profile_id', callerId)
    .single()

  if (callerSocioErr || !callerSocio) return jsonError(404, 'Registro de socio no encontrado')

  const socioIdDestino = (body.socio_id as string | undefined)?.trim()
  let socioId = callerSocio.id
  let estadoSocio = callerSocio.estado

  if (socioIdDestino && socioIdDestino !== callerSocio.id) {
    // Carnet de un dependiente — sólo si es MENOR DE 13 y cuelga de este
    // titular (cabecera_id). Un dependiente adulto no está contemplado: se
    // loguea solo y ve su propio carnet, no hace falta este camino.
    const { data: dependiente, error: depErr } = await supabaseAdmin
      .from('socios')
      .select('id, estado, cabecera_id, fecha_nacimiento')
      .eq('id', socioIdDestino)
      .single()

    if (depErr || !dependiente) return jsonError(404, 'Dependiente no encontrado')
    if (dependiente.cabecera_id !== callerSocio.id) {
      return jsonError(403, 'Ese socio no es un dependiente tuyo')
    }
    if (!esMenorDe13(dependiente.fecha_nacimiento)) {
      return jsonError(403, 'Sólo podés ver el carnet de dependientes menores de 13 años')
    }

    socioId = dependiente.id
    estadoSocio = dependiente.estado
  }

  if (estadoSocio === 'inactivo') return jsonError(403, 'Socio inactivo')

  // Leer secret de socios_secrets (sin RLS → service role lo puede leer)
  const { data: secretData, error: secretErr } = await supabaseAdmin
    .from('socios_secrets')
    .select('totp_secret')
    .eq('socio_id', socioId)
    .single()

  if (secretErr || !secretData) {
    return jsonError(500, 'Secret TOTP no encontrado. Contactá a Secretaría.')
  }

  return jsonOk({ secret: secretData.totp_secret })
}

// Tutor (adult without a `socios` row, see migration 20261009000000_tutor_menores): `socio_id`
// is mandatory and must be one of the minors linked to the caller in tutores_menores. No age
// check here — the link itself is the authorization and survives the minor turning 13.
async function handleGetSecretTutor(
  callerId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const socioId = (body.socio_id as string | undefined)?.trim()
  if (!socioId) return jsonError(400, 'socio_id es requerido')

  if (!(await esTutorDe(callerId, socioId))) {
    return jsonError(403, 'Ese socio no está vinculado a tu cuenta')
  }

  const { data: menor, error: menorErr } = await supabaseAdmin
    .from('socios')
    .select('id, estado')
    .eq('id', socioId)
    .single()

  if (menorErr || !menor) return jsonError(404, 'Socio no encontrado')
  if (menor.estado === 'inactivo') return jsonError(403, 'Socio inactivo')

  const { data: secretData, error: secretErr } = await supabaseAdmin
    .from('socios_secrets')
    .select('totp_secret')
    .eq('socio_id', socioId)
    .single()

  if (secretErr || !secretData) {
    return jsonError(500, 'Secret TOTP no encontrado. Contactá a Secretaría.')
  }

  return jsonOk({ secret: secretData.totp_secret })
}

// ─── Validar QR en portería ───────────────────────────────────────────────────
//
// La app de portería escanea el QR del socio.
// Formato del QR: "{numero_socio}:{totp_code_6_digits}"
// La app envía numero_socio y code separados (el parseo lo hace la app).
//
// Respuesta exitosa: nombre, foto_path (para mostrar la cara), categoria, estado.
// Portería NUNCA recibe el totp_secret — solo validamos server-side.

const SOCIO_SELECT = `
  id,
  numero_socio,
  estado,
  semaforo,
  foto_path,
  foto_validada,
  nombre_padron,
  categorias_socio ( nombre ),
  profiles!socios_profile_id_fkey ( nombre )
`

// validate trae el secret en la misma consulta (socios_secrets.socio_id es PK:
// relación uno a uno) — antes era un segundo viaje a la base.
const SOCIO_SELECT_CON_SECRET = `${SOCIO_SELECT}, socios_secrets ( totp_secret )`

type SecretEmbed = { totp_secret: string } | { totp_secret: string }[] | null

type SocioRow = {
  id: string
  numero_socio: string
  estado: string
  semaforo: string | null
  foto_path: string | null
  foto_validada: boolean
  nombre_padron: string | null
  categorias_socio: { nombre: string } | null
  profiles: { nombre: string } | null
}

function socioResponse(socio: SocioRow) {
  return {
    valido:        true,
    // Mismo nombre que el carnet: el del padrón, con el del perfil de respaldo.
    nombre:        nombreVisible(socio.nombre_padron, socio.profiles?.nombre),
    numero_socio:  socio.numero_socio,
    estado:        socio.estado,
    semaforo:      socio.semaforo,
    foto_path:     socio.foto_path,
    foto_validada: socio.foto_validada,
    categoria:     socio.categorias_socio?.nombre ?? '—',
  }
}

// Deja registro en `accesos` sólo cuando el que escanea es una cuenta Lector o
// Canchero real — un secretaria/admin/subcomision probando un QR no representa
// un ingreso. Falla en silencio (fire & forget): un problema acá no puede
// tumbar el escaneo, que ya le mostró el resultado al socio.
const PUNTO_POR_ROL: Record<string, string> = {
  porteria: 'gimnasio',
  canchero: 'tenis',
  buffet:   'buffet',
}

// ─── Gate de servicio: Lector exige Gimnasio contratado ───────────────────────
//
// A diferencia de Canchero/Buffet (que hoy sólo validan "socio al día",
// igual que Lector antes de esto), el gimnasio es autoservicio sin nadie
// atendiendo la puerta — el escaneo ES el control de acceso, así que acá sí
// hace falta bloquear de verdad si el servicio no está contratado, no sólo
// mostrar un aviso.
//
// El catálogo real (`servicios_opcionales`, ver 20260821000000_gimnasio_variantes_padron_servicios
// y 20260805000002_fix_gimnasio_catalogo_drift) tiene varias variantes de
// gimnasio (Gimnasio, Gimnasio Menor, Gimnasio Alícuota, Gimnasio Becado) —
// hoy en la práctica casi todo el vínculo real está en la fila "Gimnasio"
// (249 socios), pero se matchea por nombre para no dejar afuera a las otras
// variantes si secretaría empieza a usarlas.
//
// "Cliente Gimnasio" es un caso aparte: no son socios del club, son filas de
// `socios` con categoría "Cliente Gimnasio" y rol 'cliente_gimnasio' (ver
// 20260911000000_rol_cliente_gimnasio) — no tienen fila en `socio_servicios`
// porque la categoría ya los distingue, el gimnasio ES su único servicio.
// null = no se pudo consultar (error de la base): no es lo mismo que "no tiene
// el servicio", y el socio no puede leer un rechazo falso.
async function tieneServicioGimnasio(socioId: string, categoriaNombre: string | null): Promise<boolean | null> {
  if (categoriaNombre === 'Cliente Gimnasio') return true

  const { data, error } = await supabaseAdmin
    .from('socio_servicios')
    .select('servicios_opcionales!inner(nombre, activo)')
    .eq('socio_id', socioId)
    .eq('servicios_opcionales.activo', true)
    .ilike('servicios_opcionales.nombre', '%gimnasio%')
    .limit(1)

  if (error) {
    console.error('servicio-gimnasio:', error.message)
    return null
  }
  return (data?.length ?? 0) > 0
}

// Firma la foto para la tablet (antes la app hacía un segundo viaje para esto).
// null si no hay foto o la firma falla: el resultado se muestra igual, sin foto.
async function firmarFoto(path: string | null): Promise<string | null> {
  if (!path) return null
  try {
    const { data, error } = await supabaseAdmin.storage.from('socios-fotos').createSignedUrl(path, 60)
    if (error) {
      console.error('firmar-foto:', error.message)
      return null
    }
    return data?.signedUrl ?? null
  } catch (e) {
    console.error('firmar-foto:', e instanceof Error ? e.message : String(e))
    return null
  }
}

// Corre la tarea después de responder (EdgeRuntime.waitUntil): el registro en
// `accesos` ya no demora el resultado en la tablet. Sin EdgeRuntime (fuera de
// Supabase) se espera, como antes.
function enSegundoPlano(tarea: Promise<unknown>): Promise<void> {
  const segura = tarea.then(
    () => undefined,
    (e) => console.error('segundo plano:', e instanceof Error ? e.message : String(e)),
  )
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime
  if (typeof rt?.waitUntil === 'function') {
    rt.waitUntil(segura)
    return Promise.resolve()
  }
  return segura
}

// `sinServicio` marca el escaneo de un socio sin Gimnasio contratado (el
// Lector igual le muestra el aviso, pero el intento queda visible en el panel).
// `sinReserva` marca el escaneo dentro de una franja vigente sin reserva (turnero).
// `motivoRechazo` (texto corto) = el escaneo NO pasó: se guarda con denegado = true
// para que el panel no lo cuente como ingreso (migración 20261029000000). Las
// columnas opcionales sólo se escriben cuando hacen falta.
interface MarcasAcceso {
  sinServicio?:   boolean
  sinReserva?:    boolean
  motivoRechazo?: string | null
}

async function registrarAcceso(
  socioId: string,
  semaforo: string | null,
  callerRol: string,
  marcas: MarcasAcceso = {},
): Promise<void> {
  const punto = PUNTO_POR_ROL[callerRol]
  if (!punto) return
  const { error } = await supabaseAdmin
    .from('accesos')
    .insert({
      socio_id: socioId,
      semaforo,
      punto,
      sin_servicio: marcas.sinServicio ?? false,
      ...(marcas.sinReserva ? { sin_reserva: true } : {}),
      ...(marcas.motivoRechazo ? { denegado: true, motivo_rechazo: marcas.motivoRechazo } : {}),
    })
  if (error) console.error('registrarAcceso:', error.message)
}

// ─── Turno actual del socio (turnero, sólo Lector) ────────────────────────────
//
// Lo decide gimnasio_turno_actual en SQL. FAIL-OPEN: cualquier problema (error de la
// RPC, función ausente, forma inesperada, excepción) devuelve null y el escaneo sigue
// exactamente como antes — el turnero nunca puede negar una entrada por un bug propio.
type TurnoActual = {
  modo:       string
  estado:     string
  franja:     { id: string; hora_desde: string; hora_hasta: string; profesor: string | null } | null
  reserva_id: string | null
  ocupados:   number | null
  capacidad:  number | null
  bloquear:   boolean
  mensaje:    string
}

async function obtenerTurno(socioId: string): Promise<TurnoActual | null> {
  try {
    const { data, error } = await supabaseAdmin.rpc('gimnasio_turno_actual', { p_socio_id: socioId })
    if (error) {
      console.error('turno-actual (rpc):', error.message)
      return null
    }
    const t = data as Record<string, unknown> | null
    if (!t || typeof t !== 'object' || t.ok !== true || typeof t.estado !== 'string') {
      console.error('turno-actual: respuesta inesperada', JSON.stringify(data))
      return null
    }
    return {
      modo:       typeof t.modo === 'string' ? t.modo : 'informativo',
      estado:     t.estado,
      franja:     (t.franja ?? null) as TurnoActual['franja'],
      reserva_id: typeof t.reserva_id === 'string' ? t.reserva_id : null,
      ocupados:   typeof t.ocupados === 'number' ? t.ocupados : null,
      capacidad:  typeof t.capacidad === 'number' ? t.capacidad : null,
      bloquear:   t.bloquear === true,
      mensaje:    typeof t.mensaje === 'string' ? t.mensaje : '',
    }
  } catch (e) {
    console.error('turno-actual:', e instanceof Error ? e.message : String(e))
    return null
  }
}

// No encontrado (0 filas, o más de una para `.single()`) se distingue de un
// error de la base: éste no puede mostrarse como "no existe".
function esNoEncontrado(error: { code?: string } | null): boolean {
  return !error || error.code === 'PGRST116'
}

const MOTIVO_SIN_SERVICIO = 'No tenés el servicio de Gimnasio contratado. Consultá con Secretaría.'

// Lo común a validate y validate-dni una vez identificado el socio: estado,
// servicio, turno, consumo del código (sólo QR en el gimnasio), registro y
// respuesta. `paso` = paso TOTP a consumir, o null (DNI).
//
// Latencia: servicio, turno y firma de la foto no dependen entre sí y van en
// paralelo; el registro en `accesos` corre después de responder. El consumo
// del código sigue esperándose ANTES de decir "pasa" (es el control de reuso).
async function decidirIngreso(row: SocioRow, callerRol: string, paso: number | null): Promise<Response> {
  // Dado de baja: no pasa en ningún lector (antes salía verde "AL DÍA").
  const motivoEstado = motivoRechazoPorEstado(row.estado)
  if (motivoEstado) return jsonOk({ valido: false, motivo: motivoEstado, estado: row.estado })

  const esGimnasio = callerRol === 'porteria'
  const [tieneGimnasio, turno, fotoUrl] = await Promise.all([
    esGimnasio ? tieneServicioGimnasio(row.id, row.categorias_socio?.nombre ?? null) : Promise.resolve(true),
    // FAIL-OPEN, nunca tira (ver obtenerTurno).
    esGimnasio ? obtenerTurno(row.id) : Promise.resolve(null),
    firmarFoto(row.foto_path),
  ])

  if (tieneGimnasio === null) return jsonError(500, 'No se pudo verificar el servicio de Gimnasio. Probá de nuevo.')
  if (!tieneGimnasio) {
    await enSegundoPlano(registrarAcceso(row.id, row.semaforo, callerRol, { sinServicio: true, motivoRechazo: 'Sin servicio' }))
    return jsonOk({ valido: false, motivo: MOTIVO_SIN_SERVICIO })
  }

  // Turnero: sólo después del gate de servicio (que conserva la prioridad).
  if (turno?.bloquear) {
    await enSegundoPlano(registrarAcceso(row.id, row.semaforo, callerRol, { sinReserva: true, motivoRechazo: 'Sin reserva' }))
    return jsonOk({
      valido: false,
      motivo: turno.mensaje || 'No tenés una reserva para este horario. Reservá desde la app.',
      turno,
    })
  }

  // Un código abre una sola vez en el gimnasio (autoservicio: nadie mira la
  // foto, una captura reenviada abría la puerta). Canchero y Buffet son
  // atendidos y no lo consumen, así un socio puede pasar por los dos en el
  // mismo minuto. Se consume recién al dejar pasar (un rechazo no lo quema).
  // Si el RPC falla se deja pasar y se loguea: un error de la base no es una
  // captura reenviada, y cerrar la puerta a todos es peor.
  if (esGimnasio && paso !== null) {
    const { data: consumido, error: consumoErr } = await supabaseAdmin
      .rpc('consumir_paso_totp', { p_socio_id: row.id, p_paso: paso })
    if (consumoErr) {
      console.error('consumir_paso_totp:', consumoErr.message)
    } else if (consumido !== true) {
      return jsonOk({
        valido: false,
        // La tablet lo usa para reconocer el reintento de su propio escaneo
        // que se cortó por timeout (el ingreso ya quedó registrado).
        codigo_ya_usado: true,
        motivo: 'Este código ya se usó. Esperá el código siguiente del carnet (cambia cada minuto).',
      })
    }
  }

  // registrarAcceso ignora a secretaria/admin/subcomision (sin punto).
  await enSegundoPlano(registrarAcceso(row.id, row.semaforo, callerRol, { sinReserva: turno?.estado === 'sin_reserva' }))

  return jsonOk({ ...socioResponse(row), foto_url: fotoUrl, turno })
}

async function handleValidate(
  body: Record<string, unknown>,
  callerRol: string
): Promise<Response> {
  const ALLOWED = ['porteria', 'canchero', 'buffet', 'secretaria', 'admin', 'subcomision']
  if (!ALLOWED.includes(callerRol)) return jsonError(403, 'Sin permiso para validar carnets')

  const numero_socio = (body.numero_socio as string | undefined)?.trim()
  const code         = (body.code as string | undefined)?.trim()

  if (!numero_socio) return jsonError(400, 'numero_socio es requerido')
  if (!code)         return jsonError(400, 'code es requerido')
  if (!/^\d{6}$/.test(code)) return jsonError(400, 'code debe tener 6 dígitos')

  // Socio + categoría + perfil + secret en una sola consulta.
  const { data: socio, error: socioErr } = await supabaseAdmin
    .from('socios')
    .select(SOCIO_SELECT_CON_SECRET)
    .eq('numero_socio', numero_socio)
    .single()

  if (socioErr && !esNoEncontrado(socioErr)) {
    console.error('validate (socio):', socioErr.message)
    return jsonError(500, 'No se pudo consultar el socio. Probá de nuevo.')
  }
  if (!socio) {
    return jsonOk({ valido: false, motivo: 'Socio no encontrado' })
  }

  const row = socio as unknown as SocioRow & { socios_secrets: SecretEmbed }
  const secretData = Array.isArray(row.socios_secrets) ? row.socios_secrets[0] : row.socios_secrets

  if (!secretData?.totp_secret) {
    return jsonOk({ valido: false, motivo: 'Carnet no configurado. Contactar Secretaría.' })
  }

  // Verificar código TOTP (drift ±1 step = ±60s de tolerancia)
  const paso = await matchingStep(secretData.totp_secret, code)

  if (paso === null) {
    return jsonOk({ valido: false, motivo: 'Código QR inválido o expirado' })
  }

  return decidirIngreso(row, callerRol, paso)
}

// ─── Fallback sin QR: buscar directo por DNI ──────────────────────────────────
//
// Para cuando el socio no lleva el celular encima. Sin TOTP de por medio — el
// DNI no es secreto, así que esto confía en que sólo cuentas Lector/staff ya
// autenticadas pueden llamar la función (mismo chequeo de rol que validate).

async function handleValidateDni(
  body: Record<string, unknown>,
  callerRol: string
): Promise<Response> {
  const ALLOWED = ['porteria', 'canchero', 'buffet', 'secretaria', 'admin', 'subcomision']
  if (!ALLOWED.includes(callerRol)) return jsonError(403, 'Sin permiso para validar carnets')

  // socios.dni guarda sólo dígitos: "30.123.456" o con espacios no encontraba a nadie.
  const dni = normalizarDni(body.dni as string | undefined)
  if (!dni) return jsonError(400, 'dni es requerido')

  const { data: socio, error: socioErr } = await supabaseAdmin
    .from('socios')
    .select(SOCIO_SELECT)
    .eq('dni', dni)
    .single()

  if (socioErr && !esNoEncontrado(socioErr)) {
    console.error('validate-dni (socio):', socioErr.message)
    return jsonError(500, 'No se pudo consultar el socio. Probá de nuevo.')
  }
  if (!socio) {
    return jsonOk({ valido: false, motivo: 'No se encontró ningún socio con ese DNI' })
  }

  return decidirIngreso(socio as unknown as SocioRow, callerRol, null)
}

// ─── Invitados (no-socios) en el gimnasio ─────────────────────────────────────
//
// Los errores de validación vuelven como 200 con `ok: false` + `motivo` (no
// como jsonError): supabase.functions.invoke esconde el body de un non-2xx y
// la tablet necesita mostrarle el motivo real al encargado.

const VENTANA_INVITADO_DIAS = 30

// null = no se pudo contar (error de la consulta): el caller no debe mostrar un 0 falso.
async function contarVecesInvitado(dni: string): Promise<number | null> {
  const desde = new Date(Date.now() - VENTANA_INVITADO_DIAS * 24 * 60 * 60 * 1000)
  const { count, error } = await supabaseAdmin
    .from('accesos')
    .select('id', { count: 'exact', head: true })
    .eq('es_invitado', true)
    .eq('invitado_dni', dni)
    .gte('creado_en', desde.toISOString())
  if (error) {
    console.error('contar-veces-invitado:', error.message)
    return null
  }
  return count ?? 0
}

async function handleRegistrarInvitado(
  body: Record<string, unknown>,
  callerRol: string
): Promise<Response> {
  const ALLOWED = ['porteria', 'canchero', 'buffet', 'secretaria', 'admin', 'subcomision']
  if (!ALLOWED.includes(callerRol)) return jsonError(403, 'Sin permiso para registrar invitados')

  // Igual que validate: secretaria/admin/subcomision no representan un ingreso real.
  const punto = PUNTO_POR_ROL[callerRol]
  if (!punto) return jsonOk({ ok: false, motivo: 'Sólo las cuentas de acceso pueden registrar invitados' })

  const dni = normalizarDni(body.dni as string | undefined)
  if (!/^\d{6,9}$/.test(dni)) return jsonOk({ ok: false, motivo: 'El DNI debe tener entre 6 y 9 dígitos' })

  const nombreRaw = (body.nombre as string | undefined)?.trim() ?? ''
  if (nombreRaw.length > 80) return jsonOk({ ok: false, motivo: 'El nombre no puede superar los 80 caracteres' })
  const nombre = nombreRaw || null

  // Un socio no se carga como invitado: se consulta como socio (así queda el
  // aviso de servicio/cuota y el registro con su número).
  const { data: socioExistente, error: socioError } = await supabaseAdmin
    .from('socios')
    .select('id')
    .eq('dni', dni)
    .limit(1)

  // Sin poder verificar el DNI no se inserta: podría ser un socio real.
  if (socioError) {
    console.error('registrar-invitado (verificar DNI):', socioError.message)
    return jsonOk({ ok: false, motivo: 'No se pudo verificar el DNI. Probá de nuevo.' })
  }

  if ((socioExistente?.length ?? 0) > 0) {
    return jsonOk({ ok: false, motivo: 'Ese DNI pertenece a un socio. Escaneá su carnet o consultalo por DNI como socio.' })
  }

  const { error } = await supabaseAdmin
    .from('accesos')
    .insert({
      socio_id: null,
      semaforo: null,
      punto,
      es_invitado: true,
      invitado_dni: dni,
      invitado_nombre: nombre,
    })

  if (error) {
    console.error('registrar-invitado:', error.message)
    return jsonError(500, 'No se pudo registrar el invitado')
  }

  const veces = await contarVecesInvitado(dni)
  return jsonOk({ ok: true, dni, nombre, veces })
}

// ─── Escaneos sin conexión (T4) ───────────────────────────────────────────────
//
// Sin red la tablet deja pasar ("SIN CONEXIÓN · INGRESO REGISTRADO SIN VALIDAR",
// el personal mira a la persona) y encola el escaneo crudo. Al volver la red lo
// manda acá en tandas (`items`, ver _shared/accesos-offline.ts) y se valida a
// posteriori: el código TOTP a la hora del escaneo (sin consumir el paso: es
// del pasado), y estado y servicio a la hora de sincronizar. Cada ítem queda en
// `accesos` con creado_en = hora del escaneo y sin_conexion = true; si la
// validación falla, además denegado + motivo (entró, pero sin un carnet válido).
// El turnero no se evalúa (no tiene sentido a posteriori).
//
// Respuesta: { ok: true, resultados: [{ id_cola, estado, motivo? }] }, estado:
//   registrado    — fila nueva (con denegado si la validación falló).
//   duplicado     — ya estaba: lote reintentado (id_cola único) o el escaneo en
//                   línea llegó al servidor aunque la tablet se cortó por timeout.
//   invalido      — no se puede usar (forma, hora fuera de ventana): la tablet lo saca de la cola.
//   no_encontrado — no hay socio con ese número / DNI: no hay a quién registrarlo.
//   error         — falla de la base: la tablet lo reintenta.

type EstadoOffline = 'registrado' | 'duplicado' | 'invalido' | 'no_encontrado' | 'error'

interface ResultadoOffline {
  id_cola: string | null
  estado:  EstadoOffline
  motivo?: string
}

async function handleRegistrarOffline(
  body: Record<string, unknown>,
  callerRol: string
): Promise<Response> {
  const ALLOWED = ['porteria', 'canchero', 'buffet', 'secretaria', 'admin', 'subcomision']
  if (!ALLOWED.includes(callerRol)) return jsonError(403, 'Sin permiso para registrar accesos')

  // Igual que validate: secretaria/admin/subcomision no representan un ingreso real.
  const punto = PUNTO_POR_ROL[callerRol]
  if (!punto) return jsonOk({ ok: false, motivo: 'Sólo las cuentas de acceso registran ingresos' })

  const lote = leerLoteOffline(body.items)
  if (!lote.ok) return jsonError(400, lote.motivo)

  const ahora = Date.now()
  const resultados: ResultadoOffline[] = []
  // De a uno: son pocos (lo que se juntó sin red) y un ítem que falla no tumba al resto.
  for (const raw of lote.items) {
    const lectura = leerItemOffline(raw, ahora)
    if (!lectura.ok) {
      resultados.push({ id_cola: lectura.id_cola, estado: 'invalido', motivo: lectura.motivo })
      continue
    }
    try {
      resultados.push(await registrarItemOffline(lectura.item, callerRol, punto))
    } catch (e) {
      console.error('registrar-offline:', lectura.item.id_cola, e instanceof Error ? e.message : String(e))
      resultados.push({ id_cola: lectura.item.id_cola, estado: 'error', motivo: 'No se pudo registrar. Se reintenta.' })
    }
  }

  return jsonOk({ ok: true, resultados })
}

async function buscarSocioOffline(item: ItemOffline) {
  if (item.tipo === 'qr') {
    return await supabaseAdmin.from('socios').select(SOCIO_SELECT_CON_SECRET).eq('numero_socio', item.numero_socio).single()
  }
  return await supabaseAdmin.from('socios').select(SOCIO_SELECT).eq('dni', item.dni).single()
}

// Tira ante un error de la base (el ítem vuelve como 'error' y se reintenta).
async function registrarItemOffline(item: ItemOffline, callerRol: string, punto: string): Promise<ResultadoOffline> {
  const id_cola = item.id_cola

  const { data: socio, error: socioErr } = await buscarSocioOffline(item)
  if (socioErr && !esNoEncontrado(socioErr)) throw new Error(socioErr.message)
  if (!socio) {
    return { id_cola, estado: 'no_encontrado', motivo: item.tipo === 'qr' ? 'Socio no encontrado' : 'No hay socio con ese DNI' }
  }
  const row = socio as unknown as SocioRow & { socios_secrets?: SecretEmbed }

  // El escaneo en línea pudo llegar al servidor aunque la tablet se cortó por
  // timeout (y lo encoló): un ingreso en línea del mismo socio en esa ventana
  // es el mismo. Sólo los que pasaron: un rechazo en línea seguido de un
  // ingreso sin conexión son dos hechos distintos.
  const { data: previo, error: previoErr } = await supabaseAdmin
    .from('accesos')
    .select('id')
    .eq('socio_id', row.id)
    .eq('punto', punto)
    .eq('sin_conexion', false)
    .eq('denegado', false)
    .gte('creado_en', new Date(item.instante - VENTANA_DUPLICADO_MS).toISOString())
    .lte('creado_en', new Date(item.instante + VENTANA_DUPLICADO_MS).toISOString())
    .limit(1)
  if (previoErr) throw new Error(previoErr.message)
  if ((previo?.length ?? 0) > 0) return { id_cola, estado: 'duplicado', motivo: 'Ya estaba registrado en línea' }

  // Validación a posteriori. Motivos cortos: el panel los muestra como "RECHAZADO · …".
  let motivo: string | null = null
  let sinServicio = false
  if (item.tipo === 'qr') {
    const secret = Array.isArray(row.socios_secrets) ? row.socios_secrets[0] : row.socios_secrets
    if (!secret?.totp_secret) motivo = 'Carnet sin configurar'
    else if (!(await codigoValidoEnInstante(secret.totp_secret, item.code, item.instante))) motivo = 'Código inválido'
  }
  if (!motivo && motivoRechazoPorEstado(row.estado)) motivo = 'Dado de baja'
  if (!motivo && callerRol === 'porteria') {
    const tieneGimnasio = await tieneServicioGimnasio(row.id, row.categorias_socio?.nombre ?? null)
    if (tieneGimnasio === null) throw new Error('no se pudo verificar el servicio de Gimnasio')
    if (!tieneGimnasio) {
      motivo = 'Sin servicio'
      sinServicio = true
    }
  }

  // id_cola único: un lote reintentado no duplica (ON CONFLICT DO NOTHING).
  const { data: insertado, error: insertErr } = await supabaseAdmin
    .from('accesos')
    .upsert({
      socio_id:     row.id,
      // Semáforo de hoy (no se sabe el de la hora del escaneo).
      semaforo:     row.semaforo,
      punto,
      creado_en:    new Date(item.instante).toISOString(),
      sin_servicio: sinServicio,
      sin_conexion: true,
      id_cola,
      ...(motivo ? { denegado: true, motivo_rechazo: motivo } : {}),
    }, { onConflict: 'id_cola', ignoreDuplicates: true })
    .select('id')
  if (insertErr) throw new Error(insertErr.message)
  if ((insertado?.length ?? 0) === 0) return { id_cola, estado: 'duplicado', motivo: 'Ya estaba registrado' }

  return motivo ? { id_cola, estado: 'registrado', motivo } : { id_cola, estado: 'registrado' }
}

// ─── Panel web de Lector: historial de accesos de un rango ───────────────────
//
// `fecha` en formato YYYY-MM-DD, interpretada en horario de Argentina
// (UTC-3 fijo, sin horario de verano) — no en UTC, para que "hoy" en el
// panel coincida con el día real del club, no con el de UTC.

async function handleListarAccesos(
  body: Record<string, unknown>,
  callerRol: string
): Promise<Response> {
  const ALLOWED = ['porteria', 'canchero', 'buffet', 'secretaria', 'admin', 'subcomision']
  if (!ALLOWED.includes(callerRol)) return jsonError(403, 'Sin permiso para ver el historial de accesos')

  const rango = resolverRango(body, hoyAR())
  if ('error' in rango) return jsonError(400, rango.error)
  const { desde, hasta, inicio, fin } = rango

  const resultado = await traerTodasLasPaginas((filaDesde, filaHasta) =>
    supabaseAdmin
      .from('accesos')
      .select(`
        creado_en,
        punto,
        semaforo,
        sin_servicio,
        sin_reserva,
        denegado,
        motivo_rechazo,
        sin_conexion,
        es_invitado,
        invitado_dni,
        invitado_nombre,
        socios ( numero_socio, nombre_padron, profiles!socios_profile_id_fkey ( nombre ) )
      `)
      .gte('creado_en', inicio.toISOString())
      .lt('creado_en', fin.toISOString())
      .order('creado_en', { ascending: true })
      .order('id', { ascending: true })
      .range(filaDesde, filaHasta)
  )
  if ('error' in resultado) return jsonError(500, resultado.error)

  type AccesoRow = {
    creado_en: string
    punto: string
    semaforo: string | null
    sin_servicio: boolean
    sin_reserva: boolean
    denegado: boolean
    motivo_rechazo: string | null
    sin_conexion: boolean
    es_invitado: boolean
    invitado_dni: string | null
    invitado_nombre: string | null
    socios: { numero_socio: string; nombre_padron: string | null; profiles: { nombre: string } | null } | null
  }

  const rows = resultado.data as unknown as AccesoRow[]

  // Repeticiones de cada invitado en los 30 días que terminan al cierre del día
  // de CADA visita (no del rango: en un rango largo, una visita vieja tiene que
  // ver su propia ventana). Es lo que dispara el "Derivar a Secretaría" del panel.
  // Si la consulta falla, `veces_invitado` va null en vez de un número
  // equivocado, sin tirar abajo el listado.
  const dnisInvitados = [...new Set(rows.filter(a => a.es_invitado && a.invitado_dni).map(a => a.invitado_dni as string))]
  let vecesPorFila: (number | null)[] = rows.map(() => null)
  if (dnisInvitados.length > 0) {
    const historialDesde = new Date(inicio.getTime() - VENTANA_INVITADO_DIAS * 24 * 60 * 60 * 1000)
    // De a 100 DNIs: el `.in()` viaja en la URL y un trimestre puede tener cientos.
    const historialData: { creado_en: string; invitado_dni: string | null }[] = []
    let historialError: string | null = null
    for (const tanda of enTandas(dnisInvitados, 100)) {
      const historial = await traerTodasLasPaginas((filaDesde, filaHasta) =>
        supabaseAdmin
          .from('accesos')
          .select('creado_en, invitado_dni')
          .eq('es_invitado', true)
          .in('invitado_dni', tanda)
          .gte('creado_en', historialDesde.toISOString())
          .lt('creado_en', fin.toISOString())
          .order('creado_en', { ascending: true })
          .order('id', { ascending: true })
          .range(filaDesde, filaHasta)
      )
      if ('error' in historial) {
        historialError = historial.error
        break
      }
      historialData.push(...(historial.data as { creado_en: string; invitado_dni: string | null }[]))
    }
    if (historialError) {
      console.error('listar-accesos (veces invitado):', historialError)
    } else {
      vecesPorFila = contarVecesInvitadoPorVisita(
        rows.map(a => ({ creado_en: a.creado_en, invitado_dni: a.es_invitado ? a.invitado_dni : null })),
        historialData,
        VENTANA_INVITADO_DIAS,
      )
    }
  }

  const accesos = rows.map((a, i) => ({
    creado_en:       a.creado_en,
    punto:           a.punto,
    semaforo:        a.semaforo,
    sin_servicio:    a.sin_servicio,
    sin_reserva:     a.sin_reserva,
    denegado:        a.denegado,
    motivo_rechazo:  a.motivo_rechazo,
    sin_conexion:    a.sin_conexion,
    es_invitado:     a.es_invitado,
    invitado_dni:    a.invitado_dni,
    veces_invitado:  vecesPorFila[i],
    numero_socio:    a.es_invitado ? '—' : (a.socios?.numero_socio ?? '—'),
    nombre:          a.es_invitado ? (a.invitado_nombre ?? 'Invitado') : nombreVisible(a.socios?.nombre_padron, a.socios?.profiles?.nombre),
  }))

  return jsonOk({ fecha: desde, desde, hasta, accesos })
}
