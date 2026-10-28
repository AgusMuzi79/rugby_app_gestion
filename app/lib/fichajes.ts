// Lógica pura del alta de fichajes del Manager (useFichajes). El alta en sí es
// el RPC fichar_jugador (20261102000000): jugador + vínculo con socio + fichaje
// en una sola transacción, así un fichaje a medias no deja un jugador huérfano
// que después bloquee el reintento con "ya existe ese DNI".

export interface DivisionOpcion {
  id:     string
  nombre: string
}

export interface FormFichaje {
  nombre:          string
  dni:             string
  fechaNacimiento: string
  divisionId:      string | null
}

// Primer error del formulario, o null si se puede enviar.
export function validarFichaje(f: FormFichaje): string | null {
  if (!f.nombre.trim())    return 'Ingresá el nombre completo.'
  if (!f.dni.trim())       return 'Ingresá el DNI.'
  if (!f.fechaNacimiento)  return 'Seleccioná la fecha de nacimiento.'
  if (!f.divisionId)       return 'Elegí la división.'
  return null
}

// División preseleccionada al abrir el modal: la del filtro de la lista si es
// una de las suyas; si tiene una sola, esa; si no, ninguna (la elige a mano).
export function divisionInicial(misDivisiones: DivisionOpcion[], filtro: string | null): string | null {
  if (filtro && misDivisiones.some(d => d.id === filtro)) return filtro
  if (misDivisiones.length === 1) return misDivisiones[0].id
  return null
}

// filtro null = todas las divisiones del manager.
export function filtrarPorDivision<T extends { divisionId: string }>(jugadores: T[], filtro: string | null): T[] {
  return filtro ? jugadores.filter(j => j.divisionId === filtro) : jugadores
}

const ERROR_GENERICO = 'No se pudo registrar el fichaje. Revisá la conexión y reintentá.'

// Error del RPC → texto para el usuario.
export function mensajeErrorFichaje(err: { code?: string; message?: string } | null | undefined): string {
  if (err?.code === '23505') return 'Ya existe un jugador con ese DNI en esta división.'
  if (err?.code === '42501') return 'No tenés permiso para fichar en esa división.'
  const msg = err?.message?.trim()
  return msg ? msg : ERROR_GENERICO
}
