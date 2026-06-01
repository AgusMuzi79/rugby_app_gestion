// TOTP (RFC 6238) — generación y verificación de códigos de 6 dígitos.
// Secreto: 20 bytes aleatorios en base32 (160 bits, estándar de la industria).
// Ventana: 30 segundos. Deriva admitida: ±1 step para compensar desfase de reloj.

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

export async function verifyTOTP(secret: string, code: string, drift = 1): Promise<boolean> {
  const step = Math.floor(Date.now() / 1000 / 30)
  for (let i = -drift; i <= drift; i++) {
    if (await compute(secret, step + i) === code) return true
  }
  return false
}
