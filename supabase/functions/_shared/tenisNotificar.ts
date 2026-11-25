// Lectura de reservas y avisos (push a socios, mail a invitados) compartidos por tenis-gestion y
// tenis-cron. Toca la base (service role); las reglas puras están en tenisReglas.ts.

import { supabaseAdmin } from './supabase-admin.ts'
import { enviarEmail, emailTemplate } from './email.ts'
import { enviarPush, esTokenExpo, trocear, type PushItem } from './expoPush.ts'
import { tutoresPorSocio } from './tutores.ts'
import { clavePush, configDesdeFila, type EstadoPush, type TenisConfig } from './tenisReglas.ts'

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
async function profilesPorSocio(socioIds: string[]): Promise<Map<string, string[]>> {
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
  const estados = new Map<string, EstadoPush>()
  if (!avisos.length) return estados
  const perfiles = await profilesPorSocio([...new Set(avisos.map((a) => a.socioId))])
  const tokens = await tokensPorProfile([...new Set([...perfiles.values()].flat())])
  const items: PushItem[] = []
  for (const a of avisos) {
    const clave = clavePush(a)
    if (!estados.has(clave)) estados.set(clave, 'sin_dispositivo')
    for (const profileId of perfiles.get(a.socioId) ?? []) {
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
