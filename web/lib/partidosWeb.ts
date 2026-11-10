// Partidos del entrenador en el panel web.
//
// Copia de app/lib/partidosEntrenador.ts (ventana −7/+14 días, secciones SIN
// RESULTADO / PRÓXIMOS / JUGADOS, división elegida) + los pasos del partido de
// app/hooks/usePartido.ts (las divisiones infantiles no cargan mesa ni
// resultado). El panel no puede importar de app/: mantener los dos en sync.
// Lógica pura (partidosWeb.check.ts).

export const DIAS_ATRAS_PARTIDOS = 7
export const DIAS_ADELANTE_PARTIDOS = 14

// Fecha de calendario (YYYY-MM-DD) en hora local (app/lib/fecha.ts).
function fechaLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fechaLocalMasDias(dias: number, base: Date): string {
  return fechaLocal(new Date(base.getFullYear(), base.getMonth(), base.getDate() + dias))
}

export function ventanaPartidos(base: Date = new Date()): { hoy: string; desde: string; hasta: string } {
  return {
    hoy: fechaLocal(base),
    desde: fechaLocalMasDias(-DIAS_ATRAS_PARTIDOS, base),
    hasta: fechaLocalMasDias(DIAS_ADELANTE_PARTIDOS, base),
  }
}

export type ClaveSeccion = 'sin_resultado' | 'proximos' | 'jugados'

export interface SeccionPartidos<T> {
  clave: ClaveSeccion
  titulo: string
  partidos: T[]
}

/**
 * SIN RESULTADO (pasados sin resultado, el más reciente primero), PRÓXIMOS
 * (hoy en adelante) y JUGADOS (el resto de los pasados). Las divisiones
 * infantiles no cargan resultado: sus pasados van a JUGADOS. Sin secciones vacías.
 */
export function seccionarPartidos<T extends { fecha: string; conResultado: boolean }>(
  partidos: T[],
  hoy: string,
  registraResultado: boolean,
): SeccionPartidos<T>[] {
  const asc = (a: T, b: T) => a.fecha.localeCompare(b.fecha)
  const desc = (a: T, b: T) => b.fecha.localeCompare(a.fecha)
  const pasados = partidos.filter(p => p.fecha < hoy)
  const sinResultado = registraResultado ? pasados.filter(p => !p.conResultado) : []
  const secciones: SeccionPartidos<T>[] = [
    { clave: 'sin_resultado', titulo: 'SIN RESULTADO', partidos: [...sinResultado].sort(desc) },
    { clave: 'proximos', titulo: 'PRÓXIMOS', partidos: partidos.filter(p => p.fecha >= hoy).sort(asc) },
    { clave: 'jugados', titulo: 'JUGADOS', partidos: pasados.filter(p => !sinResultado.includes(p)).sort(desc) },
  ]
  return secciones.filter(s => s.partidos.length > 0)
}

/** La pedida (si es del entrenador); si no, la actual (si sigue); si no, la primera. */
export function elegirDivision(
  divisiones: { id: string }[],
  pedida: string | null | undefined,
  actual: string | null | undefined,
): string | null {
  if (pedida && divisiones.some(d => d.id === pedida)) return pedida
  if (actual && divisiones.some(d => d.id === actual)) return actual
  return divisiones[0]?.id ?? null
}

export type Paso = 'equipo' | 'asistencia' | 'mesa' | 'resultado'

/** Infantiles: sólo equipo y asistencia (sin mesa ni resultado). */
export function pasosPartido(esInfantil: boolean): Paso[] {
  return esInfantil ? ['equipo', 'asistencia'] : ['equipo', 'asistencia', 'mesa', 'resultado']
}
