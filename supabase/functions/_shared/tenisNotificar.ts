// Lectura de reservas y avisos (push a socios, mail a invitados) compartidos por tenis-gestion y
// tenis-cron. Toca la base (service role); las reglas puras están en tenisReglas.ts.

import { supabaseAdmin } from './supabase-admin.ts'
import { enviarEmail, emailTemplate } from './email.ts'
import { enviarPush, esTokenExpo, trocear, type PushItem } from './expoPush.ts'
import { tutoresPorSocio } from './tutores.ts'
import {
  clavePush,
  configDesdeFila,
  mailDestino,
  parsearHorarios,
  type EstadoPush,
  type HorarioSemana,
  type TenisConfig,
} from './tenisReglas.ts'

export { clavePush, type EstadoPush }

const LOTE_IN = 100

export interface JugadorReserva {
  socio_id: string | null
  invitado_id: string | null
  es_titular: boolean
  cargo: number
}

export interface ReservaAviso {
  id: string
  cancha: string | null
  inicio: Date
  fin: Date
  modalidad: string
  estado: string
  origen: string
  titular_socio_id: string | null
  titular_invitado_id: string | null
  comprobante_estado: string | null
  comprobante_motivo: string | null
  comprobante_vence_at: string | null
  jugadores: JugadorReserva[]
}

export interface Invitado {
  id: string
  email: string | null
  nombre: string | null
  apellido: string | null
}

export async function cargarConfig(): Promise<TenisConfig> {
  const { data, error } = await supabaseAdmin.from('tenis_config').select('*').maybeSingle()
  if (error) console.error('tenis: no se pudo leer tenis_config, uso los defaults:', error.message)
  return configDesdeFila(data)
}

/**
 * Horario por día de semana (tenis_horarios). Si no se puede leer, lista vacía: cada día usa el
 * horario de tenis_config (horarioDelDia) y la base vuelve a validar el turno igual.
 */
export async function cargarHorarios(): Promise<HorarioSemana[]> {
  const { data, error } = await supabaseAdmin.from('tenis_horarios').select('dia_semana, hora_desde, hora_hasta, activo')
  if (error) {
    console.error('tenis: no se pudo leer tenis_horarios, uso el horario de tenis_config:', error.message)
    return []
  }
  return parsearHorarios(data)
}

/** Reservas con su cancha y sus jugadores (sin embeds: no depende de cómo se llamen las FKs). */
export async function cargarReservas(ids: string[]): Promise<ReservaAviso[]> {
  const unicos = [...new Set(ids)]
  if (!unicos.length) return []

  const { data: canchas, error: errCanchas } = await supabaseAdmin.from('tenis_canchas').select('id, nombre')
  if (errCanchas) throw new Error(`Error leyendo tenis_canchas: ${errCanchas.message}`)
  const nombreCancha = new Map((canchas ?? []).map((c) => [c.id as string, c.nombre as string]))

  const out: ReservaAviso[] = []
  for (const lote of trocear(unicos, LOTE_IN)) {
    const { data: reservas, error } = await supabaseAdmin
      .from('tenis_reservas')
      .select('id, cancha_id, inicio, fin, modalidad, estado, origen, titular_socio_id, titular_invitado_id, comprobante_estado, comprobante_motivo, comprobante_vence_at')
      .in('id', lote)
    if (error) throw new Error(`Error leyendo tenis_reservas: ${error.message}`)

    const { data: jugadores, error: errJug } = await supabaseAdmin
      .from('tenis_reserva_jugadores')
      .select('reserva_id, socio_id, invitado_id, es_titular, cargo')
      .in('reserva_id', lote)
    if (errJug) throw new Error(`Error leyendo tenis_reserva_jugadores: ${errJug.message}`)

    for (const r of reservas ?? []) {
      out.push({
        id: r.id as string,
        cancha: nombreCancha.get(r.cancha_id as string) ?? null,
        inicio: new Date(r.inicio as string),
        fin: new Date(r.fin as string),
        modalidad: r.modalidad as string,
        estado: r.estado as string,
        origen: r.origen as string,
        titular_socio_id: (r.titular_socio_id as string | null) ?? null,
        titular_invitado_id: (r.titular_invitado_id as string | null) ?? null,
        comprobante_estado: (r.comprobante_estado as string | null) ?? null,
        comprobante_motivo: (r.comprobante_motivo as string | null) ?? null,
        comprobante_vence_at: (r.comprobante_vence_at as string | null) ?? null,
        jugadores: (jugadores ?? [])
          .filter((j) => j.reserva_id === r.id)
          .map((j) => ({
            socio_id: (j.socio_id as string | null) ?? null,
            invitado_id: (j.invitado_id as string | null) ?? null,
            es_titular: j.es_titular === true,
            cargo: Number(j.cargo ?? 0),
          })),
      })
    }
  }
  return out
}

export async function cargarInvitados(ids: string[]): Promise<Map<string, Invitado>> {
  const mapa = new Map<string, Invitado>()
  for (const lote of trocear([...new Set(ids.filter(Boolean))], LOTE_IN)) {
    const { data, error } = await supabaseAdmin.from('tenis_invitados').select('id, email, nombre, apellido').in('id', lote)
    if (error) {
      console.error('tenis: error leyendo tenis_invitados:', error.message)
      continue
    }
    for (const i of data ?? []) mapa.set(i.id as string, i as Invitado)
  }
  return mapa
}

/** socio_id -> profiles que reciben por él: su cuenta y las de sus tutores activos. */
export async function profilesPorSocio(socioIds: string[]): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>()
  const agregar = (socioId: string, profileId: string) => {
    const lista = mapa.get(socioId) ?? []
    if (!lista.includes(profileId)) lista.push(profileId)
    mapa.set(socioId, lista)
  }
  for (const lote of trocear(socioIds, LOTE_IN)) {
    const { data, error } = await supabaseAdmin.from('socios').select('id, profile_id').in('id', lote)
    if (error) {
      console.error('tenis: error leyendo socios:', error.message)
      continue
    }
    for (const s of data ?? []) if (s.profile_id) agregar(s.id as string, s.profile_id as string)
  }
  for (const [socioId, tutores] of await tutoresPorSocio(socioIds)) for (const t of tutores) agregar(socioId, t)
  return mapa
}

async function tokensPorProfile(profileIds: string[]): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>()
  for (const lote of trocear(profileIds, LOTE_IN)) {
    const { data, error } = await supabaseAdmin.from('push_tokens').select('usuario_id, token').in('usuario_id', lote)
    if (error) {
      console.error('tenis: error leyendo push_tokens:', error.message)
      continue
    }
    for (const r of data ?? []) {
      const id = r.usuario_id as string
      mapa.set(id, [...(mapa.get(id) ?? []), r.token as string])
    }
  }
  return mapa
}

export interface AvisoPush {
  /** Identifica el aviso (p. ej. `<reserva_id>:cancelada`); se combina con el socio. */
  clave: string
  socioId: string
  title: string
  body: string
  data?: Record<string, unknown>
}

/**
 * Manda los avisos a cada socio y a sus tutores y devuelve el estado de cada uno (por clavePush):
 * 'entregado' si llegó a algún teléfono, 'sin_dispositivo' si ni el socio ni sus tutores tienen un
 * token de Expo, 'error' si había teléfono pero Expo no lo entregó.
 */
export async function pushASociosDetalle(avisos: AvisoPush[]): Promise<Map<string, EstadoPush>> {
  if (!avisos.length) return new Map()
  const perfiles = await profilesPorSocio([...new Set(avisos.map((a) => a.socioId))])
  return await pushPorPerfiles(avisos.map((a) => ({ clave: clavePush(a), aviso: a, perfiles: perfiles.get(a.socioId) ?? [] })))
}

export interface AvisoPushPerfil {
  /** Identifica el aviso (p. ej. el id de la fila de la outbox); se combina con el perfil. */
  clave: string
  profileId: string
  title: string
  body: string
  data?: Record<string, unknown>
}

/**
 * Igual que pushASociosDetalle, pero cada aviso va a un perfil (sin tutores). Estados por
 * clavePush({ clave, socioId: profileId }).
 */
export async function pushAPerfilesDetalle(avisos: AvisoPushPerfil[]): Promise<Map<string, EstadoPush>> {
  return await pushPorPerfiles(avisos.map((a) => ({
    clave: clavePush({ clave: a.clave, socioId: a.profileId }),
    aviso: a,
    perfiles: [a.profileId],
  })))
}

/** Manda cada aviso a los teléfonos de sus perfiles y devuelve el estado por clave. */
async function pushPorPerfiles(
  envios: { clave: string; aviso: { title: string; body: string; data?: Record<string, unknown> }; perfiles: string[] }[],
): Promise<Map<string, EstadoPush>> {
  const estados = new Map<string, EstadoPush>()
  if (!envios.length) return estados
  const tokens = await tokensPorProfile([...new Set(envios.flatMap((e) => e.perfiles))])
  const items: PushItem[] = []
  for (const { clave, aviso: a, perfiles } of envios) {
    if (!estados.has(clave)) estados.set(clave, 'sin_dispositivo')
    for (const profileId of perfiles) {
      for (const to of tokens.get(profileId) ?? []) {
        if (!esTokenExpo(to)) continue
        estados.set(clave, 'error')
        items.push({ clave, msg: { to, title: a.title, body: a.body, data: a.data, sound: 'default' } })
      }
    }
  }
  if (!items.length) return estados
  const { entregados } = await enviarPush(items)
  for (const clave of entregados) estados.set(clave, 'entregado')
  return estados
}

/** Manda los avisos a cada socio y a sus tutores. Devuelve cuántos (aviso, socio) llegaron a algún teléfono. */
export async function pushASocios(avisos: AvisoPush[]): Promise<{ entregados: number; fallidos: number }> {
  let entregados = 0
  let fallidos = 0
  for (const estado of (await pushASociosDetalle(avisos)).values()) {
    if (estado === 'entregado') entregados++
    else if (estado === 'error') fallidos++
  }
  return { entregados, fallidos }
}

/** Mail simple con la plantilla del club. false si no se pudo mandar (o no hay mail). */
export async function mailAInvitado(invitado: Invitado | undefined, subject: string, cuerpoHtml: string): Promise<boolean> {
  if (!invitado?.email) return false
  return await enviarEmail({ to: invitado.email, subject, html: emailTemplate(cuerpoHtml) })
}

const LECTURAS_AUTH_EN_PARALELO = 5

/** Mails reales (sin vacíos ni sintéticos) de esas cuentas, sin repetir. Lee auth.users con la service role. */
export async function mailsDeProfiles(profileIds: string[]): Promise<string[]> {
  const unicos = [...new Set(profileIds.filter(Boolean))]
  const mails = new Set<string>()
  for (const lote of trocear(unicos, LECTURAS_AUTH_EN_PARALELO)) {
    const usuarios = await Promise.all(lote.map(async (id) => {
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(id)
      if (error) console.error('tenis: error leyendo el mail de una cuenta:', error.message)
      return data?.user?.email ?? null
    }))
    for (const email of usuarios) {
      const destino = mailDestino(email)
      if (destino) mails.add(destino)
    }
  }
  return [...mails]
}

const RESEND_BATCH_API = 'https://api.resend.com/emails/batch'
const RESEND_BATCH_MAX = 100
const PAUSA_ENTRE_LOTES_MS = 600

/**
 * El mismo mail a muchas direcciones, un mensaje por destinatario (nadie ve a los demás), con la
 * API de lotes de Resend (100 por pedido) para no pasar el límite de pedidos por segundo ni el
 * tiempo de la función. Mismos secrets que enviarEmail; si faltan, no manda nada.
 * Devuelve cuántos aceptó Resend.
 */
export async function enviarMailsEnLote(destinos: string[], subject: string, cuerpoHtml: string): Promise<{ enviados: number; fallidos: number }> {
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('CLUB_EMAIL_FROM')
  if (!destinos.length) return { enviados: 0, fallidos: 0 }
  if (!resendKey || !from) {
    console.error('tenis: faltan RESEND_API_KEY o CLUB_EMAIL_FROM, no se mandan mails')
    return { enviados: 0, fallidos: destinos.length }
  }
  const html = emailTemplate(cuerpoHtml)
  let enviados = 0
  let fallidos = 0
  const lotes = trocear(destinos, RESEND_BATCH_MAX)
  for (const [i, lote] of lotes.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, PAUSA_ENTRE_LOTES_MS))
    try {
      const res = await fetch(RESEND_BATCH_API, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(lote.map((to) => ({ from, to: [to], subject, html }))),
      })
      if (res.ok) enviados += lote.length
      else {
        fallidos += lote.length
        console.error('tenis: Resend (lote) respondió con error:', res.status, await res.text())
      }
    } catch (e) {
      fallidos += lote.length
      console.error('tenis: error mandando un lote de mails:', e instanceof Error ? e.message : String(e))
    }
  }
  return { enviados, fallidos }
}
