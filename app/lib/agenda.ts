import { etiquetaEvento } from './tipoEvento'

// Agenda del socio (RPC `agenda_socio`, migración 20261023000000): eventos de
// las divisiones donde juega + si tiene el servicio de gimnasio. Lógica pura,
// sin React, para poder verificarla con agenda.check.ts.

export interface DivisionAgenda {
  id:      string
  nombre:  string
  deporte: string
}

export interface EventoAgenda {
  id:          string
  tipo:        string
  titulo:      string | null
  fecha:       string          // YYYY-MM-DD
  hora:        string | null   // HH:MM:SS
  lugar:       string | null
  rival:       string | null
  modalidad:   string | null
  division_id: string
}

export interface Agenda {
  tiene_gimnasio: boolean
  divisiones:     DivisionAgenda[]
  eventos:        EventoAgenda[]
}

export const AGENDA_VACIA: Agenda = { tiene_gimnasio: false, divisiones: [], eventos: [] }

// La Agenda muestra sólo la próxima semana (ver todo el bloque era demasiado).
export const DIAS_AGENDA = 7

// Ventana [hoy, hoy + dias] en fecha local del teléfono: en UTC, después de
// las 21 hs de Argentina ya sería el día siguiente.
export function ventanaAgenda(hoy: Date = new Date(), dias: number = DIAS_AGENDA): { p_desde: string; p_hasta: string } {
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const hasta = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + dias)
  return { p_desde: iso(hoy), p_hasta: iso(hasta) }
}

// "M15", "M15 y Sub 14", "M15, Sub 14 y M21"; null si no juega en ninguna.
// La usa el banner "Jugás en …" del Calendario del socio.
export function nombreMisDivisiones(divisiones: DivisionAgenda[]): string | null {
  const nombres = divisiones.map(d => d.nombre)
  if (nombres.length === 0) return null
  if (nombres.length === 1) return nombres[0]
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

// Sin gimnasio ni división, la pestaña no tiene nada que mostrar.
export function puedeVerAgenda(a: Pick<Agenda, 'tiene_gimnasio' | 'divisiones'>): boolean {
  return a.tiene_gimnasio || a.divisiones.length > 0
}

// Visibilidad de la pestaña: oculta hasta la primera carga; si la carga falla
// se muestra igual (la pantalla muestra el error con Reintentar). Una recarga
// con datos previos conserva lo que ya se veía.
export function mostrarTabAgenda(estado: {
  loading: boolean
  error:   string | null
  agenda:  Agenda | null
}): boolean {
  if (estado.agenda) return puedeVerAgenda(estado.agenda)
  if (estado.error) return true
  return false
}

// El RPC devuelve jsonb: se valida la forma antes de usarlo.
export function parsearAgenda(raw: unknown): Agenda {
  if (!raw || typeof raw !== 'object') return AGENDA_VACIA
  const r = raw as Record<string, unknown>
  if (typeof r.tiene_gimnasio !== 'boolean' || !Array.isArray(r.divisiones) || !Array.isArray(r.eventos)) {
    return AGENDA_VACIA
  }
  return {
    tiene_gimnasio: r.tiene_gimnasio,
    divisiones:     r.divisiones as DivisionAgenda[],
    eventos:        r.eventos as EventoAgenda[],
  }
}

export interface GrupoFecha {
  fecha:   string
  eventos: EventoAgenda[]
}

// Agrupa por día, en orden de fecha y hora (sin hora, al final del día).
export function agruparPorFecha(eventos: EventoAgenda[]): GrupoFecha[] {
  const ordenados = [...eventos].sort((a, b) =>
    a.fecha !== b.fecha
      ? a.fecha.localeCompare(b.fecha)
      : (a.hora ?? '99').localeCompare(b.hora ?? '99'),
  )
  const grupos: GrupoFecha[] = []
  for (const e of ordenados) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.fecha === e.fecha) ultimo.eventos.push(e)
    else grupos.push({ fecha: e.fecha, eventos: [e] })
  }
  return grupos
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

// 'MARTES 20/10'. Se calcula en UTC para que la zona horaria no corra el día.
export function etiquetaFecha(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number)
  const dia = DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? ''
  return `${dia} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`.toUpperCase()
}

export function horaCorta(hora: string | null): string | null {
  return hora ? hora.slice(0, 5) : null
}

// 'Partido vs Los Tilos', 'Charla de nutrición', y con más de una división
// el nombre de la división al final ('Entrenamiento · M15').
export function lineaEvento(ev: EventoAgenda, divisiones: DivisionAgenda[]): string {
  let linea = etiquetaEvento(ev)
  const rival = ev.rival?.trim()
  if (ev.tipo === 'partido' && rival) linea += ` vs ${rival}`
  if (divisiones.length > 1) {
    const div = divisiones.find(d => d.id === ev.division_id)
    if (div) linea += ` · ${div.nombre}`
  }
  return linea
}
