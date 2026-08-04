// Parser del reporte de cuentas corrientes NUVIX (RPT_Vencimientos.rpt).
//
// No es una tabla plana — es un reporte Crystal Reports con bandas. Cada fila
// se clasifica por lo que trae en columnas específicas (0-indexed), no por
// posición de fila. El parser mantiene un puntero a "cuenta actual", abierto
// por la fila de cabecera (Cta. Cte.:) y cerrado por la fila de subtotal.
//
// Cualquier fila que no matchea ninguno de los tipos reconocidos (incluye
// "Cond. Venta:", "Divisa:", el encabezado de columnas y el pie "Solicitado
// Por: ... Terminal: NUVIX.") se ignora por descarte — no hace falta
// enumerar esos casos explícitamente.
//
// Ver openspec/changes/importador-deuda-nuvix/design.md §1 para el detalle
// de las reglas de negocio detrás de cada decisión de parseo.

export interface ComprobanteParseado {
  cod_cliente: string
  nombre_origen: string | null
  tipo: string | null // FAC | REC
  prefijo: string | null
  numero: string | null
  fecha: string | null // ISO date (YYYY-MM-DD)
  vencimiento: string | null // ISO date
  descripcion: string | null // string original NUVIX — solo trazabilidad, nunca mostrar crudo
  periodo: string | null // YYYY-MM
  concepto: 'cuota' | 'reg_cesantes' | 'otro' | null
  mora_dias: number | null
  vencido: number
  a_vencer: number
  es_saldo_anterior: boolean
}

export interface CuentaSubtotal {
  cod_cliente: string
  vencido: number
  a_vencer: number
  total: number
}

export interface Desbalance {
  campo: 'vencido' | 'a_vencer' | 'total'
  sumaSubtotales: number
  totalGeneral: number
  diferencia: number
}

export interface ParseResult {
  periodoDesde: string | null
  periodoHasta: string | null
  fechaCorte: string | null
  comprobantes: ComprobanteParseado[]
  subtotales: CuentaSubtotal[]
  totalGeneral: { vencido: number; aVencer: number; total: number } | null
  reconcilia: boolean
  desbalance: Desbalance[]
}

// ─── Helpers de celdas ──────────────────────────────────────────────────────

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === ''
}

function isNumeric(v: unknown): boolean {
  return typeof v === 'number' && !Number.isNaN(v)
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = Number(v.replace(/\./g, '').replace(',', '.'))
    return Number.isNaN(n) ? 0 : n
  }
  return 0
}

function isDateCell(v: unknown): boolean {
  if (v instanceof Date) return true
  if (typeof v === 'string') return /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(v.trim())
  return false
}

function toISODate(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getUTCFullYear()}-${pad2(v.getUTCMonth() + 1)}-${pad2(v.getUTCDate())}`
  }
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
    if (m) {
      const [, d, mo, y] = m
      const year = y.length === 2 ? `20${y}` : y
      return `${year}-${pad2(Number(mo))}-${pad2(Number(d))}`
    }
  }
  return null
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function aproxIgual(a: number, b: number, eps = 0.01): boolean {
  return Math.abs(a - b) < eps
}

// ─── Derivación de período y concepto ───────────────────────────────────────

const MESES_ES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
}

const MESES_ABREV: Record<string, number> = {
  ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6,
  JUL: 7, AGO: 8, SEP: 9, OCT: 10, NOV: 11, DIC: 12,
}

const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g')

function normalizarMes(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(COMBINING_MARKS, '')
}

function anioDeVencimiento(vencimientoISO: string | null): number {
  return vencimientoISO ? Number(vencimientoISO.slice(0, 4)) : new Date().getFullYear()
}

// Reglas originales del club (REG. CESANTES, "Liquidación Mes de X MM-YYYY",
// "DEUDA {MES}", variantes de gimnasio) asumían formatos consistentes. El
// archivo real (todos_desde_el_2022.xls) tiene mucha más variedad —
// mayúsculas/minúsculas, "Mes de" ausente, año duplicado en el medio del
// texto ("Liquidación mes de Junio 2022 6-2022"), meses sin año, medio-mes
// de gimnasio con orden de palabras distinto ("Liquidación 1/2 Mes Gym
// Diciembre", "Liquidación Gym 1/2 Mes de Enero"). Verificado contra ese
// archivo: de 1792 comprobantes, las 4 reglas originales dejaban 433 sin
// clasificar. La estrategia de acá generaliza a 3 señales en orden de
// confiabilidad, no de literal de texto — sigue dejando 'reg_cesantes'
// como máxima prioridad absoluta:
//   1. REG. CESANTES - M-YYYY → reg_cesantes (igual que antes)
//   2. Un código M-YYYY o MM-YYYY en cualquier parte del texto → cuota,
//      periodo de ese código. Es la señal más confiable: NUVIX lo agrega
//      como sufijo casi siempre que la liquidación tiene period conocido,
//      sin importar el resto de la redacción.
//   3. Nombre de mes (completo o abreviado) en cualquier parte del texto,
//      sin código M-YYYY → cuota, año de un YYYY suelto en el texto si
//      aparece, si no el año del vencimiento.
//   4. Ninguna señal → otro, periodo = año-mes del vencimiento (el
//      vencimiento es respaldo, nunca fuente primaria si hay señal de texto).
export function derivarPeriodoConcepto(
  descripcionOriginal: string,
  vencimientoISO: string | null,
): { periodo: string | null; concepto: 'cuota' | 'reg_cesantes' | 'otro' } {
  const d = descripcionOriginal.trim()

  // 1. REG. CESANTES - {M}-{YYYY} — máxima prioridad, nunca es cuota social
  let m = d.match(/REG\.?\s*CESANTES\s*-\s*(\d{1,2})-(\d{4})/i)
  if (m) return { periodo: `${m[2]}-${pad2(Number(m[1]))}`, concepto: 'reg_cesantes' }

  // 2. Código M-YYYY / MM-YYYY en cualquier parte del texto
  m = d.match(/(\d{1,2})-(\d{4})/)
  if (m) return { periodo: `${m[2]}-${pad2(Number(m[1]))}`, concepto: 'cuota' }

  // 3. Nombre de mes en cualquier parte — año: un YYYY suelto si aparece,
  //    si no el año del vencimiento
  const mesEncontrado = buscarMesEnTexto(d)
  if (mesEncontrado) {
    const anioMatch = d.match(/\b(20\d{2})\b/)
    const anio = anioMatch ? Number(anioMatch[1]) : anioDeVencimiento(vencimientoISO)
    return { periodo: `${anio}-${pad2(mesEncontrado)}`, concepto: 'cuota' }
  }

  // 4. Sin ninguna señal — período = año-mes del vencimiento
  if (vencimientoISO) return { periodo: vencimientoISO.slice(0, 7), concepto: 'otro' }
  return { periodo: null, concepto: 'otro' }
}

function buscarMesEnTexto(descripcion: string): number | null {
  const norm = normalizarMes(descripcion)
  for (const [nombre, num] of Object.entries(MESES_ES)) {
    if (new RegExp(`\\b${nombre}\\b`).test(norm)) return num
  }
  for (const [abrev, num] of Object.entries(MESES_ABREV)) {
    if (new RegExp(`\\b${abrev.toLowerCase()}\\b`).test(norm)) return num
  }
  return null
}

// ─── Clasificación de filas ─────────────────────────────────────────────────

type FilaTipo = 'periodo' | 'cabecera' | 'saldo_anterior' | 'detalle' | 'subtotal' | 'total_general' | 'ignorada'

function clasificarFila(row: unknown[]): FilaTipo {
  if (row[0] === 'Período Informado:') return 'periodo'
  if (row[0] === 'Cta. Cte.:') return 'cabecera'
  if (row[5] === 'SALDO ANTERIOR') return 'saldo_anterior'
  if (row[0] === 'Total General:') return 'total_general'
  if (isDateCell(row[0]) && (row[1] === 'FAC' || row[1] === 'REC')) return 'detalle'
  if (isEmpty(row[0]) && isEmpty(row[1]) && isNumeric(row[2]) && isNumeric(row[3]) && isNumeric(row[4]) && isEmpty(row[5])) {
    return 'subtotal'
  }
  return 'ignorada'
}

// ─── Parser principal ───────────────────────────────────────────────────────

export function parseDeudaNuvix(rows: unknown[][]): ParseResult {
  let periodoDesde: string | null = null
  let periodoHasta: string | null = null
  let fechaCorte: string | null = null
  let cuentaActual: { cod_cliente: string; nombre: string } | null = null

  const comprobantes: ComprobanteParseado[] = []
  const subtotales: CuentaSubtotal[] = []
  let totalGeneral: { vencido: number; aVencer: number; total: number } | null = null

  for (const row of rows) {
    switch (clasificarFila(row)) {
      case 'periodo':
        periodoDesde = toISODate(row[1])
        periodoHasta = toISODate(row[2])
        fechaCorte = toISODate(row[4])
        break

      case 'cabecera':
        cuentaActual = {
          cod_cliente: String(row[1] ?? '').trim(),
          nombre: String(row[2] ?? '').trim(),
        }
        break

      case 'saldo_anterior':
        if (!cuentaActual) break // fila huérfana (no debería pasar) — descartar defensivamente
        comprobantes.push({
          cod_cliente: cuentaActual.cod_cliente,
          nombre_origen: cuentaActual.nombre,
          tipo: null,
          prefijo: null,
          numero: null,
          fecha: null,
          vencimiento: null,
          descripcion: 'SALDO ANTERIOR',
          periodo: null, // no hay un período discreto atribuible — cuenta para deuda_vencida, no para meses_impagos
          concepto: 'otro',
          mora_dias: null,
          vencido: toNumber(row[7]),
          a_vencer: 0,
          es_saldo_anterior: true,
        })
        break

      case 'detalle': {
        if (!cuentaActual) break
        const vencimiento = toISODate(row[4])
        const descripcion = String(row[5] ?? '').trim()
        const { periodo, concepto } = derivarPeriodoConcepto(descripcion, vencimiento)
        comprobantes.push({
          cod_cliente: cuentaActual.cod_cliente,
          nombre_origen: cuentaActual.nombre,
          tipo: String(row[1]),
          prefijo: isEmpty(row[2]) ? null : String(row[2]),
          numero: isEmpty(row[3]) ? null : String(row[3]),
          fecha: toISODate(row[0]),
          vencimiento,
          descripcion,
          periodo,
          concepto,
          mora_dias: isEmpty(row[6]) ? null : Math.trunc(toNumber(row[6])),
          vencido: toNumber(row[7]),
          a_vencer: toNumber(row[8]),
          es_saldo_anterior: false,
        })
        break
      }

      case 'subtotal':
        if (!cuentaActual) break
        subtotales.push({
          cod_cliente: cuentaActual.cod_cliente,
          vencido: toNumber(row[2]),
          a_vencer: toNumber(row[3]),
          total: toNumber(row[4]),
        })
        cuentaActual = null // cierra la cuenta actual
        break

      case 'total_general':
        totalGeneral = {
          vencido: toNumber(row[1]),
          aVencer: toNumber(row[2]),
          total: toNumber(row[3]),
        }
        break

      case 'ignorada':
      default:
        break
    }
  }

  const sumaVencido = subtotales.reduce((acc, s) => acc + s.vencido, 0)
  const sumaAVencer = subtotales.reduce((acc, s) => acc + s.a_vencer, 0)
  const sumaTotal = subtotales.reduce((acc, s) => acc + s.total, 0)

  const desbalance: Desbalance[] = []
  if (totalGeneral) {
    if (!aproxIgual(sumaVencido, totalGeneral.vencido)) {
      desbalance.push({ campo: 'vencido', sumaSubtotales: sumaVencido, totalGeneral: totalGeneral.vencido, diferencia: sumaVencido - totalGeneral.vencido })
    }
    if (!aproxIgual(sumaAVencer, totalGeneral.aVencer)) {
      desbalance.push({ campo: 'a_vencer', sumaSubtotales: sumaAVencer, totalGeneral: totalGeneral.aVencer, diferencia: sumaAVencer - totalGeneral.aVencer })
    }
    if (!aproxIgual(sumaTotal, totalGeneral.total)) {
      desbalance.push({ campo: 'total', sumaSubtotales: sumaTotal, totalGeneral: totalGeneral.total, diferencia: sumaTotal - totalGeneral.total })
    }
  }

  const reconcilia = totalGeneral !== null && desbalance.length === 0

  return {
    periodoDesde,
    periodoHasta,
    fechaCorte,
    comprobantes,
    subtotales,
    totalGeneral,
    reconcilia,
    desbalance,
  }
}
