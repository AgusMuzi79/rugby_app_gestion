// Bajas del import mensual del padrón (importar-socios).
//
// El preview mostraba las bajas "por ausencia" sin nombre ("—") y con el
// motivo crudo, y no había ninguna red de seguridad: un archivo equivocado o
// recortado daba de baja (ban + mail) a cientos de socios. Lógica pura
// (bajas-import.check.ts).

export type MotivoBaja = 'ausencia' | 'cesante'

export const CONFIRMACION_BAJAS = 'BAJAS'

export function etiquetaMotivoBaja(motivo: MotivoBaja): string {
  return motivo === 'cesante' ? 'Cesante en el padrón' : 'No está en el padrón'
}

// El socio que ya no está en el archivo no tiene fila: se usa el nombre del
// padrón que quedó guardado.
export function nombreBaja(nombreArchivo: string | undefined, nombrePadronGuardado: string | null): string {
  return nombreArchivo ?? nombrePadronGuardado ?? ''
}

export function umbralBajaMasiva(activos: number): number {
  return Math.max(20, Math.ceil(activos * 0.03))
}

export function esBajaMasiva(bajas: number, activos: number): boolean {
  return bajas > umbralBajaMasiva(activos)
}

export function bajaMasivaConfirmada(masiva: boolean, confirmacion: string | null): boolean {
  return !masiva || confirmacion?.trim() === CONFIRMACION_BAJAS
}
