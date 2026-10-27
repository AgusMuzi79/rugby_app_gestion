// Entrada de DNI en el escáner (fallback sin QR e invitados).
//
// El teclado `number-pad` de iOS no tiene tecla Enter, así que
// `onSubmitEditing` nunca se disparaba: se consulta con el botón CONSULTAR.
// No hay envío automático por largo: un DNI a medio tipear (7 de 8 dígitos,
// u 8 de 9) puede ser el de otro socio. Lógica pura (entradaDni.check.ts).

import type { ScanResult } from './veredictoScan'

// Lo máximo que acepta socios-qr (6 a 9 dígitos).
export const DNI_MAX_DIGITOS = 9

// Sólo dígitos: "12.345.678" (o pegado con espacios) → "12345678".
export function normalizarDni(texto: string): string {
  return texto.replace(/\D/g, '').slice(0, DNI_MAX_DIGITOS)
}

// Tras el resultado de una consulta por DNI: un error de red vuelve al
// formulario con el DNI cargado para reintentar; cualquier otro resultado
// (pasa o no pasa) cierra el formulario y lo limpia.
export function volverAlFormularioDni(result: ScanResult): boolean {
  return result.errorRed === true
}
