// Entrada de DNI en el escáner (fallback sin QR e invitados).
//
// El teclado `number-pad` de iOS no tiene tecla Enter, así que
// `onSubmitEditing` nunca se disparaba: el DNI se envía solo al completarse.
// Con 8 dígitos al instante; con 7 tras una pausa, porque puede ser un DNI de
// 8 a medio tipear (los DNI viejos tienen 7). Lógica pura (entradaDni.check.ts).

import type { ScanResult } from './veredictoScan'

// Lo máximo que acepta socios-qr (6 a 9 dígitos).
export const DNI_MAX_DIGITOS = 9

// Pausa sin tipear antes de enviar un DNI de 7 dígitos.
export const PAUSA_DNI_7_MS = 1500

// Sólo dígitos: "12.345.678" (o pegado con espacios) → "12345678".
export function normalizarDni(texto: string): string {
  return texto.replace(/\D/g, '').slice(0, DNI_MAX_DIGITOS)
}

export type AccionDni = 'enviar' | 'esperar' | 'nada'

// Qué hacer con un DNI ya normalizado mientras se tipea.
export function accionDni(dni: string): AccionDni {
  if (dni.length === 8) return 'enviar'
  if (dni.length === 7) return 'esperar'
  return 'nada'
}

// Tras el resultado de una consulta por DNI: un error de red vuelve al
// formulario con el DNI cargado para reintentar; cualquier otro resultado
// (pasa o no pasa) cierra el formulario y lo limpia.
export function volverAlFormularioDni(result: ScanResult): boolean {
  return result.errorRed === true
}
