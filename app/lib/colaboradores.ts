// Pantalla Colaboradores del entrenador (odd/tasks/colaborador-por-entrenador.md).
// El entrenador designa colaboradores de sus divisiones entre los socios que ya
// tienen cuenta, vía la Edge Function `colaboradores`. Lógica pura, verificada
// en colaboradores.check.ts.
//
// Las reglas de la búsqueda repiten las de
// supabase/functions/_shared/colaboradores.ts (interpretarBusqueda): la app las
// aplica antes de llamar para no pegarle al servidor con 1 o 2 letras. Si se
// cambian allá, cambiarlas acá.

export const MIN_CARACTERES_BUSQUEDA = 3

// Espera desde la última tecla antes de buscar.
export const ESPERA_BUSQUEDA_MS = 400

export interface DivisionColaboradores { id: string; nombre: string }

// Respuesta de `listar`.
export interface ColaboradorListado {
  profileId:   string
  nombre:      string
  divisionIds: string[]
}

// Respuesta de `buscar`.
export interface ResultadoBusqueda {
  profileId:       string
  nombre:          string
  yaEsColaborador: boolean
  elegible:        boolean
  motivo?:         string
}

export type BusquedaColaborador =
  | { tipo: 'vacia' }
  | { tipo: 'corta'; mensaje: string }
  | { tipo: 'buscar'; q: string; esDni: boolean }

/** Sólo dígitos (con puntos o espacios) es un DNI; si no, un nombre. */
export function busquedaColaborador(texto: string): BusquedaColaborador {
  const limpio = texto.trim().replace(/\s+/g, ' ')
  if (limpio.length === 0) return { tipo: 'vacia' }
  if (/^[\d.\s]+$/.test(limpio)) {
    const dni = limpio.replace(/\D/g, '')
    if (dni.length < MIN_CARACTERES_BUSQUEDA) {
      return { tipo: 'corta', mensaje: `Escribí al menos ${MIN_CARACTERES_BUSQUEDA} dígitos` }
    }
    return { tipo: 'buscar', q: dni, esDni: true }
  }
  if (limpio.length < MIN_CARACTERES_BUSQUEDA) {
    return { tipo: 'corta', mensaje: `Escribí al menos ${MIN_CARACTERES_BUSQUEDA} caracteres` }
  }
  return { tipo: 'buscar', q: limpio, esDni: false }
}

/** Los colaboradores de una división, por nombre. */
export function colaboradoresDeDivision(
  lista: ColaboradorListado[],
  divisionId: string | null,
): ColaboradorListado[] {
  if (!divisionId) return []
  return lista
    .filter(c => c.divisionIds.includes(divisionId))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/** Conserva la división elegida si sigue entre las del entrenador; si no, la primera. */
export function divisionInicial(divisiones: DivisionColaboradores[], actual: string | null): string | null {
  if (actual && divisiones.some(d => d.id === actual)) return actual
  return divisiones[0]?.id ?? null
}

/** Tras designar, el resultado muestra "ya es colaborador" (sin volver a buscar). */
export function marcarDesignado(resultados: ResultadoBusqueda[], profileId: string): ResultadoBusqueda[] {
  return resultados.map(r => (r.profileId === profileId ? { ...r, yaEsColaborador: true } : r))
}

export function textoConfirmarQuitar(nombre: string, division: string): string {
  return `${nombre} deja de ser colaborador de ${division}: ya no toma asistencia ni recibe el recordatorio de esa división.`
}
