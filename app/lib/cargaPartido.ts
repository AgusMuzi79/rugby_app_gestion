// Abrir ASISTENCIA o RESULTADO de un partido cargando antes lo guardado
// (asistencia + mesa del equipo) — revisión de la auditoría entrenador.
//
// El RESULTADO pedido desde el Inicio cargaba la asistencia y la mesa y, si la
// lectura fallaba, REINTENTAR llamaba a una función que leía el partido y el
// equipo elegidos en pantalla: en ese momento todavía eran null (o los de
// antes), así que no hacía nada; y aunque anduviera, iba a ASISTENCIA. Ahora
// el reintento lleva sus propios datos (partido, equipo, plantel y paso
// pedido) y repite exactamente esa carga.
// Lógica pura con la lectura inyectada (cargaPartido.check.ts).

export type DestinoPartido = 'asistencia' | 'resultado'

export interface PedidoCargaPartido<P, E, B> {
  partido: P
  equipo:  E
  base:    B
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
