// Lógica pura del historial de accesos al gimnasio (panel /porteria/accesos):
// filtros, validación del rango de fechas y armado del CSV. Separada de la
// página para poder verificarla con accesosFiltro.check.ts.

export type Semaforo = 'verde' | 'amarillo' | 'rojo' | 'exento'

export interface Acceso {
  creado_en: string
  punto: string
  semaforo: Semaforo | null
  sin_servicio: boolean
  sin_reserva: boolean
  es_invitado: boolean
  invitado_dni: string | null
  veces_invitado: number | null
  numero_socio: string
  nombre: string
}

export const SEMAFORO_LABEL: Record<Semaforo, string> = {
  verde: 'Verde', amarillo: 'Amarillo', rojo: 'Rojo', exento: 'Exento',
}

// Mismo tope que valida la Edge Function (socios-qr, listar-accesos).
export const MAX_DIAS_RANGO = 92

export interface FiltrosAccesos {
  busqueda: string
  estado: 'todos' | Semaforo
  tipo: 'todos' | 'socios' | 'invitados'
  soloSinServicio: boolean
  soloSinReserva: boolean
}

export const FILTROS_VACIOS: FiltrosAccesos = {
  busqueda: '',
  estado: 'todos',
  tipo: 'todos',
  soloSinServicio: false,
  soloSinReserva: false,
}

const TZ = 'America/Argentina/Buenos_Aires'

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function filtrarAccesos(accesos: Acceso[], filtros: FiltrosAccesos): Acceso[] {
  const busqueda = normalizar(filtros.busqueda.trim())
  return accesos.filter(a => {
    if (filtros.estado !== 'todos' && a.semaforo !== filtros.estado) return false
    if (filtros.tipo === 'socios' && a.es_invitado) return false
    if (filtros.tipo === 'invitados' && !a.es_invitado) return false
    if (filtros.soloSinServicio && !a.sin_servicio) return false
    if (filtros.soloSinReserva && !a.sin_reserva) return false
    if (busqueda) {
      const campos = [a.nombre, a.numero_socio, a.invitado_dni ?? ''].map(normalizar)
      if (!campos.some(c => c.includes(busqueda))) return false
    }
    return true
  })
}

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/

function esFechaValida(fecha: string): boolean {
  if (!FORMATO_FECHA.test(fecha)) return false
  // El regex deja pasar 2026-13-01 o 2026-02-30: la ida y vuelta por Date los descarta.
  const d = new Date(`${fecha}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha
}

/** Devuelve un mensaje de error, o null si el rango es válido. */
export function validarRango(desde: string, hasta: string): string | null {
  if (!esFechaValida(desde) || !esFechaValida(hasta)) return 'Elegí una fecha de inicio y de fin.'
  if (desde > hasta) return 'La fecha de inicio no puede ser posterior a la de fin.'
  const dias = (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000 + 1
  if (dias > MAX_DIAS_RANGO) return `El rango no puede superar los ${MAX_DIAS_RANGO} días.`
  return null
}

/**
 * La Edge Function devuelve el rango que efectivamente consultó. Una versión
 * vieja ignora desde/hasta (sólo conoce `fecha`) y devuelve el día de hoy:
 * sin este chequeo el panel mostraría y exportaría un historial incompleto.
 */
export function respuestaCubreRango(respuesta: { desde?: unknown; hasta?: unknown }, desde: string, hasta: string): boolean {
  return respuesta.desde === desde && respuesta.hasta === hasta
}

export function formatFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ,
  })
}

export function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ,
  })
}

export function accesosACsv(accesos: Acceso[]): string {
  const columnas = ['Fecha', 'Hora', 'Nº Socio', 'Nombre', 'Estado de cuota', 'Sin servicio', 'Sin reserva', 'Invitado', 'DNI invitado', 'Veces en los 30 días previos a la visita']
  const filas = accesos.map(a => [
    formatFecha(a.creado_en),
    formatHora(a.creado_en),
    a.numero_socio,
    a.nombre,
    a.semaforo ? SEMAFORO_LABEL[a.semaforo] : '',
    a.sin_servicio ? 'Sí' : '',
    a.sin_reserva ? 'Sí' : '',
    a.es_invitado ? 'Sí' : '',
    a.invitado_dni ?? '',
    a.veces_invitado != null ? String(a.veces_invitado) : '',
  ])

  // Delimitador ";" (no ",") — mismo criterio que /secretaria/deudas.
  const csvEscape = (v: string) => /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
  const lineas = [columnas, ...filas].map(fila => fila.map(csvEscape).join(';'))
  return '﻿' + lineas.join('\r\n') // BOM: fuerza UTF-8 en Excel
}

/**
 * Descarta respuestas fuera de orden: un rango largo tarda más que uno corto,
 * así que la respuesta de un rango anterior puede llegar después de la del
 * actual. Cada `nuevo()` devuelve una función que dice si ese pedido sigue
 * siendo el último.
 */
export function crearSecuenciador() {
  let ultimo = 0
  return {
    nuevo(): () => boolean {
      const pedido = ++ultimo
      return () => pedido === ultimo
    },
  }
}
