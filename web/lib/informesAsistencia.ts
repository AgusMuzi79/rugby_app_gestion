// Asistencia de Informes (auditoría web-subcomisión T4 + T15).
//
// Antes la alerta "4 AUS." miraba los 4 eventos más recientes de TODO el club,
// futuros incluidos, así que casi nunca saltaba; y cada fila recorría todas las
// asistencias (jugadores × filas). Ahora, por jugador y con Maps:
//   - sólo cuentan los eventos de SU división que no son actividades;
//   - racha: eventos con fecha <= hoy, del más reciente al más viejo (fecha,
//     hora, created_at); un evento sin fila del jugador no corta ni suma, y
//     cualquier estado que no sea `ausente` (justificado incluido) la corta —
//     igual que la alerta de la app (app/lib/ausenciasConsecutivas.ts);
//   - %: eventos ya pasados (fecha < hoy), `justificado` fuera del numerador
//     y del denominador — igual que app/lib/porcentajeAsistencia.ts.
// Lógica pura (informesAsistencia.check.ts).

export const TOPE_AUSENCIAS = 4

export interface EventoInforme {
  id:          string
  division_id: string
  fecha:       string // YYYY-MM-DD
  tipo:        string
  hora:        string | null
  created_at:  string
}

export interface FilaInforme {
  evento_id:  string
  jugador_id: string
  estado:     string
}

export interface JugadorInforme {
  id:          string
  division_id: string
}

export interface AsistenciaJugador {
  presentes:    number
  total:        number
  pct:          number | null // null = no hay nada que contar
  cuatroConsec: boolean
}

// Fecha local YYYY-MM-DD (no UTC: a la noche en Argentina UTC ya es mañana).
export function fechaLocal(d: Date = new Date()): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

// Más reciente primero; sin hora va después de las que tienen (como la app).
function masRecientePrimero(a: EventoInforme, b: EventoInforme): number {
  if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha)
  if (a.hora !== b.hora) {
    if (a.hora === null) return 1
    if (b.hora === null) return -1
    return b.hora.localeCompare(a.hora)
  }
  return b.created_at.localeCompare(a.created_at)
}

export function informeAsistencia(
  jugadores: JugadorInforme[],
  eventos: EventoInforme[],
  asistencias: FilaInforme[],
  hoy: string,
): Map<string, AsistenciaJugador> {
  // Eventos hasta hoy por división, ya ordenados.
  const porDivision = new Map<string, EventoInforme[]>()
  for (const e of eventos) {
    if (e.tipo === 'actividad' || e.fecha > hoy) continue
    const lista = porDivision.get(e.division_id)
    if (lista) lista.push(e)
    else porDivision.set(e.division_id, [e])
  }
  for (const lista of porDivision.values()) lista.sort(masRecientePrimero)

  // jugador → evento → estado
  const estados = new Map<string, Map<string, string>>()
  for (const a of asistencias) {
    let delJugador = estados.get(a.jugador_id)
    if (!delJugador) { delJugador = new Map(); estados.set(a.jugador_id, delJugador) }
    delJugador.set(a.evento_id, a.estado)
  }

  const resultado = new Map<string, AsistenciaJugador>()
  for (const j of jugadores) {
    const propios = porDivision.get(j.division_id) ?? []
    const delJugador = estados.get(j.id)
    let presentes = 0
    let total = 0
    let racha = 0
    let rachaCortada = false
    for (const ev of propios) {
      const estado = delJugador?.get(ev.id)
      if (estado === undefined) continue
      if (!rachaCortada) {
        if (estado === 'ausente') racha++
        else rachaCortada = true
      }
      if (ev.fecha < hoy && estado !== 'justificado') {
        total++
        if (estado === 'presente') presentes++
      }
    }
    resultado.set(j.id, {
      presentes,
      total,
      pct: total > 0 ? Math.round((presentes / total) * 100) : null,
      cuatroConsec: racha >= TOPE_AUSENCIAS,
    })
  }
  return resultado
}
