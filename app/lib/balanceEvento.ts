// Balance de un viaje / tercer tiempo: lo cobrado (cobranzas pagadas) menos los
// egresos cargados por el Manager (tabla egresos_evento).
// Funciones puras: las usa useEgresos y las verifica balanceEvento.check.ts.

import { montoSugeridoDe } from './montoSugerido'

// PostgREST puede devolver numeric como number o como string.
type Monto = number | string | null | undefined

export interface CobranzaBalance {
  estado: string
  monto:  Monto
}

export interface EgresoBalance {
  monto: Monto
}

export interface BalanceEvento {
  totalCobrado: number
  totalEgresos: number
  neto:         number
}

function aNumero(m: Monto): number {
  if (m == null) return 0
  const n = typeof m === 'number' ? m : parseFloat(m)
  return Number.isFinite(n) ? n : 0
}

function centavos(n: number): number {
  return Math.round(n * 100) / 100
}

export function balanceEvento(cobranzas: CobranzaBalance[], egresos: EgresoBalance[]): BalanceEvento {
  const totalCobrado = centavos(
    cobranzas.filter(c => c.estado === 'pagado').reduce((s, c) => s + aNumero(c.monto), 0),
  )
  const totalEgresos = centavos(egresos.reduce((s, e) => s + aNumero(e.monto), 0))
  return { totalCobrado, totalEgresos, neto: centavos(totalCobrado - totalEgresos) }
}

// ─── Fecha del egreso ─────────────────────────────────────────────────────────
// El formulario usa DD/MM/AAAA; la base guarda date (AAAA-MM-DD).

function dos(n: number): string {
  return String(n).padStart(2, '0')
}

export function fechaHoyEgreso(hoy: Date = new Date()): string {
  return `${dos(hoy.getDate())}/${dos(hoy.getMonth() + 1)}/${hoy.getFullYear()}`
}

export function parseFechaEgreso(texto: string): string | null {
  const t = texto.trim()
  let d: number, m: number, y: number
  const local = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t)
  const iso   = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (local)    { d = +local[1]; m = +local[2]; y = +local[3] }
  else if (iso) { y = +iso[1];   m = +iso[2];   d = +iso[3] }
  else return null

  const fecha = new Date(y, m - 1, d)
  if (fecha.getFullYear() !== y || fecha.getMonth() !== m - 1 || fecha.getDate() !== d) return null
  return `${y}-${dos(m)}-${dos(d)}`
}

// ─── Validación del formulario ────────────────────────────────────────────────

export interface EgresoForm {
  concepto: string
  monto:    string
  fecha:    string
}

export interface EgresoValido {
  concepto: string
  monto:    number
  fecha:    string  // AAAA-MM-DD
}

export type ResultadoValidacion =
  | { ok: true;  valor: EgresoValido }
  | { ok: false; error: string }

export function validarEgreso(form: EgresoForm): ResultadoValidacion {
  const concepto = form.concepto.trim()
  if (!concepto) return { ok: false, error: 'Ingresá el concepto del egreso.' }

  // Mismo formato local que el monto sugerido: "150.000", "2.500,50".
  const monto = montoSugeridoDe(form.monto)
  if (monto == null) return { ok: false, error: 'Ingresá un monto mayor a 0.' }

  const fecha = parseFechaEgreso(form.fecha)
  if (!fecha) return { ok: false, error: 'Ingresá la fecha como DD/MM/AAAA.' }

  return { ok: true, valor: { concepto, monto: centavos(monto), fecha } }
}
