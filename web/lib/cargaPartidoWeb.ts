// Abrir un paso del partido cargando antes lo guardado (panel web).
//
// Copia de app/lib/cargaPartido.ts (`abrirPaso`: si la lectura falla,
// REINTENTAR repite esa misma carga con sus datos y abre el mismo paso) y de
// la aplicación de lo guardado de app/hooks/usePartido.ts (`cargarPartido`,
// `irAResultado`): la asistencia del partido (lo que no es `presente` cuenta
// como ausente), la mesa del equipo (sólo titular/suplente) y el resultado.
// Así se ve también lo que se guardó desde la app. El panel no puede importar
// de app/: mantener los dos en sync. Lógica pura (cargaPartidoWeb.check.ts).

import type { JugadorPartido, RolEnMesa } from './mesaPartido'

export type DestinoPartido = 'asistencia' | 'resultado'

export interface PedidoCargaPartido<P, E, B> {
  partido: P
  equipo: E
  base: B
  destino: DestinoPartido
}

export interface PuertoCargaPartido<P, E, B> {
  // Lee y aplica lo guardado; devuelve el error de la lectura o null.
  cargar(partido: P, equipo: E, base: B): Promise<unknown>
  // Muestra el error con REINTENTAR, que llama a `repetir`.
  fallo(err: unknown, repetir: () => void): void
  irA(destino: DestinoPartido, partido: P, equipo: E): Promise<void> | void
}

// false si falló la lectura (queda el error con su reintento).
export async function abrirPaso<P, E, B>(
  pedido: PedidoCargaPartido<P, E, B>,
  puerto: PuertoCargaPartido<P, E, B>,
): Promise<boolean> {
  const err = await puerto.cargar(pedido.partido, pedido.equipo, pedido.base)
  if (err) {
    puerto.fallo(err, () => { void abrirPaso(pedido, puerto) })
    return false
  }
  await puerto.irA(pedido.destino, pedido.partido, pedido.equipo)
  return true
}

export interface FilaAsistenciaGuardada {
  jugador_id: string
  estado: string
}

export interface MesaGuardada {
  mesa_jugadores: { jugador_id: string; rol_en_mesa: string }[] | null
}

export interface PartidoCargado {
  jugadores: JugadorPartido[]
  /** Presente por jugador según lo guardado (sin fila = presente). */
  presenciaGuardada: Record<string, boolean>
  /** Estado guardado por jugador (para la alerta de 4 faltas). */
  estadosPrevios: Record<string, string>
  /** Rol guardado en la mesa de este equipo. */
  rolesGuardados: Record<string, RolEnMesa>
  asistenciaGuardada: boolean
  mesaGuardada: boolean
}

export function aplicarGuardado(
  base: { id: string; nombre_completo: string }[],
  asistencias: FilaAsistenciaGuardada[],
  mesa: MesaGuardada | null,
): PartidoCargado {
  const estadosPrevios: Record<string, string> = {}
  for (const a of asistencias) estadosPrevios[a.jugador_id] = a.estado

  const rolesGuardados: Record<string, RolEnMesa> = {}
  for (const mj of mesa?.mesa_jugadores ?? []) {
    if (mj.rol_en_mesa === 'titular' || mj.rol_en_mesa === 'suplente') rolesGuardados[mj.jugador_id] = mj.rol_en_mesa
  }

  const jugadores: JugadorPartido[] = base.map(j => ({
    id: j.id,
    nombre_completo: j.nombre_completo,
    presente: j.id in estadosPrevios ? estadosPrevios[j.id] === 'presente' : true,
    rolEnMesa: rolesGuardados[j.id] ?? null,
  }))

  return {
    jugadores,
    presenciaGuardada: Object.fromEntries(jugadores.map(j => [j.id, j.presente])),
    estadosPrevios,
    rolesGuardados,
    asistenciaGuardada: asistencias.length > 0,
    mesaGuardada: mesa !== null,
  }
}

export interface ResultadoGuardado {
  puntos_propios: number
  puntos_rival: number
  rival: string | null
}

export function aplicarResultado(
  guardado: ResultadoGuardado | null,
  rivalDelPartido: string | null,
): { puntosPropios: string; puntosRival: string; rivalNombre: string; guardado: boolean } {
  if (!guardado) return { puntosPropios: '', puntosRival: '', rivalNombre: rivalDelPartido ?? '', guardado: false }
  return {
    puntosPropios: String(guardado.puntos_propios),
    puntosRival: String(guardado.puntos_rival),
    rivalNombre: guardado.rival ?? rivalDelPartido ?? '',
    guardado: true,
  }
}
