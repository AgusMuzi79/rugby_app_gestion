// Búsqueda y filtros de las listas de socios del panel de Secretaría (Socios y
// Deudas). Lógica pura, sin React ni Supabase, verificada en busquedaSocios.check.ts.
//
// La secretaria conoce a los socios por el nombre del padrón de NUVIX
// (`socios.nombre_padron`); el socio puede cambiar `profiles.nombre` en Mi perfil.
// Se muestra el del padrón y se busca por los dos.

export type Semaforo = 'verde' | 'amarillo' | 'rojo' | 'exento'

export const SEMAFORO_LABEL: Record<Semaforo, string> = {
  verde: 'Verde', amarillo: 'Amarillo', rojo: 'Rojo', exento: 'Exento',
}

export interface CamposBusqueda {
  nombre: string
  nombreApp: string
  dni?: string
  numero_socio: string
}

/** Minúsculas y sin tildes, para comparar "García" con "garcia". */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Cada palabra de la búsqueda tiene que aparecer en algún campo (en cualquier orden). */
export function coincideBusqueda(busqueda: string, s: CamposBusqueda): boolean {
  const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return true
  const texto = normalizar([s.nombre, s.nombreApp, s.dni ?? '', s.numero_socio].join(' '))
  return palabras.every(p => texto.includes(p))
}

/** Nombre a mostrar (padrón, o el de la app si el padrón no lo trae) y nombre de la app. */
export function nombresSocio(
  nombrePadron: string | null | undefined,
  perfil: { nombre: string | null } | null | undefined,
): { nombre: string; nombreApp: string } {
  const app = perfil?.nombre?.trim() ?? ''
  const padron = nombrePadron?.trim() ?? ''
  return { nombre: padron || app || '—', nombreApp: app }
}

export interface FiltrosDeudas {
  filtro: 'todos' | Semaforo
  filtroServicio: string
  busqueda: string
}

const SERVICIO_TODOS = 'todos'

/**
 * Con búsqueda se ignora el filtro de semáforo: el caso típico es "¿ya figura mi
 * pago?", y el socio que pagó ya no está en rojo. El filtro de servicio se mantiene.
 */
export function filtrarDeudas<T extends CamposBusqueda & { semaforo: Semaforo | null; serviciosOpcionales: string[] }>(
  socios: T[],
  { filtro, filtroServicio, busqueda }: FiltrosDeudas,
): T[] {
  const buscando = busqueda.trim() !== ''
  return socios
    .filter(s => buscando || filtro === 'todos' || s.semaforo === filtro)
    .filter(s => filtroServicio === SERVICIO_TODOS || s.serviciosOpcionales.includes(filtroServicio))
    .filter(s => coincideBusqueda(busqueda, s))
}

/** Texto del vacío de Deudas: dice qué filtro dejó la lista vacía. */
export function mensajeVacioDeudas({ filtro, filtroServicio, busqueda }: FiltrosDeudas): string {
  const conServicio = filtroServicio !== SERVICIO_TODOS ? ` CON ${filtroServicio.toUpperCase()}` : ''
  if (busqueda.trim()) {
    return `NINGÚN SOCIO CON ESE NOMBRE, DNI O Nº${conServicio} (SE BUSCÓ EN TODOS LOS COLORES)`
  }
  if (filtro === 'todos') {
    return conServicio ? `NO HAY SOCIOS${conServicio}` : 'NO HAY SOCIOS CON DATOS DE DEUDA'
  }
  return `NO HAY SOCIOS EN ${SEMAFORO_LABEL[filtro].toUpperCase()}${conServicio}`
}

function formatMoney(n: number): string {
  return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatFecha(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

/** Fila "DEUDA NUVIX" del detalle del socio. */
export function resumenDeudaNuvix(
  s: { semaforo: Semaforo | null; deuda_vencida: number; meses_impagos: number },
  fechaCorte: string | null,
): string {
  if (!s.semaforo) return 'Sin dato en el último reporte de NUVIX'
  const meses = s.meses_impagos === 1 ? '1 mes impago' : `${s.meses_impagos} meses impagos`
  const partes = [SEMAFORO_LABEL[s.semaforo], `${formatMoney(s.deuda_vencida)} vencido`, meses]
  if (fechaCorte) partes.push(`reporte del ${formatFecha(fechaCorte)}`)
  return partes.join(' · ')
}
