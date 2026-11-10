// Reglas de la asistencia, la mesa y el resultado de un partido (panel web).
//
// Copia de las reglas de app/hooks/usePartido.ts y app/app/(entrenador)/partido.tsx:
//   - marcar ausente saca al jugador de la mesa;
//   - la mesa sale sólo de los presentes: hasta 15 titulares y 8 suplentes,
//     sin repetidos (guardar_mesa además rechaza un repetido con 23505);
//   - un equipo opcional no se guarda antes de que el obligatorio (el primero)
//     tenga mesa; las divisiones infantiles no tienen mesa;
//   - errores de guardar_mesa: 23505 = repetido, 22023 = equipo de otra división;
//   - el resultado necesita los dos puntos.
// El panel no puede importar de app/: mantener los dos en sync. Lógica pura
// (mesaPartido.check.ts).

import { mensajeError } from './mensajeErrorWeb'

export const MAX_TITULARES = 15
export const MAX_SUPLENTES = 8

export type RolEnMesa = 'titular' | 'suplente'

export interface JugadorPartido {
  id: string
  nombre_completo: string
  presente: boolean
  rolEnMesa: RolEnMesa | null
}

export interface ConteoMesa {
  titular: number
  suplente: number
}

export function contarMesa(jugadores: Pick<JugadorPartido, 'presente' | 'rolEnMesa'>[]): ConteoMesa {
  return {
    titular: jugadores.filter(j => j.presente && j.rolEnMesa === 'titular').length,
    suplente: jugadores.filter(j => j.presente && j.rolEnMesa === 'suplente').length,
  }
}

/** Presente ↔ ausente; el cambio lo saca de la mesa (como la app). */
export function alternarPresente(jugadores: JugadorPartido[], jugadorId: string): JugadorPartido[] {
  return jugadores.map(j => j.id === jugadorId ? { ...j, presente: !j.presente, rolEnMesa: null } : j)
}

/**
 * Pone al jugador en `rol`; si ya lo tenía, lo saca de la mesa. Con el tope
 * lleno no cambia nada y devuelve el mensaje de la app.
 */
export function asignarRol(
  jugadores: JugadorPartido[],
  jugadorId: string,
  rol: RolEnMesa,
): { jugadores: JugadorPartido[]; error: string | null } {
  const actual = jugadores.find(j => j.id === jugadorId)
  if (!actual) return { jugadores, error: null }
  if (actual.rolEnMesa === rol) {
    return { jugadores: jugadores.map(j => j.id === jugadorId ? { ...j, rolEnMesa: null } : j), error: null }
  }
  if (!actual.presente) return { jugadores, error: 'Sólo los presentes pueden ir a la mesa.' }
  const conteo = contarMesa(jugadores)
  if (rol === 'titular' && conteo.titular >= MAX_TITULARES) return { jugadores, error: `Máximo ${MAX_TITULARES} titulares alcanzado.` }
  if (rol === 'suplente' && conteo.suplente >= MAX_SUPLENTES) return { jugadores, error: `Máximo ${MAX_SUPLENTES} suplentes alcanzado.` }
  return { jugadores: jugadores.map(j => j.id === jugadorId ? { ...j, rolEnMesa: rol } : j), error: null }
}

/** `p_jugadores` de guardar_mesa: presentes con rol, una vez cada uno. */
export function jugadoresDeMesa(jugadores: JugadorPartido[]): { jugador_id: string; rol_en_mesa: RolEnMesa }[] {
  const vistos = new Set<string>()
  const filas: { jugador_id: string; rol_en_mesa: RolEnMesa }[] = []
  for (const j of jugadores) {
    if (!j.presente || j.rolEnMesa === null || vistos.has(j.id)) continue
    vistos.add(j.id)
    filas.push({ jugador_id: j.id, rol_en_mesa: j.rolEnMesa })
  }
  return filas
}

/** Hay que mirar antes que el equipo obligatorio tenga mesa (equipo opcional, no infantil). */
export function debeVerificarObligatorio(p: { esInfantil: boolean; equipoId: string; obligatorioId: string }): boolean {
  return !p.esInfantil && p.equipoId !== p.obligatorioId
}

export function avisoMesaObligatoria(nombreObligatorio: string): string {
  return `Completá primero la mesa de "${nombreObligatorio}" antes de guardar este equipo.`
}

export function mensajeErrorMesa(err: unknown): string {
  return mensajeError(err, 'No se pudo guardar la mesa. Probá de nuevo.', {
    duplicado: 'Hay un jugador repetido en la mesa.',
    invalido: 'Ese equipo no es de esta división. Recargá la pantalla.',
  })
}

// La app usa un teclado numérico de hasta 3 cifras (sin signo): acá se
// rechaza lo mismo que ese teclado no deja escribir.
const PUNTOS = /^\d{1,3}$/

export function leerPuntos(propios: string, rival: string): { propios: number; rival: number } | { error: string } {
  const a = propios.trim()
  const b = rival.trim()
  if (!PUNTOS.test(a) || !PUNTOS.test(b)) return { error: 'Ingresá puntos válidos.' }
  return { propios: parseInt(a, 10), rival: parseInt(b, 10) }
}
