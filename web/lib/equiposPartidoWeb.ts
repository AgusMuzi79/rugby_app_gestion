// Equipos de una división para Partidos del panel web.
//
// Copia de app/lib/equiposPartido.ts: la primera vez que se abre una división
// se crean los equipos que faltan ("Primera", "Intermedia"… en el plantel
// superior; "M15", "M15 B"… en el resto; uno cada 35 jugadores) con `upsert …
// ignoreDuplicates` contra el índice único (division_id, nombre) y se relee la
// lista. Sin el índice (42P10) cae al insert simple. Con duplicados viejos se
// usa el más viejo. El primero de la lista es el equipo obligatorio. El panel
// no puede importar de app/: mantener los dos en sync. Lógica pura con el
// acceso a la tabla inyectado (equiposPartidoWeb.check.ts).

export interface Equipo {
  id: string
  nombre: string
}

export interface NuevoEquipo {
  division_id: string
  nombre: string
  created_by: string
}

/** Acceso a la tabla `equipos` (en el panel, Supabase; en el check, un doble). */
export interface AccesoEquipos {
  /** Equipos de la división, del más viejo al más nuevo. */
  listar(divisionId: string): Promise<{ data: Equipo[] | null; error: unknown }>
  /** `upsert`: ON CONFLICT (division_id, nombre) DO NOTHING; `insert`: insert simple. */
  crear(filas: NuevoEquipo[], modo: 'upsert' | 'insert'): Promise<{ error: unknown }>
}

export const JUGADORES_POR_EQUIPO = 35

const LETRAS = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']

export function generarNombresEquipos(
  cantidad: number,
  categoria: string,
  divisionNombre: string,
): string[] {
  if (categoria === 'superior') {
    return Array.from({ length: cantidad }, (_, i) => {
      if (i === 0) return 'Primera'
      if (i === 1) return 'Intermedia'
      if (i === 2) return 'Preintermedia'
      const l = i - 3
      return `Preintermedia ${LETRAS[l] ?? String.fromCharCode(66 + l)}`
    })
  }
  return Array.from({ length: cantidad }, (_, i) =>
    i === 0
      ? divisionNombre
      : `${divisionNombre} ${LETRAS[i - 1] ?? String.fromCharCode(65 + i)}`,
  )
}

/** Un equipo por nombre (el primero = el más viejo); esperados primero, extras al final. */
export function ordenarEquipos(nombresEsperados: string[], existentes: Equipo[]): Equipo[] {
  const porNombre = new Map<string, string>()
  for (const e of existentes) if (!porNombre.has(e.nombre)) porNombre.set(e.nombre, e.id)
  const result: Equipo[] = []
  for (const nombre of nombresEsperados) {
    const id = porNombre.get(nombre)
    if (id) result.push({ id, nombre })
  }
  for (const [nombre, id] of porNombre) {
    if (!nombresEsperados.includes(nombre)) result.push({ id, nombre })
  }
  return result
}

function codigo(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err
    ? String((err as { code: unknown }).code)
    : undefined
}

export async function sincronizarEquipos(
  acceso: AccesoEquipos,
  p: { divisionId: string; categoria: string; divisionNombre: string; cantidadJugadores: number; userId: string },
): Promise<{ equipos: Equipo[]; error: unknown }> {
  const cantidad = Math.max(1, Math.ceil(p.cantidadJugadores / JUGADORES_POR_EQUIPO))
  const esperados = generarNombresEquipos(cantidad, p.categoria, p.divisionNombre)

  const lectura = await acceso.listar(p.divisionId)
  if (lectura.error) return { equipos: [], error: lectura.error }
  const existentes = lectura.data ?? []

  const faltantes = esperados.filter(n => !existentes.some(e => e.nombre === n))
  if (faltantes.length === 0) return { equipos: ordenarEquipos(esperados, existentes), error: null }

  const filas = faltantes.map(nombre => ({ division_id: p.divisionId, nombre, created_by: p.userId }))
  let alta = await acceso.crear(filas, 'upsert')
  // 42P10: todavía no existe el índice único (duplicados viejos sin limpiar).
  if (codigo(alta.error) === '42P10') alta = await acceso.crear(filas, 'insert')
  // 23505: otra carga lo creó entre la lectura y el alta; la relectura lo trae.
  if (alta.error && codigo(alta.error) !== '23505') return { equipos: ordenarEquipos(esperados, existentes), error: alta.error }

  const relectura = await acceso.listar(p.divisionId)
  if (relectura.error) return { equipos: ordenarEquipos(esperados, existentes), error: relectura.error }
  return { equipos: ordenarEquipos(esperados, relectura.data ?? []), error: null }
}
