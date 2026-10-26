// Veredicto del escáner: "¿entra o no entra?".
//
// Antes la pantalla tenía dos estados para cuatro resultados: un moroso (que
// pasa) se veía, sonaba y se rotulaba igual que un rechazo, y todo rechazo o
// error de red decía "QR NO VÁLIDO". Lógica pura (veredictoScan.check.ts).

// Turno del socio en la franja vigente (sólo lo manda socios-qr a la cuenta Lector y sólo
// si hay franjas cargadas; null/ausente = no mostrar nada). Calculado en la base.
export interface TurnoActual {
  modo:       'informativo' | 'bloqueante' | string
  estado:     'sin_franja' | 'cerrada' | 'con_reserva' | 'sin_reserva' | string
  franja:     { id: string; hora_desde: string; hora_hasta: string; profesor: string | null } | null
  reserva_id: string | null
  ocupados:   number | null
  capacidad:  number | null
  bloquear:   boolean
  mensaje:    string
}

export interface ScanResult {
  valido:        boolean
  motivo?:       string
  nombre?:       string
  numero_socio?: string
  estado?:       string
  semaforo?:     string | null
  categoria?:    string
  foto_path?:    string | null
  foto_validada?: boolean
  foto_url?:     string | null   // signed URL, resolved after validate
  turno?:        TurnoActual | null
  // No se pudo preguntar al server (red, timeout, sesión vencida): no se sabe.
  errorRed?:     boolean
}

export type Veredicto = 'pasa' | 'pasa_aviso' | 'no_pasa' | 'sin_conexion'

// Mismo criterio que el carnet del socio: 'activo' con semáforo 'rojo'
// (2+ períodos impagos) se muestra como 'moroso' acá también.
export function estadoVisual(result: ScanResult): string {
  if (result.estado === 'activo' && result.semaforo === 'rojo') return 'moroso'
  return result.estado ?? ''
}

export function veredicto(r: ScanResult): Veredicto {
  if (r.errorRed) return 'sin_conexion'
  if (!r.valido) return 'no_pasa'
  const e = estadoVisual(r)
  if (e === 'inactivo') return 'no_pasa' // por si sigue deployada una function vieja
  if (e === 'moroso' || r.turno?.estado === 'sin_reserva') return 'pasa_aviso'
  return 'pasa'
}

const MOTIVOS_QR_INVALIDO = ['Código QR inválido o expirado', 'Formato de QR no reconocido']

export function tituloVeredicto(r: ScanResult): string {
  switch (veredicto(r)) {
    case 'pasa':         return 'PUEDE PASAR'
    case 'pasa_aviso':   return 'PASA · CON AVISO'
    case 'sin_conexion': return 'SIN CONEXIÓN'
    case 'no_pasa':      return MOTIVOS_QR_INVALIDO.includes(r.motivo ?? '') ? 'QR NO VÁLIDO' : 'NO PUEDE PASAR'
  }
}

// La línea bajo el título. null = no hace falta.
export function motivoVeredicto(r: ScanResult): string | null {
  switch (veredicto(r)) {
    case 'pasa':
      return r.turno?.mensaje || null
    case 'pasa_aviso':
      if (estadoVisual(r) === 'moroso') return 'Cuota atrasada: avisale que pase por Secretaría.'
      return r.turno?.mensaje || 'No reservó este horario.'
    case 'no_pasa':
      if (estadoVisual(r) === 'inactivo') return 'Socio dado de baja. Consultá en Secretaría.'
      return r.motivo ?? 'No puede pasar.'
    case 'sin_conexion':
      return r.motivo ?? 'No se pudo verificar: sin conexión. Probá de nuevo.'
  }
}

// Resultado cuando no se pudo hablar con socios-qr. `status` = HTTP del error, si hubo.
export function resultadoErrorRed(status: number | undefined): ScanResult {
  if (status === 401) {
    return { valido: false, errorRed: true, motivo: 'La sesión de esta tablet venció. Pedí que vuelvan a iniciar sesión.' }
  }
  if (status !== undefined) {
    return { valido: false, errorRed: true, motivo: 'No se pudo verificar: el servidor no respondió bien. Probá de nuevo.' }
  }
  return { valido: false, errorRed: true, motivo: 'No se pudo verificar: sin conexión. Probá de nuevo.' }
}
