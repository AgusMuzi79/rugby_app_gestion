// Contenido del QR del carnet: "{numero_socio}:{código TOTP de 6 dígitos}".
//
// Lo arma el carnet (useCarnet) y lo lee el escáner (useScanner), tanto desde
// la cámara como desde el modo "Ingresar código" (Nº de socio + el código
// manual del carnet, para cuando la cámara no lee el QR). Lógica pura
// (qrCarnet.check.ts).

export function contenidoQR(numeroSocio: string, code: string): string {
  return `${numeroSocio}:${code}`
}

export function parsearQR(raw: string): { numero_socio: string; code: string } | null {
  const parts = raw.split(':')
  if (parts.length !== 2 || !parts[0] || !/^\d{6}$/.test(parts[1])) return null
  return { numero_socio: parts[0], code: parts[1] }
}

// El Nº de socio es el código de cliente de NUVIX (sólo dígitos); como texto,
// así se mantienen los ceros a la izquierda.
export function normalizarNumeroSocio(texto: string): string {
  return texto.replace(/\D/g, '')
}

// El carnet muestra el código como "045 · 123": se aceptan espacios y el "·".
export function normalizarCodigo(texto: string): string {
  return texto.replace(/\D/g, '').slice(0, 6)
}

// Código manual → el mismo contenido que un QR escaneado; null si falta algo.
export function codigoManualAQR(numeroSocio: string, codigo: string): string | null {
  const n = normalizarNumeroSocio(numeroSocio)
  const c = normalizarCodigo(codigo)
  if (!n || c.length !== 6) return null
  return contenidoQR(n, c)
}
