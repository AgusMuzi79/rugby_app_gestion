// El entrenador designa colaboradores de sus propias divisiones eligiendo un
// socio que ya tiene cuenta (feature odd/tasks/colaborador-por-entrenador.md).
//
// Corre con service_role: guard_profile_role_update no deja que un JWT de
// entrenador cambie roles/divisiones, y la RLS de socios no se los muestra.
// Todo el control de acceso está acá y en _shared/colaboradores.ts.
// Deploy con verificación de JWT normal (sin --no-verify-jwt).

import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { corsHeaders, jsonOk, jsonError } from '../_shared/cors.ts'
import {
  type Candidato,
  MAX_RESULTADOS_BUSQUEDA,
  autorizarCaller,
  divisionesVisibles,
  esColaboradorDe,
  esCuerpoValido,
  estadoTrasAsignar,
  estadoTrasQuitar,
  interpretarBusqueda,
  motivoNoElegible,
  verificarDivisionDelCaller,
} from '../_shared/colaboradores.ts'

interface CallerCtx { id: string; divisiones: string[] }

const PERFIL_CAMBIO = 'El perfil cambió mientras lo editabas. Volvé a intentar.'

// Escribe roles/rol/divisiones sólo si el perfil sigue como se leyó
// (updated_at lo actualiza el trigger profiles_updated_at en cada UPDATE).
// Así dos ediciones simultáneas no se pisan: la segunda recibe 409.
async function escribirPerfil(
  id: string,
  updatedAtLeido: string,
  estado: { roles: string[]; rol: string; divisiones: string[] | null },
  mensajeError: string,
): Promise<Response | null> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ roles: estado.roles, rol: estado.rol, divisiones: estado.divisiones })
    .eq('id', id)
    .eq('updated_at', updatedAtLeido)
    .select('id')
  if (error) return jsonError(500, mensajeError)
  if (!data || data.length === 0) return jsonError(409, PERFIL_CAMBIO)
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonError(401, 'Sin autorización')

  const jwt = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(jwt)
  if (authErr || !user) return jsonError(401, 'Token inválido')

  const { data: perfil, error: perfilErr } = await supabaseAdmin
    .from('profiles')
    .select('rol, activo, divisiones')
    .eq('id', user.id)
    .maybeSingle()
  if (perfilErr) return jsonError(500, 'Error leyendo tu cuenta')
  const rechazo = autorizarCaller(perfil ? { rol: perfil.rol, activo: perfil.activo } : null)
  if (rechazo) return jsonError(rechazo.status, rechazo.mensaje)

  let parsed: unknown
  try {
    parsed = await req.json()
  } catch {
    return jsonError(400, 'Body inválido')
  }
  if (!esCuerpoValido(parsed)) return jsonError(400, 'Body inválido')
  const body = parsed

  const caller: CallerCtx = { id: user.id, divisiones: (perfil!.divisiones as string[] | null) ?? [] }
  const { action } = body
  if (action === 'listar') return handleListar(body, caller)
  if (action === 'buscar') return handleBuscar(body, caller)
  if (action === 'asignar') return handleAsignar(body, caller)
  if (action === 'quitar') return handleQuitar(body, caller)
  return jsonError(400, 'Acción desconocida')
})

// Nombre del padrón (el del carnet) por profile_id.
async function nombresPadron(profileIds: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  if (profileIds.length === 0) return mapa
  const { data } = await supabaseAdmin
    .from('socios')
    .select('profile_id, nombre_padron')
    .in('profile_id', profileIds)
  for (const s of data ?? []) {
    if (s.nombre_padron) mapa.set(s.profile_id as string, s.nombre_padron as string)
  }
  return mapa
}

// ─── Listar ───────────────────────────────────────────────────────────────────

async function handleListar(body: Record<string, unknown>, caller: CallerCtx): Promise<Response> {
  let divisiones = caller.divisiones
  if (body.divisionIds !== undefined) {
    if (!Array.isArray(body.divisionIds)) return jsonError(400, 'divisionIds inválido')
    for (const d of body.divisionIds) {
      const r = verificarDivisionDelCaller(d, caller.divisiones)
      if (r) return jsonError(r.status, r.mensaje)
    }
    divisiones = body.divisionIds as string[]
  }
  if (divisiones.length === 0) return jsonOk({ colaboradores: [] })

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, nombre, divisiones')
    .eq('activo', true)
    .contains('roles', ['colaborador'])
    .overlaps('divisiones', divisiones)
  if (error) return jsonError(500, 'Error leyendo los colaboradores')

  const padron = await nombresPadron((data ?? []).map((p) => p.id as string))
  const colaboradores = (data ?? [])
    .map((p) => ({
      profileId: p.id as string,
      nombre: padron.get(p.id as string) ?? (p.nombre as string),
      divisionIds: divisionesVisibles(p.divisiones as string[] | null, divisiones),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  return jsonOk({ colaboradores })
}

// ─── Buscar ───────────────────────────────────────────────────────────────────

async function handleBuscar(body: Record<string, unknown>, caller: CallerCtx): Promise<Response> {
  const r = verificarDivisionDelCaller(body.divisionId, caller.divisiones)
  if (r) return jsonError(r.status, r.mensaje)
  const divisionId = body.divisionId as string

  const busqueda = interpretarBusqueda(body.q)
  if (busqueda.tipo === 'error') return jsonError(400, busqueda.mensaje)

  let profileIds: string[]
  if (busqueda.tipo === 'dni') {
    const { data, error } = await supabaseAdmin
      .from('socios').select('profile_id').eq('dni', busqueda.dni).not('profile_id', 'is', null)
    if (error) return jsonError(500, 'Error en la búsqueda')
    profileIds = (data ?? []).map((s) => s.profile_id as string)
  } else {
    // Misma búsqueda que Usuarios (sin tildes, palabras en cualquier orden).
    // Con service_role pasa la RLS de socios; devuelve como mucho 10 filas.
    const { data, error } = await supabaseAdmin.rpc('buscar_socios_por_nombre', { q: busqueda.q })
    if (error) return jsonError(500, 'Error en la búsqueda')
    const socioIds = ((data ?? []) as { id: string }[]).map((s) => s.id)
    if (socioIds.length === 0) return jsonOk({ resultados: [] })
    const { data: socios, error: sErr } = await supabaseAdmin
      .from('socios').select('profile_id').in('id', socioIds).not('profile_id', 'is', null)
    if (sErr) return jsonError(500, 'Error en la búsqueda')
    profileIds = (socios ?? []).map((s) => s.profile_id as string)
  }
  profileIds = [...new Set(profileIds)].slice(0, MAX_RESULTADOS_BUSQUEDA)
  if (profileIds.length === 0) return jsonOk({ resultados: [] })

  const candidatos = await cargarCandidatos(profileIds)
  if (candidatos instanceof Response) return candidatos

  const hoy = new Date()
  const resultados = candidatos
    .filter((c) => c.candidato.activo)
    .map((c) => {
      const motivo = motivoNoElegible(caller.id, c.candidato, hoy)
      return {
        profileId: c.candidato.id,
        nombre: c.nombre,
        yaEsColaborador: esColaboradorDe(c.candidato, divisionId),
        elegible: motivo === null,
        ...(motivo ? { motivo } : {}),
      }
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  return jsonOk({ resultados })
}

// Perfil + fila de socio de cada profileId. No devuelve DNI ni mail.
async function cargarCandidatos(
  profileIds: string[],
): Promise<{ candidato: Candidato; nombre: string; updatedAt: string }[] | Response> {
  const [profilesRes, sociosRes] = await Promise.all([
    supabaseAdmin.from('profiles').select('id, nombre, rol, roles, divisiones, activo, updated_at').in('id', profileIds),
    supabaseAdmin.from('socios').select('profile_id, nombre_padron, fecha_nacimiento').in('profile_id', profileIds),
  ])
  if (profilesRes.error || sociosRes.error) return jsonError(500, 'Error leyendo las cuentas')
  const socios = new Map((sociosRes.data ?? []).map((s) => [s.profile_id as string, s]))
  return (profilesRes.data ?? []).map((p) => {
    const socio = socios.get(p.id as string)
    return {
      candidato: {
        id: p.id as string,
        activo: p.activo as boolean,
        rol: p.rol as string | null,
        roles: p.roles as string[] | null,
        divisiones: p.divisiones as string[] | null,
        fechaNacimiento: (socio?.fecha_nacimiento as string | null) ?? null,
        tieneSocio: !!socio,
      },
      nombre: (socio?.nombre_padron as string | null) ?? (p.nombre as string),
      updatedAt: p.updated_at as string,
    }
  })
}

async function cargarCandidato(
  body: Record<string, unknown>,
  caller: CallerCtx,
): Promise<{ candidato: Candidato; nombre: string; updatedAt: string; divisionId: string } | Response> {
  const r = verificarDivisionDelCaller(body.divisionId, caller.divisiones)
  if (r) return jsonError(r.status, r.mensaje)
  const profileId = body.profileId
  if (typeof profileId !== 'string' || !profileId) return jsonError(400, 'Falta la persona')

  const encontrados = await cargarCandidatos([profileId])
  if (encontrados instanceof Response) return encontrados
  if (encontrados.length === 0) return jsonError(404, 'Usuario no encontrado')
  return { ...encontrados[0], divisionId: body.divisionId as string }
}

// ─── Asignar ──────────────────────────────────────────────────────────────────

async function handleAsignar(body: Record<string, unknown>, caller: CallerCtx): Promise<Response> {
  const cargado = await cargarCandidato(body, caller)
  if (cargado instanceof Response) return cargado
  const { candidato, nombre, updatedAt, divisionId } = cargado

  const motivo = motivoNoElegible(caller.id, candidato, new Date())
  if (motivo) return jsonError(403, motivo)

  const estado = estadoTrasAsignar(candidato, divisionId)
  if (estado.cambia) {
    const fallo = await escribirPerfil(candidato.id, updatedAt, estado, 'No se pudo designar al colaborador')
    if (fallo) return fallo
  }
  return jsonOk({ ok: true, profileId: candidato.id, nombre, yaEstaba: !estado.cambia })
}

// ─── Quitar ───────────────────────────────────────────────────────────────────

async function handleQuitar(body: Record<string, unknown>, caller: CallerCtx): Promise<Response> {
  const cargado = await cargarCandidato(body, caller)
  if (cargado instanceof Response) return cargado
  const { candidato, updatedAt, divisionId } = cargado

  if (candidato.id === caller.id) return jsonError(403, 'No podés quitarte a vos mismo')
  const estado = estadoTrasQuitar(candidato, divisionId)
  if ('status' in estado) return jsonError(estado.status, estado.mensaje)

  const fallo = await escribirPerfil(candidato.id, updatedAt, estado, 'No se pudo quitar al colaborador')
  if (fallo) return fallo
  return jsonOk({ ok: true, profileId: candidato.id })
}
