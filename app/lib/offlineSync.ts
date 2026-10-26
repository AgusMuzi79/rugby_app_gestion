// Drenado de la cola offline (lib/offlineQueue.ts).
//
// La asistencia que se guardaba sin señal se encolaba y la pantalla decía
// "registrada", pero nadie leía la cola: nunca llegaba a la base. Esto la
// manda cuando vuelve la red (lo dispara hooks/useSincronizacionOffline.ts).
// Lógica pura con la base inyectada (offlineSync.check.ts).

import type { ItemCola } from './offlineQueue'

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
}

export interface ResultadoSync {
  enviados: string[]                         // ids a sacar de la cola
  fallidos: { id: string; error: string }[]  // quedan en la cola para el próximo intento
  omitidos: string[]                         // quedan en la cola sin intentar (lesiones ocultas)
}

interface PayloadAsistencia {
  evento_id?:     string
  division_id:    string
  fecha?:         string
  registrado_por: string
  jugadores:      { jugador_id: string; estado: string }[]
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
  // Partido: trae su evento. Entrenamiento: el del día de esa división, o se crea.
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
      r.fallidos.push({ id: item.id, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return r
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
