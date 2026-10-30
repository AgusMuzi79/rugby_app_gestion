// Drenado de la cola offline (lib/offlineQueue.ts).
//
// La asistencia que se guardaba sin señal se encolaba y la pantalla decía
// "registrada", pero nadie leía la cola: nunca llegaba a la base. Esto la
// manda cuando vuelve la red (lo dispara hooks/useSincronizacionOffline.ts).
// Lógica pura con la base inyectada (offlineSync.check.ts).

import type { ItemCola } from './offlineQueue'
import type { MarcaGuardada } from './ausenciasConsecutivas'

export interface FilaAsistencia {
  evento_id:      string
  jugador_id:     string
  division_id:    string
  estado:         string
  registrado_por: string
}

// Lo que la sincronización necesita de la base. Cada método tira si falla.
export interface PuertoSync {
  buscarEntrenamiento(divisionId: string, fecha: string): Promise<string | null>
  crearEntrenamiento(divisionId: string, fecha: string, creadoPor: string): Promise<string>
  upsertAsistencias(filas: FilaAsistencia[]): Promise<void>
  // Igual que el guardado online de un entrenamiento: alerta de 4 faltas
  // (sólo al cruzar el tope, ver ausenciasConsecutivas.ts). Si falla, la
  // asistencia igual cuenta como enviada.
  alSincronizarEntrenamiento?(divisionId: string, eventoId: string, marcas: MarcaGuardada[]): Promise<void>
}

// `definitivo`: el servidor ya contestó que el ítem no se puede usar (no existe
// el socio, hora fuera de ventana): pasa a no enviadas sin reintentar.
export interface Fallido { id: string; error: string; red: boolean; definitivo?: boolean }

export interface ResultadoSync {
  enviados: string[]   // ids a sacar de la cola
  fallidos: Fallido[]  // ver particionarFallidos
  omitidos: string[]   // quedan en la cola sin intentar (lesiones ocultas)
}

// Fallas permanentes (RLS, jugador borrado, payload roto) toleradas antes de
// sacar el ítem de la cola: si no, se reintentaba para siempre y la pantalla
// quedaba en "pendiente" sin salida.
export const MAX_INTENTOS = 5

// Las fallas de red se reintentan siempre (sin sumar); las permanentes suman
// un intento y al llegar al tope pasan a la lista de no enviadas.
export function particionarFallidos(
  items: ItemCola[],
  fallidos: Fallido[],
): { reintentar: ItemCola[]; descartar: ItemCola[] } {
  const porId = new Map(items.map(i => [i.id, i]))
  const reintentar: ItemCola[] = []
  const descartar: ItemCola[] = []
  for (const f of fallidos) {
    const item = porId.get(f.id)
    if (!item) continue
    if (f.red) { reintentar.push(item); continue }
    const intentos = (item.intentos ?? 0) + 1
    if (f.definitivo || intentos >= MAX_INTENTOS) descartar.push({ ...item, intentos, ultimoError: f.error })
    else reintentar.push({ ...item, intentos, ultimoError: f.error })
  }
  return { reintentar, descartar }
}

interface PayloadAsistencia {
  evento_id?:     string
  // Entrenamiento elegido en pantalla (doble turno): trae su evento_id pero
  // igual corre la alerta de 4 faltas, como el que se resuelve por fecha.
  entrenamiento?: boolean
  division_id:    string
  fecha?:         string
  registrado_por: string
  // estado_previo: lo que había guardado al encolar (ítems viejos no lo traen).
  jugadores:      { jugador_id: string; estado: string; estado_previo?: string | null }[]
}

function leerPayload(p: Record<string, unknown>): PayloadAsistencia {
  const jugadores = p.jugadores
  if (typeof p.division_id !== 'string' || typeof p.registrado_por !== 'string' || !Array.isArray(jugadores)) {
    throw new Error('payload de asistencia inválido')
  }
  if (typeof p.evento_id !== 'string' && typeof p.fecha !== 'string') {
    throw new Error('payload de asistencia sin evento ni fecha')
  }
  return p as unknown as PayloadAsistencia
}

async function enviarAsistencia(item: ItemCola, db: PuertoSync): Promise<void> {
  const p = leerPayload(item.payload)
  // Partido o entrenamiento elegido: trae su evento. Entrenamiento sin evento
  // (no había ninguno hoy al abrir): el primero del día de esa división, o se crea.
  let eventoId = p.evento_id
  if (!eventoId) {
    eventoId = (await db.buscarEntrenamiento(p.division_id, p.fecha!))
      ?? (await db.crearEntrenamiento(p.division_id, p.fecha!, p.registrado_por))
  }
  if (p.jugadores.length === 0) return
  await db.upsertAsistencias(p.jugadores.map(j => ({
    evento_id:      eventoId!,
    jugador_id:     j.jugador_id,
    division_id:    p.division_id,
    estado:         j.estado,
    registrado_por: p.registrado_por,
  })))
  if ((!p.evento_id || p.entrenamiento === true) && db.alSincronizarEntrenamiento) {
    try {
      await db.alSincronizarEntrenamiento(p.division_id, eventoId, p.jugadores.map(j => ({
        jugador_id:   j.jugador_id,
        estado:       j.estado,
        estadoPrevio: j.estado_previo ?? null,
      })))
    } catch {
      // La asistencia ya está en la base; la alerta no la devuelve a la cola.
    }
  }
}

export async function sincronizarItems(items: ItemCola[], db: PuertoSync): Promise<ResultadoSync> {
  const r: ResultadoSync = { enviados: [], fallidos: [], omitidos: [] }
  for (const item of items) {
    // El módulo de lesiones está oculto (FEATURES.lesiones): sus ítems se
    // conservan en la cola, no se mandan ni se borran.
    if (item.tipo !== 'asistencia') { r.omitidos.push(item.id); continue }
    try {
      await enviarAsistencia(item, db)
      r.enviados.push(item.id)
    } catch (e) {
      r.fallidos.push({ id: item.id, error: e instanceof Error ? e.message : String(e), red: esErrorDeRed(e) })
    }
  }
  return r
}

// ─── Escaneos de la puerta sin conexión (portería T4) ─────────────────────────
//
// Sin red la tablet deja pasar y encola el escaneo crudo (tipo 'acceso'): el QR
// "{numero_socio}:{código}" (también el código tipeado a mano) o el DNI, con la
// hora del escaneo. Al volver la red se manda a socios-qr (registrar-offline),
// que lo valida a posteriori. El id del ítem viaja como `id_cola`: el servidor
// no duplica un lote reintentado.

export interface EscaneoOffline {
  id_cola:      string
  escaneado_en: string
  tipo:         'qr' | 'dni'
  qr?:          string
  dni?:         string
}

export interface ResultadoAccesoOffline {
  id_cola: string | null
  estado:  string // registrado | duplicado | invalido | no_encontrado | error
  motivo?: string
}

export interface PuertoAccesos {
  // Tira si la llamada entera falla (red, sesión, servidor).
  registrarAccesosOffline(lote: EscaneoOffline[]): Promise<ResultadoAccesoOffline[]>
}

// Mismo tope que acepta socios-qr por llamada (MAX_LOTE_OFFLINE).
export const LOTE_ACCESOS_OFFLINE = 50

export function escaneoDesdeItem(item: ItemCola): EscaneoOffline | null {
  const p = item.payload
  if (typeof p.escaneado_en !== 'string') return null
  if (p.tipo === 'qr' && typeof p.qr === 'string') return { id_cola: item.id, escaneado_en: p.escaneado_en, tipo: 'qr', qr: p.qr }
  if (p.tipo === 'dni' && typeof p.dni === 'string') return { id_cola: item.id, escaneado_en: p.escaneado_en, tipo: 'dni', dni: p.dni }
  return null
}

const ENVIADO = new Set(['registrado', 'duplicado'])
const DEFINITIVO = new Set(['invalido', 'no_encontrado'])

export async function sincronizarAccesosOffline(items: ItemCola[], puerto: PuertoAccesos): Promise<ResultadoSync> {
  const r: ResultadoSync = { enviados: [], fallidos: [], omitidos: [] }
  const validos: EscaneoOffline[] = []
  for (const item of items) {
    if (item.tipo !== 'acceso') { r.omitidos.push(item.id); continue }
    const e = escaneoDesdeItem(item)
    if (e) validos.push(e)
    else r.fallidos.push({ id: item.id, error: 'escaneo encolado inválido', red: false, definitivo: true })
  }

  for (let i = 0; i < validos.length; i += LOTE_ACCESOS_OFFLINE) {
    const tanda = validos.slice(i, i + LOTE_ACCESOS_OFFLINE)
    let resultados: ResultadoAccesoOffline[]
    try {
      resultados = await puerto.registrarAccesosOffline(tanda)
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      const red = esErrorDeRed(e)
      for (const t of tanda) r.fallidos.push({ id: t.id_cola, error, red })
      continue
    }
    const porId = new Map(resultados.map(x => [x.id_cola, x]))
    for (const t of tanda) {
      const res = porId.get(t.id_cola)
      if (!res) r.fallidos.push({ id: t.id_cola, error: 'el servidor no respondió por este escaneo', red: false })
      else if (ENVIADO.has(res.estado)) r.enviados.push(t.id_cola)
      else r.fallidos.push({ id: t.id_cola, error: res.motivo ?? res.estado, red: false, definitivo: DEFINITIVO.has(res.estado) })
    }
  }
  return r
}

// Las no enviadas que quedan después de guardar online la asistencia de una
// división y fecha (esa asistencia las reemplaza).
export function sinNoEnviadasDe(items: ItemCola[], divisionId: string, fecha: string): ItemCola[] {
  return items.filter(i => !(i.payload.division_id === divisionId && i.payload.fecha === fecha))
}

// Falla de red (no de permisos ni de datos): conviene encolar y reintentar.
export function esErrorDeRed(e: unknown): boolean {
  if (!e) return false
  const msg = typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e)
  return /network request failed|failed to fetch|fetch failed|network error|timed? ?out|aborted/i.test(msg)
}

// Clave local de un ítem de la cola. No es un secreto: alcanza con que no se
// repita en el teléfono (crypto.randomUUID no existe en todos los runtimes de RN).
export function nuevoIdCola(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`
}
