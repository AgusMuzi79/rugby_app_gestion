// Fechas de calendario (YYYY-MM-DD) en la hora local del teléfono.
//
// `new Date().toISOString().split('T')[0]` da la fecha UTC: después de las
// 21 h de Argentina ya es "mañana", así que la asistencia caía en el día
// siguiente y se creaba un evento fantasma. Para columnas `date` (fecha de un
// evento, de una asistencia) usar esto; para `timestamptz` (created_at) sí va
// toISOString(). Lógica pura (fecha.check.ts).

export function fechaLocal(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Hoy (o `base`) más `dias` días, en fecha local. Negativo = hacia atrás.
export function fechaLocalMasDias(dias: number, base: Date = new Date()): string {
  return fechaLocal(new Date(base.getFullYear(), base.getMonth(), base.getDate() + dias))
}
