// Lógica pura de `listar-accesos` (socios-qr): resolución del rango de fechas,
// paginación y conteo de visitas de invitados. Sin dependencias de Deno ni de
// Supabase para poder verificarla con accesosRango.check.ts.

// Tope del rango (≈ un trimestre); mismo valor que MAX_DIAS_RANGO en
// web/lib/accesosFiltro.ts — accesosRango.check.ts verifica que coincidan.
export const MAX_DIAS_LISTAR_ACCESOS = 92

const DIA_MS = 24 * 60 * 60 * 1000
// Argentina es UTC-3 fijo (sin horario de verano).
const OFFSET_AR_MS = 3 * 60 * 60 * 1000
const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/

function esFechaValida(fecha: string): boolean {
  if (!FORMATO_FECHA.test(fecha)) return false
  // El regex deja pasar 2026-13-01 o 2026-02-30: la ida y vuelta por Date los descarta.
  const d = new Date(`${fecha}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha
}

export interface RangoAccesos {
  desde: string
  hasta: string
  inicio: Date // inclusive, medianoche AR de `desde`
  fin: Date    // exclusivo, medianoche AR del día siguiente a `hasta`
}

/** Fecha YYYY-MM-DD del día en curso en Argentina. */
export function hoyAR(ahora: Date = new Date()): string {
  return new Date(ahora.getTime() - OFFSET_AR_MS).toISOString().slice(0, 10)
}

/**
 * Rango `desde`..`hasta` (ambos inclusive). `fecha` sola se sigue aceptando
 * como rango de un día, por compatibilidad con clientes viejos.
 */
export function resolverRango(
  body: Record<string, unknown>,
  hoy: string,
): RangoAccesos | { error: string } {
  const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const fecha = texto(body.fecha) || hoy
  const desde = texto(body.desde) || fecha
  const hasta = texto(body.hasta) || desde

  if (!esFechaValida(desde) || !esFechaValida(hasta)) {
    return { error: 'desde/hasta deben tener formato YYYY-MM-DD' }
  }
  if (desde > hasta) return { error: 'desde no puede ser posterior a hasta' }

  const inicio = new Date(`${desde}T00:00:00-03:00`)
  const fin    = new Date(new Date(`${hasta}T00:00:00-03:00`).getTime() + DIA_MS)
  const dias   = Math.round((fin.getTime() - inicio.getTime()) / DIA_MS)
  if (dias > MAX_DIAS_LISTAR_ACCESOS) {
    return { error: `El rango no puede superar los ${MAX_DIAS_LISTAR_ACCESOS} días` }
  }
  return { desde, hasta, inicio, fin }
}

type Pagina<T> = { data: T[] | null; error: { message: string } | null }

/**
 * PostgREST corta en 1000 filas por request: un rango de semanas las supera.
 * `pagina(desde, hasta)` recibe índices inclusive, como `.range()`.
 */
export async function traerTodasLasPaginas<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<Pagina<T>>,
  tamano = 1000,
): Promise<{ data: T[] } | { error: string }> {
  const data: T[] = []
  for (let desde = 0; ; desde += tamano) {
    const { data: filas, error } = await pagina(desde, desde + tamano - 1)
    if (error) return { error: error.message }
    data.push(...(filas ?? []))
    if (!filas || filas.length < tamano) return { data }
  }
}

/** Fin (exclusivo, en ms) del día argentino en el que cae `iso`. */
function finDelDiaAR(iso: string): number {
  const local = Date.parse(iso) - OFFSET_AR_MS
  return Math.floor(local / DIA_MS) * DIA_MS + DIA_MS + OFFSET_AR_MS
}

type VisitaInvitado = { creado_en: string; invitado_dni: string | null }

/**
 * Para cada visita, cuántas veces vino ese DNI en los `ventanaDias` días que
 * terminan al cierre del día de esa visita (incluido ese día entero). Es lo que
 * dispara el "Derivar a Secretaría" del panel. `historial` debe cubrir desde
 * `ventanaDias` antes de la primera visita hasta el cierre de la última.
 */
export function contarVecesInvitadoPorVisita(
  visitas: VisitaInvitado[],
  historial: VisitaInvitado[],
  ventanaDias: number,
): (number | null)[] {
  const porDni = new Map<string, number[]>()
  for (const h of historial) {
    if (!h.invitado_dni) continue
    const lista = porDni.get(h.invitado_dni) ?? []
    lista.push(Date.parse(h.creado_en))
    porDni.set(h.invitado_dni, lista)
  }

  return visitas.map(v => {
    if (!v.invitado_dni) return null
    const fin = finDelDiaAR(v.creado_en)
    const desde = fin - ventanaDias * DIA_MS
    return (porDni.get(v.invitado_dni) ?? []).filter(t => t >= desde && t < fin).length
  })
}
