// TOTP RFC 6238 — client-side generation for React Native.
// Uses crypto.subtle (available in Hermes / React Native 0.74+).
// Mirrors the server-side implementation in supabase/functions/_shared/totp.ts.

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

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
  const raw = decode(secret)
  // Force a plain ArrayBuffer to satisfy SubtleCrypto types (avoids SharedArrayBuffer conflict)
  const keyData: ArrayBuffer = new Uint8Array(raw).buffer as ArrayBuffer
  const key = await crypto.subtle.importKey(
    'raw', keyData,
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

export async function generateTOTP(secret: string): Promise<string> {
  const step = Math.floor(Date.now() / 1000 / 30)
  return compute(secret, step)
}

export function secondsUntilRefresh(): number {
  return 30 - (Math.floor(Date.now() / 1000) % 30)
}
