// "Por fecha" de Asistencias del panel del entrenador: cada entrenamiento o
// partido ya ocurrido (hoy incluido), del más reciente al más viejo, con los
// jugadores agrupados por estado. Lógica pura (asistenciasPorFecha.check.ts).
//
// - Las actividades no toman asistencia: quedan fuera (como en informesAsistencia.ts).
// - "Sin marcar" = jugadores activos de la división del evento sin fila.
// - Una fila guardada siempre cuenta, aunque el jugador ya esté de baja.

export interface EventoFecha {
  id:          string
  division_id: string
  fecha:       string // YYYY-MM-DD
  tipo:        string
  hora:        string | null
  rival:       string | null
  created_at:  string
}

export interface JugadorFecha {
  id:              string
  nombre_completo: string
  division_id:     string
  activo:          boolean
}

export interface FilaFecha {
  evento_id:  string
  jugador_id: string
  estado:     string
}

export interface ResumenFecha {
  evento:       EventoFecha
  presentes:    JugadorFecha[]
  ausentes:     JugadorFecha[]
  justificados: JugadorFecha[]
  sinMarcar:    JugadorFecha[]
}

/** YYYY-MM-DD menos `dias` días, sin pasar por la zona horaria. */
export function restarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  const r = new Date(Date.UTC(y, m - 1, d - dias))
  const mm = String(r.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(r.getUTCDate()).padStart(2, '0')
  return `${r.getUTCFullYear()}-${mm}-${dd}`
}

// Mismo orden que informesAsistencia.ts: fecha, hora (sin hora después), created_at.
function masRecientePrimero(a: EventoFecha, b: EventoFecha): number {
  if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha)
  if (a.hora !== b.hora) {
    if (a.hora === null) return 1
    if (b.hora === null) return -1
    return b.hora.localeCompare(a.hora)
  }
  return b.created_at.localeCompare(a.created_at)
}

const porNombre = (a: JugadorFecha, b: JugadorFecha) => a.nombre_completo.localeCompare(b.nombre_completo, 'es')

export function asistenciasPorFecha(
  jugadores: JugadorFecha[],
  eventos: EventoFecha[],
  asistencias: FilaFecha[],
  hoy: string,
  desde?: string,
): ResumenFecha[] {
  const jugadorPorId = new Map(jugadores.map(j => [j.id, j]))

  const filasPorEvento = new Map<string, FilaFecha[]>()
  for (const a of asistencias) {
    const lista = filasPorEvento.get(a.evento_id)
    if (lista) lista.push(a)
    else filasPorEvento.set(a.evento_id, [a])
  }

  return eventos
    .filter(e => e.tipo !== 'actividad' && e.fecha <= hoy && (!desde || e.fecha >= desde))
    .sort(masRecientePrimero)
    .map(evento => {
      const r: ResumenFecha = { evento, presentes: [], ausentes: [], justificados: [], sinMarcar: [] }
      const marcados = new Set<string>()
      for (const f of filasPorEvento.get(evento.id) ?? []) {
        marcados.add(f.jugador_id)
        const j = jugadorPorId.get(f.jugador_id)
          ?? { id: f.jugador_id, nombre_completo: 'Jugador sin datos', division_id: evento.division_id, activo: false }
        if (f.estado === 'presente') r.presentes.push(j)
        else if (f.estado === 'ausente') r.ausentes.push(j)
        else if (f.estado === 'justificado') r.justificados.push(j)
      }
      for (const j of jugadores) {
        if (j.activo && j.division_id === evento.division_id && !marcados.has(j.id)) r.sinMarcar.push(j)
      }
      r.presentes.sort(porNombre)
      r.ausentes.sort(porNombre)
      r.justificados.sort(porNombre)
      r.sinMarcar.sort(porNombre)
      return r
    })
}
