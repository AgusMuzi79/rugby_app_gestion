// Deuda real del socio según la última importación de NUVIX (comprobantes_deuda).
// Funciones puras: las usan useDeudaDetalle / useCuotas y las verifica
// deudaSocio.check.ts.

// PostgREST puede devolver numeric como number o como string.
type Monto = number | string | null | undefined

export interface ComprobanteDeuda {
  id:        string
  vencido:   number
  a_vencer:  number
  vencimiento: string | null
}

export interface PeriodoDeuda {
  periodo:      string // YYYY-MM
  vencido:      number
  comprobantes: ComprobanteDeuda[]
}

export interface DeudaAgrupada {
  periodos:               PeriodoDeuda[]  // deuda real, ya excluye reg_cesantes — orden desc por período
  regCesantesTotal:       number
  proximosVencimientos:   ComprobanteDeuda[] // a_vencer > 0, informativo — no es deuda
  saldoAnterior:          number // filas es_saldo_anterior=true, sin período discreto
}

export interface FilaComprobanteDeuda {
  id:                string
  periodo:           string | null
  concepto:          string | null
  vencido:           Monto
  a_vencer:          Monto
  vencimiento:       string | null
  es_saldo_anterior: boolean | null
}

function aNumero(m: Monto): number {
  if (m == null) return 0
  const n = typeof m === 'number' ? m : parseFloat(m)
  return Number.isFinite(n) ? n : 0
}

function centavos(n: number): number {
  return Math.round(n * 100) / 100
}

export function agruparDeuda(rows: FilaComprobanteDeuda[]): DeudaAgrupada {
  let regCesantesTotal = 0
  let saldoAnterior     = 0
  const porPeriodo      = new Map<string, PeriodoDeuda>()
  const proximosVencimientos: ComprobanteDeuda[] = []

  for (const r of rows) {
    const vencido = aNumero(r.vencido)
    const aVencer = aNumero(r.a_vencer)

    if (r.concepto === 'reg_cesantes') {
      regCesantesTotal += vencido
      continue
    }
    if (r.es_saldo_anterior) {
      saldoAnterior += vencido
      continue
    }
    if (vencido > 0 && r.periodo) {
      const item: ComprobanteDeuda = { id: r.id, vencido, a_vencer: aVencer, vencimiento: r.vencimiento }
      const existente = porPeriodo.get(r.periodo)
      if (existente) {
        existente.vencido = centavos(existente.vencido + vencido)
        existente.comprobantes.push(item)
      } else {
        porPeriodo.set(r.periodo, { periodo: r.periodo, vencido, comprobantes: [item] })
      }
    }
    if (aVencer > 0) {
      proximosVencimientos.push({ id: r.id, vencido: 0, a_vencer: aVencer, vencimiento: r.vencimiento })
    }
  }

  const periodos = [...porPeriodo.values()].sort((a, b) => b.periodo.localeCompare(a.periodo))
  return {
    periodos,
    regCesantesTotal: centavos(regCesantesTotal),
    proximosVencimientos,
    saldoAnterior: centavos(saldoAnterior),
  }
}

// Lo que el socio tiene que transferir: todos los períodos vencidos + el saldo
// anterior. El plan de regularización (reg_cesantes) queda afuera a propósito —
// es aparte de la cuota social y no afecta el semáforo.
export function deudaTotal(d: { periodos: { vencido: number }[]; saldoAnterior: number }): number {
  return centavos(d.periodos.reduce((s, p) => s + p.vencido, 0) + d.saldoAnterior)
}

// Cantidad que muestra el banner "Tenés N cuotas pendientes". periodosNuvix es
// null cuando no hay cuota virtual (sin deuda en NUVIX); si la hay, cada período
// adeudado cuenta como una cuota (y un saldo anterior sin períodos cuenta 1).
// enviadosEnGracia: períodos cubiertos por comprobantes mandados por WhatsApp
// que todavía están en la gracia de 2 días (ver comprobanteEnviado.ts) — no
// cuentan como pendientes mientras Secretaría los carga.
export function contarPendientes(args: {
  periodosPendientes: string[]       // cuotas reales (tabla cuotas) en estado pendiente
  periodosNuvix:      string[] | null
  enviadosEnGracia?:  string[][]
}): number {
  const enviados = args.enviadosEnGracia ?? []
  const periodos = new Set(args.periodosPendientes)
  let soloSaldo = 0
  if (args.periodosNuvix) {
    if (args.periodosNuvix.length === 0) {
      soloSaldo = enviados.some(e => e.length === 0) ? 0 : 1
    }
    for (const p of args.periodosNuvix) periodos.add(p)
  }
  for (const e of enviados) for (const p of e) periodos.delete(p)
  return periodos.size + soloSaldo
}
