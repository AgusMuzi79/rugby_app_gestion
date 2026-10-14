// Feedback después de mandar el comprobante por WhatsApp, reconciliado contra
// la importación de deuda de NUVIX. Todo del lado del cliente: al tocar
// "ENVIAR COMPROBANTE" se guarda en AsyncStorage cuándo se mandó, y cada vez
// que se cargan las cuotas se compara contra la última fecha de corte.
// Funciones puras: las usa useCuotas y las verifica comprobanteEnviado.check.ts.
// Límite conocido: es por dispositivo (reinstalar o usar otro teléfono lo pierde).

export type EstadoComprobante = 'ENVIADO' | 'REGISTRADO' | 'NO_REGISTRADO'

export interface ComprobanteEnviado {
  clave:     string
  enviadoAt: string   // ISO
  periodos:  string[] // períodos NUVIX que cubre (vacío = sólo saldo anterior)
}

// Secretaría carga el comprobante en NUVIX a mano: una importación con fecha
// de corte de menos de 2 días después del envío todavía puede no incluirlo.
const GRACIA_MS = 2 * 24 * 60 * 60 * 1000

// 'YYYY-MM-DD' (columna date) se lee como medianoche local; cualquier otro
// formato, como timestamp.
function aMs(fecha: string): number {
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha)
  if (soloFecha) return new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3])).getTime()
  return new Date(fecha).getTime()
}

export function estadoComprobante(
  enviadoAt: string,
  fechaCorte: string | null,
  periodoSigueAdeudado: boolean,
): EstadoComprobante {
  if (!fechaCorte) return 'ENVIADO'
  const enviado = aMs(enviadoAt)
  const corte   = aMs(fechaCorte)
  if (!Number.isFinite(enviado) || !Number.isFinite(corte)) return 'ENVIADO'
  if (corte < enviado + GRACIA_MS) return 'ENVIADO'
  return periodoSigueAdeudado ? 'NO_REGISTRADO' : 'REGISTRADO'
}

// socioId undefined/null = el socio logueado ("yo"); dado = menor del tutor.
export function prefijoComprobantes(socioId: string | null | undefined): string {
  return `comprobante:${socioId ?? 'yo'}:`
}

export function claveComprobante(socioId: string | null | undefined, periodo: string): string {
  return `${prefijoComprobantes(socioId)}${periodo}`
}

// La cuota virtual cubre varios períodos de NUVIX: su "período" para la clave
// es el conjunto ordenado (así el mismo conjunto da siempre la misma clave).
export function periodoCuotaVirtual(periodosNuvix: string[]): string {
  const unicos = [...new Set(periodosNuvix)].sort()
  return unicos.length > 0 ? unicos.join('+') : 'saldo-anterior'
}

export function parseEntradaComprobante(clave: string, raw: string | null): ComprobanteEnviado | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as { enviadoAt?: unknown; periodos?: unknown }
    if (typeof v.enviadoAt !== 'string') return null
    if (!Array.isArray(v.periodos) || !v.periodos.every(p => typeof p === 'string')) return null
    return { clave, enviadoAt: v.enviadoAt, periodos: v.periodos as string[] }
  } catch {
    return null
  }
}

// Una entrada sigue adeudada si alguno de sus períodos sigue figurando como
// adeudado (NUVIX o cuota pendiente de la app). Sin períodos (sólo saldo
// anterior): si el socio sigue con deuda.
// deudaSinPeriodo: hay deuda que NUVIX no asigna a un período (saldo anterior,
// o semáforo con deuda sin filas en la importación). Un período que dejó de
// figurar puede estar ahí adentro, así que no alcanza para dar el pago por
// registrado: ante la duda, NO_REGISTRADO y nunca un REGISTRADO falso.
export function sigueAdeudado(
  cubiertos: string[],
  periodosAdeudados: string[],
  hayDeuda: boolean,
  deudaSinPeriodo = false,
): boolean {
  if (cubiertos.length === 0) return hayDeuda
  if (cubiertos.some(p => periodosAdeudados.includes(p))) return true
  return deudaSinPeriodo
}

// El comprobante que corresponde mostrar en una card: el más reciente cuyos
// períodos se solapan con los de la card (la cuota virtual puede haber
// cambiado de conjunto entre importaciones).
export function comprobanteParaPeriodos<T extends Pick<ComprobanteEnviado, 'enviadoAt' | 'periodos'>>(
  entradas: T[],
  periodosCuota: string[],
): T | null {
  const candidatas = entradas.filter(e =>
    periodosCuota.length === 0
      ? e.periodos.length === 0
      : e.periodos.some(p => periodosCuota.includes(p)),
  )
  if (candidatas.length === 0) return null
  return candidatas.reduce((a, b) => (b.enviadoAt > a.enviadoAt ? b : a))
}

export function periodosEnGracia(entradas: { periodos: string[]; estado: EstadoComprobante }[]): string[][] {
  return entradas.filter(e => e.estado === 'ENVIADO').map(e => e.periodos)
}
