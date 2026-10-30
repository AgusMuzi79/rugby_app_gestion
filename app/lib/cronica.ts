// Feed de la Crónica (entrenador, coordinador, manager y subcomisión).
// Auditoría entrenador-coordinador T19: los fichajes salen de la tabla
// `fichajes` (no de `jugadores.created_at`, que también cuenta los movimientos
// de división y el pase de temporada) y quien tiene varias divisiones ve todas.
// Lógica pura, verificada en cronica.check.ts.

export type FeedTipo = 'LESIÓN' | 'ASISTENCIA' | 'FICHAJE' | 'RESULTADO' | 'INFO'

export interface FeedItem {
  id:        string
  tipo:      FeedTipo
  titulo:    string
  desc:      string
  autor:     string
  createdAt: string
  urgente:   boolean
  route:     string | null
  // Mensaje completo de las filas INFO (desc es un resumen); null en el resto.
  mensaje:   string | null
}

/** Subcomisión y admin: todo el club (la RLS lo recorta por deporte). El resto: sus divisiones. */
export type AlcanceCronica = { todas: true } | { todas: false; divisiones: string[] }

export function esSubcomisionCronica(rol: string): boolean {
  return rol === 'subcomision' || rol === 'admin'
}

export function alcanceCronica(rol: string, divIds: string[]): AlcanceCronica {
  return esSubcomisionCronica(rol) ? { todas: true } : { todas: false, divisiones: [...divIds] }
}

export function tiposNotificacion(rol: string): string[] {
  return esSubcomisionCronica(rol) ? ['ausencias_consecutivas', 'manual'] : ['ausencias_consecutivas']
}

export function rutaParaTipo(tipo: FeedTipo, rol: string): string | null {
  switch (tipo) {
    case 'LESIÓN':     return rol === 'entrenador'  ? '/(entrenador)/lesiones'    : null
    case 'FICHAJE':    return rol === 'manager'     ? '/(manager)/fichajes'       : null
    case 'RESULTADO':  return rol === 'entrenador'  ? '/(entrenador)/partido'     : null
    case 'ASISTENCIA': return rol === 'coordinador' ? '/(coordinador)/asistencia' : null
    default:           return null
  }
}

export interface FilaLesion {
  id: string; created_at: string; grado: number; descripcion: string | null
  jugadores:  { nombre_completo: string } | null
  divisiones: { nombre: string } | null
}
export interface FilaFichaje {
  id: string; created_at: string
  jugadores: { nombre_completo: string; divisiones: { nombre: string } | null } | null
}
export interface FilaResultado {
  id: string; created_at: string
  eventos: { rival: string | null; divisiones: { nombre: string } | null } | null
}
export interface FilaNotificacion { id: string; titulo: string; mensaje: string; tipo: string; created_at: string }

export function itemLesion(row: FilaLesion, rol: string): FeedItem {
  return {
    id:        `lesion-${row.id}`,
    tipo:      'LESIÓN',
    titulo:    `Lesión grado ${row.grado} — ${row.jugadores?.nombre_completo ?? 'Jugador'}`,
    desc:      [row.divisiones?.nombre, row.descripcion].filter(Boolean).join(' · '),
    autor:     `POR SISTEMA · ${row.divisiones?.nombre ?? '—'}`,
    createdAt: row.created_at,
    urgente:   row.grado >= 3,
    route:     rutaParaTipo('LESIÓN', rol),
    mensaje:   null,
  }
}

export function itemFichaje(row: FilaFichaje, rol: string): FeedItem {
  const division = row.jugadores?.divisiones?.nombre
  return {
    id:        `fichaje-${row.id}`,
    tipo:      'FICHAJE',
    titulo:    `Nuevo fichaje — ${row.jugadores?.nombre_completo ?? 'Jugador'}`,
    desc:      division ?? '',
    autor:     `POR SISTEMA · ${division ?? '—'}`,
    createdAt: row.created_at,
    urgente:   false,
    route:     rutaParaTipo('FICHAJE', rol),
    mensaje:   null,
  }
}

export function itemResultado(row: FilaResultado, rol: string): FeedItem {
  const division = row.eventos?.divisiones?.nombre
  return {
    id:        `resultado-${row.id}`,
    tipo:      'RESULTADO',
    titulo:    row.eventos?.rival ? `Resultado registrado — vs ${row.eventos.rival}` : 'Resultado registrado',
    desc:      division ?? '',
    autor:     `POR SISTEMA · ${division ?? '—'}`,
    createdAt: row.created_at,
    urgente:   false,
    route:     rutaParaTipo('RESULTADO', rol),
    mensaje:   null,
  }
}

export function itemNotificacion(row: FilaNotificacion, rol: string): FeedItem {
  const tipo: FeedTipo = row.tipo === 'ausencias_consecutivas' ? 'ASISTENCIA' : 'INFO'
  return {
    id:        `notif-${row.id}`,
    tipo,
    titulo:    row.titulo,
    desc:      row.mensaje.length > 80 ? row.mensaje.slice(0, 80) + '…' : row.mensaje,
    autor:     tipo === 'INFO' ? 'POR SUBCOMISIÓN' : 'POR SISTEMA',
    createdAt: row.created_at,
    urgente:   false,
    route:     rutaParaTipo(tipo, rol),
    mensaje:   tipo === 'INFO' ? row.mensaje : null,
  }
}

/** Une las listas, saca repetidos (por id) y deja lo más nuevo primero. */
export function ordenarFeed(...listas: FeedItem[][]): FeedItem[] {
  const vistos = new Set<string>()
  const todos: FeedItem[] = []
  for (const lista of listas) {
    for (const it of lista) {
      if (vistos.has(it.id)) continue
      vistos.add(it.id)
      todos.push(it)
    }
  }
  return todos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}
