import { etiquetaEvento } from './tipoEvento'
import { fechaArgentina, horaArgentina, inicioReal, type MiReserva } from './tenis'

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

export type OpcionReserva = 'gimnasio' | 'tenis'

// Opciones del botón RESERVAR de la Agenda, en el orden del selector. Gimnasio
// si tiene el servicio; tenis con FEATURES.tenis para todo socio (el cliente
// gimnasio no es socio y no reserva tenis). Vacío: no hay botón.
export function opcionesReserva(p: { tieneGimnasio: boolean; tenisActivo: boolean; esSocio: boolean }): OpcionReserva[] {
  const opciones: OpcionReserva[] = []
  if (p.tieneGimnasio) opciones.push('gimnasio')
  if (p.tenisActivo && p.esSocio) opciones.push('tenis')
  return opciones
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

// Mensaje definitivo "No tenés eventos…": sólo si la agenda cargó, ninguna carga
// falló (los turnos de tenis cuentan si tenis está encendido) y no hay nada que
// mostrar. Con un error no se puede afirmar que no hay nada: se muestra el error.
export function agendaVacia(p: {
  agendaCargada: boolean
  errorAgenda:   string | null
  errorTenis:    string | null
  tenisActivo:   boolean
  divisiones:    number
  turnosTenis:   number
}): boolean {
  if (!p.agendaCargada || p.errorAgenda) return false
  if (p.tenisActivo && p.errorTenis) return false
  return p.divisiones === 0 && p.turnosTenis === 0
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

// ─── Mis turnos de tenis en la Agenda (FEATURES.tenis) ────────────────────────
// Salen de tenis_mis_reservas() (titular o jugador). Se mezclan con los eventos
// de división por día y hora.

// Estados de una reserva que todavía ocupa la cancha y no se jugó.
const ESTADOS_TENIS_AGENDA = ['pendiente_confirmacion', 'pendiente_comprobante', 'confirmada']

// Reservas vivas que no terminaron (la que está en juego se sigue viendo),
// dentro de la ventana de la Agenda (fecha de Argentina), por horario.
export function reservasTenisAgenda(reservas: MiReserva[], ahoraMs: number, dias: number = DIAS_AGENDA): MiReserva[] {
  const hoy = fechaArgentina(ahoraMs)
  const [y, m, d] = hoy.split('-').map(Number)
  const limite = new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10)
  return reservas
    .filter(r => ESTADOS_TENIS_AGENDA.includes(r.estado) && Date.parse(r.fin) > ahoraMs && fechaArgentina(r.inicio) <= limite)
    .sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio))
}

export type ItemAgenda = { tipo: 'evento'; evento: EventoAgenda } | { tipo: 'tenis'; reserva: MiReserva }

export interface GrupoAgenda {
  fecha: string
  items: ItemAgenda[]
}

function claveHora(i: ItemAgenda): string {
  if (i.tipo === 'tenis') return horaArgentina(i.reserva.inicio)
  return i.evento.hora ? i.evento.hora.slice(0, 5) : '99'
}

function fechaItem(i: ItemAgenda): string {
  return i.tipo === 'tenis' ? fechaArgentina(i.reserva.inicio) : i.evento.fecha
}

// Como agruparPorFecha, con los turnos de tenis mezclados: por día y hora (sin
// hora, al final del día; a la misma hora, el tenis primero).
export function agruparAgenda(eventos: EventoAgenda[], reservas: MiReserva[]): GrupoAgenda[] {
  const items: ItemAgenda[] = [
    ...reservas.map(reserva => ({ tipo: 'tenis' as const, reserva })),
    ...eventos.map(evento => ({ tipo: 'evento' as const, evento })),
  ]
  const ordenados = items
    .map((item, orden) => ({ item, orden, fecha: fechaItem(item), hora: claveHora(item) }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora) || a.orden - b.orden)
  const grupos: GrupoAgenda[] = []
  for (const o of ordenados) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.fecha === o.fecha) ultimo.items.push(o.item)
    else grupos.push({ fecha: o.fecha, items: [o.item] })
  }
  return grupos
}

// Con quién juego: todos menos yo (mi_socio_id; si no viene y soy titular, el titular).
export function otrosJugadores(r: Pick<MiReserva, 'personas' | 'mi_socio_id' | 'es_titular'>): string[] {
  return r.personas
    .filter(p => (r.mi_socio_id ? p.socio_id !== r.mi_socio_id : !(r.es_titular && p.es_titular)))
    .map(p => p.nombre)
}

// 'Tenis · 18:05 · Cancha 03 · Singles' (arranque real: grilla + margen).
export function lineaTenis(r: Pick<MiReserva, 'inicio' | 'cancha' | 'modalidad'>, margenMin: number): string {
  return `Tenis · ${inicioReal(r.inicio, margenMin)} · Cancha ${r.cancha} · ${r.modalidad === 'dobles' ? 'Dobles' : 'Singles'}`
}

// EDITAR / CANCELAR de una reserva de tenis en la Agenda. El plazo lo decide el
// servidor con la config real (`puede_cancelar` en tenis_mis_reservas, hoy
// puede ser 0 h); acá sólo se exige que no haya empezado, así un dato viejo no
// ofrece acciones sobre un turno en juego. El servidor vuelve a validar.
export function accionesTenisAgenda(
  r: Pick<MiReserva, 'es_titular' | 'puede_cancelar' | 'estado' | 'origen' | 'inicio'>,
  ahoraMs: number,
): { editar: boolean; cancelar: boolean } {
  const cancelar = r.es_titular && r.puede_cancelar && Date.parse(r.inicio) > ahoraMs
  return { cancelar, editar: cancelar && r.estado === 'confirmada' && r.origen === 'socio' }
}
