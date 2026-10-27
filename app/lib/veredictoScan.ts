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
  foto_url?:     string | null   // URL firmada (la manda socios-qr)
  turno?:        TurnoActual | null
  // No se pudo preguntar al server (red, timeout, sesión vencida): no se sabe.
  errorRed?:     boolean
  // Dentro de errorRed: no hubo respuesta del servidor (sin red o timeout), no
  // un 401 ni un error del servidor. Es el caso en que la puerta deja pasar.
  sinRed?:       boolean
  // Sin conexión: se dejó pasar y el escaneo quedó en la cola para validarse
  // cuando vuelva la red (socios-qr registrar-offline).
  encoladoOffline?: boolean
  // socios-qr: el paso TOTP ya estaba consumido (gimnasio, un solo uso).
  codigo_ya_usado?: boolean
  // El "ya se usó" es el reintento de un escaneo de esta misma tablet que se
  // cortó por timeout: el ingreso ya quedó registrado en el server.
  reintentoRegistrado?: boolean
}

// Escaneo de esta tablet que se cortó por timeout (puede que el server ya lo
// haya registrado y consumido el código).
export interface EscaneoCortado { raw: string; en: number }

// Ventana en la que un "ya se usó" del mismo QR se toma como el reintento
// propio: el código del carnet vale como mucho ~3 minutos (paso ±1).
const VENTANA_REINTENTO_MS = 3 * 60 * 1000

export function resolverReintento(
  r: ScanResult,
  raw: string,
  cortado: EscaneoCortado | null,
  ahora: number,
): ScanResult {
  if (!r.codigo_ya_usado || !cortado || cortado.raw !== raw || ahora - cortado.en > VENTANA_REINTENTO_MS) return r
  return { valido: true, reintentoRegistrado: true }
}

// Un escaneo cortado vale para un solo reintento: usado, se olvida (si no, una
// captura reenviada del mismo QR pasaría durante toda la ventana).
export function cortadoTrasResultado(r: ScanResult, cortado: EscaneoCortado | null): EscaneoCortado | null {
  return r.reintentoRegistrado ? null : cortado
}

export type Veredicto = 'pasa' | 'pasa_aviso' | 'pasa_sin_validar' | 'no_pasa' | 'sin_conexion'

// Mismo criterio que el carnet del socio: 'activo' con semáforo 'rojo'
// (2+ períodos impagos) se muestra como 'moroso' acá también.
export function estadoVisual(result: ScanResult): string {
  if (result.estado === 'activo' && result.semaforo === 'rojo') return 'moroso'
  return result.estado ?? ''
}

export function veredicto(r: ScanResult): Veredicto {
  if (r.encoladoOffline) return 'pasa_sin_validar'
  if (r.errorRed) return 'sin_conexion'
  if (!r.valido) return 'no_pasa'
  if (r.reintentoRegistrado) return 'pasa_aviso'
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
    case 'pasa_sin_validar': return 'SIN CONEXIÓN · INGRESO REGISTRADO SIN VALIDAR'
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
      if (r.reintentoRegistrado) return 'El ingreso ya quedó registrado (la conexión tardó). Puede pasar.'
      if (estadoVisual(r) === 'moroso') return 'Cuota atrasada: avisale que pase por Secretaría.'
      return r.turno?.mensaje || 'No reservó este horario.'
    case 'pasa_sin_validar':
      return 'Mirá a la persona y su carnet: se valida cuando vuelva la conexión.'
    case 'no_pasa':
      if (estadoVisual(r) === 'inactivo') return 'Socio dado de baja. Consultá en Secretaría.'
      return r.motivo ?? 'No puede pasar.'
    case 'sin_conexion':
      return r.motivo ?? 'No se pudo verificar: sin conexión. Probá de nuevo.'
  }
}

// Lo que anuncia el lector de pantalla al llegar el resultado: el veredicto,
// el nombre si lo hay y el motivo, en una sola frase.
export function anuncioVeredicto(r: ScanResult): string {
  return [tituloVeredicto(r), r.nombre, motivoVeredicto(r)].filter(Boolean).join('. ')
}

// Resultado cuando no se pudo hablar con socios-qr. `status` = HTTP del error, si hubo.
export function resultadoErrorRed(status: number | undefined): ScanResult {
  if (status === 401) {
    return { valido: false, errorRed: true, motivo: 'La sesión de esta tablet venció. Pedí que vuelvan a iniciar sesión.' }
  }
  if (status !== undefined) {
    return { valido: false, errorRed: true, motivo: 'No se pudo verificar: el servidor no respondió bien. Probá de nuevo.' }
  }
  return { valido: false, errorRed: true, sinRed: true, motivo: 'No se pudo verificar: sin conexión. Probá de nuevo.' }
}

// Política de la puerta sin red (decisión 2026-10-26, opción b): deja pasar y
// encola. Sólo cuando no hubo respuesta: un 401 o un error del servidor siguen
// siendo "SIN CONEXIÓN" sin dejar pasar.
export function debeEncolarOffline(r: ScanResult): boolean {
  return r.errorRed === true && r.sinRed === true
}

export function resultadoEncoladoOffline(): ScanResult {
  return { valido: true, encoladoOffline: true }
}
