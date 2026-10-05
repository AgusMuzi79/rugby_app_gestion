// Envío de push por la API de Expo + textos de los avisos de turnos fijos.
//
// TypeScript puro: sólo `fetch` (inyectable) y `AbortSignal.timeout`; sin globals de Deno ni
// acceso a la base, así que lo puede importar tanto una Edge Function como un check con tsx
// (ver expoPush.check.ts). Quien llama arma los mensajes y las claves de entrega.
//
// Entrega: Expo responde 200 aunque algunos tickets fallen (p. ej. DeviceNotRegistered). `data` es
// un array de tickets en el mismo orden que los mensajes enviados. Una `clave` (p. ej. un aviso
// concreto de un socio) cuenta como entregada si AL MENOS UN ticket de sus mensajes viene `ok`.
// Un chunk con error de red, timeout, status no 2xx o body malformado queda como NO entregado.

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
export const EXPO_PUSH_CHUNK_SIZE = 100
// Tope por chunk: si Expo se cuelga no debe llevarse puesta la respuesta de la función.
export const EXPO_PUSH_TIMEOUT_MS = 8000

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface PushMessage {
  to: string
  title: string
  body: string
  data?: Record<string, unknown>
  sound?: string
}

export interface PushItem {
  /** Identifica la notificación (no el dispositivo): varios items pueden compartir clave. */
  clave: string
  msg: PushMessage
}

export interface ResultadoPush {
  /** Claves con al menos un ticket `ok`. */
  entregados: Set<string>
  /** Claves distintas con mensajes que no se entregaron en ningún dispositivo. */
  fallidos: number
}

export interface OpcionesPush {
  fetchImpl?: FetchLike
  timeoutMs?: number
  chunkSize?: number
  log?: (...args: unknown[]) => void
}

export function esTokenExpo(token: unknown): token is string {
  return typeof token === 'string' &&
    (token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken['))
}

export function trocear<T>(items: T[], tamano: number): T[][] {
  if (!Number.isInteger(tamano) || tamano < 1) throw new Error('tamaño de chunk inválido')
  const out: T[][] = []
  for (let i = 0; i < items.length; i += tamano) out.push(items.slice(i, i + tamano))
  return out
}

/**
 * Interpreta la respuesta de Expo: un booleano por mensaje (true = ticket `ok`). Devuelve null si
 * el body no es `{ data: [...] }` con exactamente `esperados` tickets: en ese caso no se puede saber
 * qué se entregó y el chunk entero se trata como no entregado.
 */
export function parsearTickets(json: unknown, esperados: number): boolean[] | null {
  if (json === null || typeof json !== 'object') return null
  const data = (json as { data?: unknown }).data
  if (!Array.isArray(data) || data.length !== esperados) return null
  return data.map((t) => (t as { status?: unknown } | null)?.status === 'ok')
}

export async function enviarPush(items: PushItem[], opciones: OpcionesPush = {}): Promise<ResultadoPush> {
  const fetchImpl: FetchLike = opciones.fetchImpl ?? ((input, init) => fetch(input, init))
  const timeoutMs = opciones.timeoutMs ?? EXPO_PUSH_TIMEOUT_MS
  const log = opciones.log ?? ((...args: unknown[]) => console.error(...args))

  const claves = new Set(items.map((i) => i.clave))
  // Filtro de prefijo: lo que no parece un token de Expo no se manda (Expo lo rechazaría).
  const enviables = items.filter((i) => esTokenExpo(i.msg.to))
  const entregados = new Set<string>()

  for (const chunk of trocear(enviables, opciones.chunkSize ?? EXPO_PUSH_CHUNK_SIZE)) {
    try {
      const res = await fetchImpl(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Accept-Encoding': 'gzip, deflate' },
        body: JSON.stringify(chunk.map((c) => c.msg)),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) {
        log('expoPush: Expo respondió', res.status, await res.text().catch(() => ''))
        continue
      }
      const json = await res.json().catch(() => null)
      const resultado = parsearTickets(json, chunk.length)
      if (resultado === null) {
        log('expoPush: respuesta con formato inesperado, chunk tratado como no entregado')
        continue
      }
      resultado.forEach((ok, idx) => {
        if (ok) entregados.add(chunk[idx].clave)
        else log('expoPush: ticket con error:', JSON.stringify((json as { data: unknown[] }).data[idx]))
      })
    } catch (e) {
      log('expoPush: error enviando chunk (timeout o red):', e)
    }
  }

  let fallidos = 0
  for (const c of claves) if (!entregados.has(c)) fallidos++
  return { entregados, fallidos }
}

// ─── Textos de los avisos de turnos fijos ─────────────────────────────────────

// Índice = día ISO - 1 (1 = lunes … 7 = domingo). Plural: "los lunes", "los sábados".
const DIAS_PLURAL = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos']

/** 'HH:MM:SS' (como llega de Postgres) o 'HH:MM' -> 'HH:MM'. */
export function hhmm(hora: string): string {
  return hora.slice(0, 5)
}

export interface DatosFranjaFalta {
  dia_semana: number
  hora_desde: string
  hora_hasta: string
  /** Faltas consecutivas al momento del evento. */
  racha: number
  /** Faltas en las que se libera el horario (config); sólo lo usa el aviso. */
  faltas_baja?: number
}

function descripcionFranja(d: DatosFranjaFalta): string {
  const dia = DIAS_PLURAL[d.dia_semana - 1] ?? 'días'
  return `los ${dia} ${hhmm(d.hora_desde)}–${hhmm(d.hora_hasta)}`
}

export function mensajeAviso(d: DatosFranjaFalta, to: string, franjaId?: string): PushMessage {
  const turnos = d.racha === 1 ? 'tu último turno' : `tus últimos ${d.racha} turnos`
  const restantes = Math.max(1, (d.faltas_baja ?? d.racha + 1) - d.racha)
  const vez = restantes === 1 ? 'una vez más' : `${restantes} veces más`
  return {
    to,
    title: 'Gimnasio: tu turno',
    body: `Faltaste a ${turnos} de ${descripcionFranja(d)}. Si faltás ${vez}, se libera ese horario.`,
    data: { type: 'gimnasio_turno_aviso', franja_id: franjaId ?? null },
    sound: 'default',
  }
}

export function mensajeBaja(d: DatosFranjaFalta, to: string, franjaId?: string): PushMessage {
  return {
    to,
    title: 'Gimnasio: se liberó tu horario',
    body: `Faltaste ${d.racha} veces seguidas a ${descripcionFranja(d)}, así que liberamos ese horario. ` +
      'Podés volver a reservarlo cuando quieras.',
    data: { type: 'gimnasio_turno_baja', franja_id: franjaId ?? null },
    sound: 'default',
  }
}
