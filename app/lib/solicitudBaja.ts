// Lógica pura de "Solicitar baja de la cuenta" en Mi perfil (auditoría UX,
// T11, App Store 5.1.1(v)). La app no borra la cuenta: deja una fila en
// solicitudes_baja y Secretaría la procesa (borrar el profile arrastraría el
// registro de socio por el ON DELETE CASCADE de socios.profile_id).

export type EstadoSolicitudBaja = 'pendiente' | 'procesada' | 'rechazada'

export interface SolicitudBaja {
  estado:       EstadoSolicitudBaja
  created_at:   string
  procesada_at: string | null
}

export interface VistaSolicitudBaja {
  mostrarBoton: boolean
  texto:        string | null
}

// tieneSocio = el usuario tiene registro en socios. Sin registro (familiar /
// tutor, staff sin socio) no hay "baja como socio": se pide eliminar la cuenta.
export function mensajeConfirmacionBaja(tieneSocio: boolean): string {
  return tieneSocio
    ? 'Se le pide a Secretaría que te dé de baja como socio y se elimina tu acceso a la app. Secretaría te contacta para confirmarlo.'
    : 'Se le pide a Secretaría que elimine tu cuenta y tu acceso a la app. Secretaría te contacta para confirmarlo.'
}

// dd/mm en hora local; '' si la fecha no se puede leer.
export function fechaDiaMes(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Qué muestra la fila de CUENTA según la última solicitud del usuario.
// Rechazada → se puede volver a pedir.
export function vistaSolicitudBaja(ultima: SolicitudBaja | null): VistaSolicitudBaja {
  if (!ultima || ultima.estado === 'rechazada') return { mostrarBoton: true, texto: null }
  if (ultima.estado === 'procesada') {
    return { mostrarBoton: false, texto: `Baja procesada el ${fechaDiaMes(ultima.procesada_at ?? ultima.created_at)}` }
  }
  return { mostrarBoton: false, texto: `Baja solicitada el ${fechaDiaMes(ultima.created_at)}` }
}

// El índice único parcial permite una sola pendiente por perfil: si el insert
// choca (p. ej. pedida desde otro teléfono), ya hay una y alcanza con recargar.
export function esSolicitudDuplicada(error: { code?: string } | null | undefined): boolean {
  return error?.code === '23505'
}
