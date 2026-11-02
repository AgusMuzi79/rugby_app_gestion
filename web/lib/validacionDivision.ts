// Validaciones del formulario de divisiones (panel admin) que dependen de cómo
// asigna divisiones la base: _destino_division_por_servicio
// (supabase/migrations/20261014000000_division_automatica_por_servicio.sql).
//
// - Para un adulto busca la división activa con recibe_adultos del deporte y de
//   su rama (damas/caballeros, según el sexo). Si hay más de una, no asigna
//   ninguna ('adultos_ambiguo'). La base lo impide con el índice único
//   divisiones_recibe_adultos_unico; acá se avisa antes de guardar.
// - Las divisiones con rama 'mixto' nunca se usan, y las sin rama sólo para
//   socios sin sexo cargado: "recibe adultos" en esas no sirve.

export interface DivisionExistente {
  id: string
  nombre: string
  deporte: string
  rama: string | null
  activa: boolean
  recibe_adultos: boolean
}

export interface DivisionFormulario {
  // null cuando es una división nueva.
  id: string | null
  deporte: string
  // '' cuando no tiene rama.
  rama: string
  activa: boolean
  recibe_adultos: boolean
}

// Devuelve el mensaje de error o null si se puede guardar.
export function validarRecibeAdultos(form: DivisionFormulario, existentes: DivisionExistente[]): string | null {
  if (!form.recibe_adultos) return null

  const rama = form.rama.trim()
  if (rama === '') {
    return 'Para que reciba adultos elegí la rama (Damas o Caballeros): la asignación automática busca la división de adultos por rama.'
  }
  if (rama === 'mixto') {
    return 'Una división Mixto no puede recibir adultos: la asignación automática sólo usa Damas o Caballeros.'
  }

  // Una inactiva no compite: la asignación sólo mira divisiones activas.
  if (!form.activa) return null

  const otra = existentes.find(d =>
    d.id !== form.id && d.activa && d.recibe_adultos && d.deporte === form.deporte && d.rama === rama)
  if (otra) {
    return `Ya hay una división activa que recibe adultos para este deporte y rama: ${otra.nombre}. Desmarcala ahí antes.`
  }
  return null
}

// Aclaración bajo el campo RAMA, o null si no hace falta.
export function avisoRama(rama: string): string | null {
  const r = rama.trim()
  if (r === '') return 'Sin rama, la asignación automática por servicio no la usa (salvo socios sin sexo cargado).'
  if (r === 'mixto') return 'Mixto: la asignación automática por servicio no la usa.'
  return null
}
