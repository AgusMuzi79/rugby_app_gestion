// Validación y normalización PURAS del calendario del gimnasio (sin Deno, sin red, sin imports),
// para poder probarlas con node/tsx: `npx --yes tsx supabase/functions/_shared/calendario.check.ts`.
// La usa la Edge Function `gimnasio-turnos-admin` (acción `franjas-importar`) antes de llamar a la RPC
// `gimnasio_importar_franjas`, que vuelve a validar todo del lado de la base.

export const CUPO_MAX = 500
export const PROFESOR_MAX = 80
export const IMPORT_MAX_FILAS = 300
export const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d(:00)?$/
// Huella del plan que devuelve la RPC: md5 en hexadecimal.
export const PLAN_HASH_RE = /^[0-9a-f]{32}$/

export function hhmm(hora: string): string {
  return hora.slice(0, 5)
}

// 'HH:MM' o 'HH:MM:00' => 'HH:MM:00'
export function normalizarHora(h: unknown): string | null {
  if (typeof h !== 'string' || !HORA_RE.test(h)) return null
  return `${h.slice(0, 5)}:00`
}

export function esEntero(n: unknown, min: number, max: number): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max
}

// Profesor: texto libre opcional. Se recorta; vacío o null => null; más de PROFESOR_MAX => inválido.
// `undefined` (campo ausente) se distingue antes de llamar: acá sólo llegan valores presentes.
export function normalizarProfesor(p: unknown): { valor: string | null } | { error: string } {
  if (p === null) return { valor: null }
  if (typeof p !== 'string') return { error: 'El profesor debe ser un texto.' }
  const t = p.trim()
  if (t.length > PROFESOR_MAX) return { error: `El profesor no puede superar ${PROFESOR_MAX} caracteres.` }
  return { valor: t === '' ? null : t }
}

export interface FilaImportacion {
  dia_semana: number
  hora_desde: string // 'HH:MM'
  hora_hasta: string // 'HH:MM'
  cupo: number
  profesor: string | null
}

export type ValidacionImportacion =
  | {
      ok: true
      modo: 'agregar' | 'reemplazar'
      soloVistaPrevia: boolean
      // Sólo al aplicar (solo_vista_previa = false); null en la vista previa.
      planHash: string | null
      filas: FilaImportacion[]
    }
  | {
      ok: false
      motivo: string
      codigo?: string
      // fila = posición 1-based en `filas`, la misma numeración que usa la RPC.
      errores?: { fila: number; motivo: string }[]
    }

// Valida el body de `franjas-importar`. Orden: modo, solo_vista_previa, plan_hash, cantidad de filas
// y, por último, el tipo de CADA campo de cada fila (todos los errores juntos). Los campos que no son
// del contrato se descartan y 'HH:MM:SS' se recorta a 'HH:MM'.
export function validarImportacion(body: Record<string, unknown>): ValidacionImportacion {
  if (body.modo !== 'agregar' && body.modo !== 'reemplazar') {
    return { ok: false, motivo: 'El modo debe ser "agregar" o "reemplazar".' }
  }
  if (body.solo_vista_previa !== undefined && typeof body.solo_vista_previa !== 'boolean') {
    return { ok: false, motivo: 'El campo "solo_vista_previa" es inválido.' }
  }
  const soloVistaPrevia = body.solo_vista_previa === true

  // plan_hash: obligatorio al aplicar (es la huella de la vista previa que el usuario revisó) y
  // prohibido en la vista previa (no tiene sentido y delataría un cliente confundido).
  let planHash: string | null = null
  const ph = body.plan_hash
  if (soloVistaPrevia) {
    if (ph !== undefined && ph !== null) {
      return { ok: false, motivo: 'La vista previa no lleva "plan_hash".', codigo: 'plan_hash' }
    }
  } else {
    if (typeof ph !== 'string' || !PLAN_HASH_RE.test(ph)) {
      return {
        ok: false,
        motivo: 'Falta la vista previa del calendario: volvé a hacerla antes de confirmar.',
        codigo: 'plan_hash',
      }
    }
    planHash = ph
  }

  const filasRaw = body.filas
  if (!Array.isArray(filasRaw) || filasRaw.length === 0) {
    return { ok: false, motivo: 'El calendario no tiene filas.' }
  }
  if (filasRaw.length > IMPORT_MAX_FILAS) {
    return { ok: false, motivo: `El calendario no puede tener más de ${IMPORT_MAX_FILAS} filas.` }
  }

  const errores: { fila: number; motivo: string }[] = []
  const filas: FilaImportacion[] = []
  filasRaw.forEach((raw: unknown, i: number) => {
    const fila = i + 1
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      errores.push({ fila, motivo: 'La fila no es válida.' })
      return
    }
    const r = raw as Record<string, unknown>
    let ok = true
    if (!esEntero(r.dia_semana, 1, 7)) {
      ok = false
      errores.push({ fila, motivo: 'El día debe ser de 1 (lunes) a 7 (domingo).' })
    }
    const desde = normalizarHora(r.hora_desde)
    const hasta = normalizarHora(r.hora_hasta)
    if (!desde) { ok = false; errores.push({ fila, motivo: 'La hora de inicio debe tener formato HH:MM.' }) }
    if (!hasta) { ok = false; errores.push({ fila, motivo: 'La hora de fin debe tener formato HH:MM.' }) }
    if (desde && hasta && desde >= hasta) {
      ok = false
      errores.push({ fila, motivo: 'La hora de inicio debe ser anterior a la de fin.' })
    }
    if (!esEntero(r.cupo, 1, CUPO_MAX)) {
      ok = false
      errores.push({ fila, motivo: `El cupo debe ser un número entero entre 1 y ${CUPO_MAX}.` })
    }
    let profesor: string | null = null
    if (r.profesor !== undefined) {
      const p = normalizarProfesor(r.profesor)
      if ('error' in p) { ok = false; errores.push({ fila, motivo: p.error }) } else profesor = p.valor
    }
    if (ok) {
      filas.push({
        dia_semana: r.dia_semana as number,
        hora_desde: hhmm(desde as string),
        hora_hasta: hhmm(hasta as string),
        cupo: r.cupo as number,
        profesor,
      })
    }
  })
  if (errores.length > 0) {
    return { ok: false, motivo: 'El calendario tiene errores; no se importó nada.', codigo: 'errores', errores }
  }

  return { ok: true, modo: body.modo, soloVistaPrevia, planHash, filas }
}
