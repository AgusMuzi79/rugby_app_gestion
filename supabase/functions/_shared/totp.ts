// TOTP (RFC 6238) — generación y verificación de códigos de 6 dígitos.
// Secreto: 20 bytes aleatorios en base32 (160 bits, estándar de la industria).
// Ventana: 60 segundos. Deriva admitida: ±1 step para compensar desfase de reloj.
// Un código vale una sola vez: socios-qr guarda el último paso usado
// (socios_secrets.ultimo_paso_usado, ver pasoUsable) y rechaza repetirlo.

export const STEP = 60

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function generateSecret(): string {
  const bytes = new Uint8Array(20)
  crypto.getRandomValues(bytes)
  return encode(bytes)
}

function encode(bytes: Uint8Array): string {
  let result = '', buf = 0, bits = 0
  for (const b of bytes) {
    buf = (buf << 8) | b
    bits += 8
    while (bits >= 5) {
      bits -= 5
      result += BASE32[(buf >> bits) & 31]
    }
  }
  if (bits > 0) result += BASE32[(buf << (5 - bits)) & 31]
  return result
}

function decode(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '')
  const out = new Uint8Array(Math.floor(clean.length * 5 / 8))
  let buf = 0, bits = 0, idx = 0
  for (const ch of clean) {
    const v = BASE32.indexOf(ch)
    if (v < 0) continue
    buf = (buf << 5) | v
    bits += 5
    if (bits >= 8) {
      bits -= 8
      out[idx++] = (buf >> bits) & 0xff
    }
  }
  return out.slice(0, idx)
}

async function compute(secret: string, step: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', decode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false, ['sign']
  )
  const msg = new ArrayBuffer(8)
  new DataView(msg).setUint32(4, step)
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg))
  const offset = sig[19] & 0xf
  const code = (
    ((sig[offset]     & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) <<  8) |
     (sig[offset + 3] & 0xff)
  ) % 1_000_000
  return code.toString().padStart(6, '0')
}

export function codigoEnPaso(secret: string, step: number): Promise<string> {
  return compute(secret, step)
}

// Paso (contador de 60 s) con el que coincide el código, o null.
export async function matchingStep(secret: string, code: string, drift = 1, now = Date.now()): Promise<number | null> {
  const step = Math.floor(now / 1000 / STEP)
  for (let i = -drift; i <= drift; i++) {
    if (await compute(secret, step + i) === code) return step + i
  }
  return null
}

export async function verifyTOTP(secret: string, code: string, drift = 1): Promise<boolean> {
  return (await matchingStep(secret, code, drift)) !== null
}

// Un paso sólo se acepta si es posterior al último usado. Misma regla que el
// UPDATE atómico de consumir_paso_totp() (migración 20261028000002).
export function pasoUsable(paso: number, ultimoUsado: number | null): boolean {
  return ultimoUsado === null || paso > ultimoUsado
}
