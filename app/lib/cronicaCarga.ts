// Lecturas de la Crónica (revisión de la auditoría entrenador T19).
//
// Las consultas salieron del hook (hooks/useCronica.ts) para poder verificar
// con un cliente falso que el alcance por división se aplica en la base: el
// filtro va en la consulta, antes del limit (si se filtrara después, el límite
// global podía dejar afuera los resultados propios), con `!inner` para que el
// filtro sobre la tabla relacionada recorte las filas. Quien no tiene
// divisiones asignadas (y no es subcomisión) no consulta nada de división.
// Verificado en cronicaCarga.check.ts.

import {
  alcanceCronica, tiposNotificacion, ordenarFeed,
  itemLesion, itemFichaje, itemResultado, itemNotificacion,
  type FeedItem, type FilaLesion, type FilaFichaje, type FilaResultado, type FilaNotificacion,
} from './cronica'
import { primerError } from './errorCarga'

type Respuesta = { data: unknown[] | null; error: unknown }

// Lo mínimo del cliente de Supabase que usa la Crónica.
export interface ConsultaCronica extends PromiseLike<Respuesta> {
  gte(columna: string, valor: string): ConsultaCronica
  in(columna: string, valores: readonly string[]): ConsultaCronica
  eq(columna: string, valor: string): ConsultaCronica
  order(columna: string, opciones?: { ascending?: boolean }): ConsultaCronica
  limit(cantidad: number): ConsultaCronica
  single(): PromiseLike<{ data: unknown; error: unknown }>
}

export interface ClienteCronica {
  from(tabla: string): { select(columnas: string): ConsultaCronica }
}

const VACIA: Respuesta = { data: [], error: null }

export async function leerCronica(
  db: ClienteCronica,
  { userId, rol, desde, conLesiones }: { userId: string; rol: string; desde: string; conLesiones: boolean },
): Promise<FeedItem[]> {
  const { data: profile, error: errProfile } = await db
    .from('profiles').select('divisiones').eq('id', userId).single()
  if (errProfile) throw errProfile

  const divisiones = ((profile as { divisiones?: string[] | null } | null)?.divisiones) ?? []
  const alcance = alcanceCronica(rol, divisiones)
  // Sin divisiones asignadas (y sin ser subcomisión) no hay nada de división que leer.
  const conDivisiones = alcance.todas || alcance.divisiones.length > 0
  const porDivision = (q: ConsultaCronica, columna: string) =>
    (alcance.todas ? q : q.in(columna, alcance.divisiones))

  const lesionesQ = () => porDivision(
    db.from('lesiones')
      .select('id, created_at, grado, descripcion, jugadores(nombre_completo), divisiones(nombre)')
      .gte('created_at', desde),
    'division_id',
  ).order('created_at', { ascending: false }).limit(10)

  // Fichajes reales (tabla `fichajes`): mover de división o el pase de
  // temporada crean filas nuevas en `jugadores`, pero no un fichaje.
  const fichajesQ = () => porDivision(
    db.from('fichajes')
      .select('id, created_at, jugadores!inner(nombre_completo, division_id, divisiones(nombre))')
      .gte('created_at', desde),
    'jugadores.division_id',
  ).order('created_at', { ascending: false }).limit(5)

  const resultadosQ = () => porDivision(
    db.from('resultados')
      .select('id, created_at, eventos!inner(rival, division_id, divisiones(nombre))')
      .gte('created_at', desde),
    'eventos.division_id',
  ).order('created_at', { ascending: false }).limit(5)

  const notifQ = db.from('notificaciones')
    .select('id, titulo, mensaje, tipo, created_at')
    .gte('created_at', desde)
    .in('tipo', tiposNotificacion(rol))
    .order('created_at', { ascending: false }).limit(5)

  // Módulo de lesiones oculto (FEATURES.lesiones): ni se consulta la tabla.
  const [lesionesRes, fichajesRes, resultadosRes, notifRes]: Respuesta[] = await Promise.all([
    conLesiones && conDivisiones ? lesionesQ() : Promise.resolve(VACIA),
    conDivisiones ? fichajesQ() : Promise.resolve(VACIA),
    conDivisiones ? resultadosQ() : Promise.resolve(VACIA),
    notifQ,
  ])

  const error = primerError(lesionesRes.error, fichajesRes.error, resultadosRes.error, notifRes.error)
  if (error) throw error

  return ordenarFeed(
    ((lesionesRes.data ?? []) as FilaLesion[]).map(r => itemLesion(r, rol)),
    ((fichajesRes.data ?? []) as FilaFichaje[]).map(r => itemFichaje(r, rol)),
    ((resultadosRes.data ?? []) as FilaResultado[]).map(r => itemResultado(r, rol)),
    ((notifRes.data ?? []) as FilaNotificacion[]).map(r => itemNotificacion(r, rol)),
  )
}

export interface EstadoCronica {
  items:      FeedItem[]
  errorCarga: string | null
}

// Un fallo no es "sin novedades": queda el mensaje y, si había una lista de
// antes, sigue debajo.
export function aplicarCarga(
  prev: EstadoCronica,
  r: { tipo: 'ok'; items: FeedItem[] } | { tipo: 'error'; mensaje: string },
): EstadoCronica {
  return r.tipo === 'ok' ? { items: r.items, errorCarga: null } : { items: prev.items, errorCarga: r.mensaje }
}
