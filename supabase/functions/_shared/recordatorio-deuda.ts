// Recordatorio mensual de deuda (push) + resolución de socios por número en lotes.
//
// Lo usan dos Edge Functions:
//   - recordatorio-deuda: cron del día 22 que manda el push a quien tenga semáforo amarillo/rojo.
//   - importar-deuda: sólo buscarSociosPorNumero (el import ya no manda push, ver historial 2026-10-07).
//
// TypeScript puro: sin globals de Deno ni imports npm:, así que lo puede importar tanto una Edge
// Function como un check con tsx (ver recordatorio-deuda.check.ts). El cliente de Supabase se
// recibe por parámetro.
//
// Por qué el día 22 (decisión de Secretaría, 2026-10-07): la cuota vence a principio de mes y el
// débito automático se cobra a mediados (las fechas cargadas en fechas_debito_automatico son todas
// <= 17). Mandar el aviso con el import del día del vencimiento le llegaba a socios que todavía
// no tenían cómo haber pagado. El día 22 el débito ya se cobró: quien sigue debiendo no pagó a
// mano o le rebotó el débito.

import { enviarPush, esTokenExpo, trocear, type FetchLike, type PushItem } from './expoPush.ts'

// Día del mes en que sale el aviso. También es el corte de la migración
// 20261010000000_deuda_debito_antes_del_22.sql (cuota del mes de un socio con débito automático
// = a vencer hasta este día). Si cambia uno, cambia el otro.
export const DIA_AVISO_DEUDA = 22
// Antigüedad máxima (en días) del último reporte NUVIX importado para mandar el aviso: mejor no
// avisar que avisar con datos viejos.
export const MAX_ANTIGUEDAD_CORTE_DIAS = 2
export const ZONA_HORARIA_CLUB = 'America/Argentina/Buenos_Aires'
// Tamaño de lote para los .in(): PostgREST arma la URL con los valores (límite de largo) y además
// nunca devuelve más de 1000 filas por request.
export const LOTE_IN = 200
export const PAGE_SIZE = 1000

// deno-lint-ignore no-explicit-any
export type Db = any

// ─── Fechas (pura) ────────────────────────────────────────────────────────────

/** Fecha calendario en Argentina ('YYYY-MM-DD') del instante dado. */
export function fechaArgentina(ahora: Date): string {
  // en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA_CLUB, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ahora)
}

/** Inicio del mes (medianoche del día 1 en Argentina, UTC-3 fijo sin horario de verano) en ISO. */
export function inicioMesArgentina(hoy: string): string {
  return `${hoy.slice(0, 7)}-01T00:00:00-03:00`
}

function diasEntre(desde: string, hasta: string): number {
  const a = Date.UTC(Number(desde.slice(0, 4)), Number(desde.slice(5, 7)) - 1, Number(desde.slice(8, 10)))
  const b = Date.UTC(Number(hasta.slice(0, 4)), Number(hasta.slice(5, 7)) - 1, Number(hasta.slice(8, 10)))
  return Math.round((b - a) / 86_400_000)
}

function formatFecha(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

/** El último reporte importado sirve si tiene MAX_ANTIGUEDAD_CORTE_DIAS días o menos. */
export function corteVigente(fechaCorte: string | null, hoy: string): boolean {
  if (!fechaCorte) return false
  return diasEntre(fechaCorte, hoy) <= MAX_ANTIGUEDAD_CORTE_DIAS
}

export type DecisionEnvio = { enviar: true } | { enviar: false; motivo: string }

/**
 * Decide si esta corrida manda el aviso. `forzar` (pruebas manuales) sólo saltea el chequeo del
 * día 22: el envío sigue siendo uno por mes y el reporte tiene que estar fresco igual.
 */
export function decidirEnvio(p: {
  hoy: string
  forzar: boolean
  ultimoCorte: string | null
  yaEnviadoEsteMes: boolean
}): DecisionEnvio {
  if (!p.forzar && Number(p.hoy.slice(8, 10)) !== DIA_AVISO_DEUDA) {
    return { enviar: false, motivo: `Hoy no es día ${DIA_AVISO_DEUDA}: el aviso de deuda sólo sale ese día.` }
  }
  if (p.yaEnviadoEsteMes) {
    return { enviar: false, motivo: 'El aviso de este mes ya se envió.' }
  }
  if (!p.ultimoCorte) {
    return { enviar: false, motivo: 'No hay ningún reporte de deuda importado.' }
  }
  if (!corteVigente(p.ultimoCorte, p.hoy)) {
    return {
      enviar: false,
      motivo: `El último reporte importado es del ${formatFecha(p.ultimoCorte)}, con más de ` +
        `${MAX_ANTIGUEDAD_CORTE_DIAS} días de antigüedad. Importá uno nuevo para que salga el aviso.`,
    }
  }
  return { enviar: true }
}

// ─── Destinatarios (pura) ─────────────────────────────────────────────────────
//
// A quien tenga semáforo amarillo/rojo. Un menor de edad nunca recibe el aviso a su propio nombre:
// la deuda se le atribuye al titular de su grupo familiar (mismo criterio que la app, ver migración
// 20260813000000_titular_ve_deuda_menores.sql). Si el menor no tiene titular resuelto, se omite.

export type ItemDeuda = { socioId: string; nombre: string; propio: boolean; mesesImpagos: number; deudaVencida: number }
export type RecordatorioDeuda = { profileId: string; nombreDestinatario: string; items: ItemDeuda[] }
export type DeudorRow = {
  id: string
  profile_id: string | null
  cabecera_id: string | null
  fecha_nacimiento: string | null
  meses_impagos: number | null
  deuda_vencida: number | string | null
  profiles: { nombre: string } | null
}
export type Titular = { profileId: string; nombre: string }

export function esMenorDeEdad(fechaNacimiento: string | null, hoy: Date): boolean {
  if (!fechaNacimiento) return false
  const hace18 = new Date(hoy)
  hace18.setFullYear(hace18.getFullYear() - 18)
  return new Date(fechaNacimiento) > hace18
}

export function agruparRecordatorios(deudores: DeudorRow[], titulares: Map<string, Titular>, hoy: Date): RecordatorioDeuda[] {
  const porDestinatario = new Map<string, RecordatorioDeuda>()

  for (const d of deudores) {
    const menor = esMenorDeEdad(d.fecha_nacimiento, hoy)
    const nombre = d.profiles?.nombre ?? 'Socio'

    let profileId: string | null
    let nombreDestinatario: string
    if (menor) {
      const titular = d.cabecera_id ? titulares.get(d.cabecera_id) : undefined
      if (!titular) continue
      profileId = titular.profileId
      nombreDestinatario = titular.nombre
    } else {
      profileId = d.profile_id
      nombreDestinatario = nombre
    }
    if (!profileId) continue

    if (!porDestinatario.has(profileId)) porDestinatario.set(profileId, { profileId, nombreDestinatario, items: [] })
    porDestinatario.get(profileId)!.items.push({
      socioId: d.id,
      nombre,
      propio: !menor,
      mesesImpagos: d.meses_impagos ?? 0,
      deudaVencida: Number(d.deuda_vencida) || 0,
    })
  }

  return [...porDestinatario.values()]
}

export function textoRecordatorio(items: ItemDeuda[]): { title: string; body: string } {
  const monto = items.reduce((acc, it) => acc + it.deudaVencida, 0)
  const periodos = items.reduce((acc, it) => acc + it.mesesImpagos, 0)
  const s = periodos === 1 ? '' : 's'
  return {
    title: 'Cuotas pendientes',
    body: `Tenés ${periodos} período${s} pendiente${s} por ` +
      `$${monto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}. Revisá el detalle en Cuotas.`,
  }
}

// ─── Consultas (paginadas / en lotes) ─────────────────────────────────────────

/** cod_cliente NUVIX → socios.id, en lotes de LOTE_IN (un solo .in() se cortaba en 1000 filas). */
export async function buscarSociosPorNumero(db: Db, codigos: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  for (const lote of trocear([...new Set(codigos)], LOTE_IN)) {
    const { data, error } = await db.from('socios').select('id, numero_socio').in('numero_socio', lote)
    if (error) throw new Error(`Error resolviendo socios: ${error.message}`)
    for (const s of data ?? []) mapa.set(s.numero_socio as string, s.id as string)
  }
  return mapa
}

export async function construirRecordatoriosDeuda(db: Db, hoy: Date): Promise<RecordatorioDeuda[]> {
  let deudores: DeudorRow[] = []
  for (let desde = 0; ; desde += PAGE_SIZE) {
    const { data, error } = await db
      .from('socios')
      .select('id, profile_id, cabecera_id, fecha_nacimiento, meses_impagos, deuda_vencida, profiles!socios_profile_id_fkey(nombre)')
      .in('estado', ['activo', 'pendiente'])
      .in('semaforo', ['amarillo', 'rojo'])
      .order('id')
      .range(desde, desde + PAGE_SIZE - 1)
    if (error) throw new Error(`Error leyendo deudores: ${error.message}`)
    deudores = deudores.concat((data ?? []) as DeudorRow[])
    if (!data || data.length < PAGE_SIZE) break
  }
  if (deudores.length === 0) return []

  const cabeceraIds = [...new Set(
    deudores.filter((d) => esMenorDeEdad(d.fecha_nacimiento, hoy) && d.cabecera_id).map((d) => d.cabecera_id as string),
  )]

  const titulares = new Map<string, Titular>()
  for (const lote of trocear(cabeceraIds, LOTE_IN)) {
    const { data, error } = await db
      .from('socios')
      .select('id, profile_id, profiles!socios_profile_id_fkey(nombre)')
      .in('id', lote)
    if (error) throw new Error(`Error leyendo titulares: ${error.message}`)
    for (const t of data ?? []) {
      if (!t.profile_id) continue
      const perfil = t.profiles as { nombre: string } | null
      titulares.set(t.id as string, { profileId: t.profile_id as string, nombre: perfil?.nombre ?? 'Titular' })
    }
  }

  return agruparRecordatorios(deudores, titulares, hoy)
}

async function tokensPorProfile(db: Db, profileIds: string[]): Promise<Map<string, string[]>> {
  const porProfile = new Map<string, string[]>()
  for (const lote of trocear(profileIds, LOTE_IN)) {
    const { data, error } = await db.from('push_tokens').select('usuario_id, token').in('usuario_id', lote)
    if (error) throw new Error(`Error leyendo push_tokens: ${error.message}`)
    for (const row of data ?? []) {
      if (!esTokenExpo(row.token)) continue
      const arr = porProfile.get(row.usuario_id as string) ?? []
      arr.push(row.token)
      porProfile.set(row.usuario_id as string, arr)
    }
  }
  return porProfile
}

export type ResumenEnvio = { destinatarios: number; enviados: number; sinToken: number; fallidos: number }

/**
 * Manda el push a cada destinatario y sella socios.recordatorio_deuda_enviado_at de los socios
 * cuyo aviso llegó a al menos un dispositivo.
 */
export async function enviarPushRecordatoriosDeuda(
  db: Db,
  recordatorios: RecordatorioDeuda[],
  opciones: { fetchImpl?: FetchLike; log?: (...args: unknown[]) => void } = {},
): Promise<ResumenEnvio> {
  const tokens = await tokensPorProfile(db, recordatorios.map((r) => r.profileId))

  const items: PushItem[] = []
  let sinToken = 0
  for (const r of recordatorios) {
    const propios = tokens.get(r.profileId) ?? []
    if (propios.length === 0) { sinToken++; continue }
    const { title, body } = textoRecordatorio(r.items)
    for (const to of propios) {
      items.push({ clave: r.profileId, msg: { to, title, body, sound: 'default', data: { type: 'recordatorio_deuda' } } })
    }
  }

  const { entregados, fallidos } = await enviarPush(items, { fetchImpl: opciones.fetchImpl, log: opciones.log })

  const socioIds = recordatorios.filter((r) => entregados.has(r.profileId)).flatMap((r) => r.items.map((it) => it.socioId))
  const ahora = new Date().toISOString()
  for (const lote of trocear(socioIds, LOTE_IN)) {
    const { error } = await db.from('socios').update({ recordatorio_deuda_enviado_at: ahora }).in('id', lote)
    if (error) (opciones.log ?? console.error)('Error sellando recordatorio_deuda_enviado_at:', error.message)
  }

  return { destinatarios: recordatorios.length, enviados: entregados.size, sinToken, fallidos }
}
