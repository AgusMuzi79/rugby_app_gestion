// TOTP RFC 6238 — pure JS, no crypto.subtle (Hermes/React Native compatible).
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

function sha1(data: Uint8Array): Uint8Array {
  let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0
  const msgLen = data.length
  const padLen = msgLen % 64 < 56 ? 56 - msgLen % 64 : 120 - msgLen % 64
  const padded = new Uint8Array(msgLen + padLen + 8)
  padded.set(data)
  padded[msgLen] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 4, (msgLen * 8) >>> 0)
  for (let i = 0; i < padded.length; i += 64) {
    const w = new Array(80) as number[]
    for (let j = 0; j < 16; j++) w[j] = view.getUint32(i + j * 4)
    for (let j = 16; j < 80; j++) {
      const n = w[j-3] ^ w[j-8] ^ w[j-14] ^ w[j-16]
      w[j] = ((n << 1) | (n >>> 31)) >>> 0
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4
    for (let j = 0; j < 80; j++) {
      let f: number, k: number
      if      (j < 20) { f = (b & c) | (~b & d);           k = 0x5A827999 }
      else if (j < 40) { f = b ^ c ^ d;                    k = 0x6ED9EBA1 }
      else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC }
      else             { f = b ^ c ^ d;                    k = 0xCA62C1D6 }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[j]) >>> 0
      e = d; d = c; c = ((b << 30) | (b >>> 2)) >>> 0; b = a; a = temp
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0
  }
  const result = new Uint8Array(20)
  const rv = new DataView(result.buffer)
  rv.setUint32(0, h0); rv.setUint32(4, h1); rv.setUint32(8, h2)
  rv.setUint32(12, h3); rv.setUint32(16, h4)
  return result
}

function hmacSha1(key: Uint8Array, msg: Uint8Array): Uint8Array {
  const BLOCK = 64
  const k = key.length > BLOCK ? sha1(key) : key
  const kp = new Uint8Array(BLOCK)
  kp.set(k)
  const inner = new Uint8Array(BLOCK + msg.length)
  const outer = new Uint8Array(BLOCK + 20)
  for (let i = 0; i < BLOCK; i++) { inner[i] = kp[i] ^ 0x36; outer[i] = kp[i] ^ 0x5c }
  inner.set(msg, BLOCK)
  outer.set(sha1(inner), BLOCK)
  return sha1(outer)
}

function compute(secret: string, step: number): string {
  const msg = new Uint8Array(8)
  new DataView(msg.buffer).setUint32(4, step)
  const sig = hmacSha1(decode(secret), msg)
  const offset = sig[19] & 0xf
  const code = (
    ((sig[offset]     & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) <<  8) |
     (sig[offset + 3] & 0xff)
  ) % 1_000_000
  return code.toString().padStart(6, '0')
}

const STEP = 60

export function generateTOTP(secret: string): string {
  return compute(secret, Math.floor(Date.now() / 1000 / STEP))
}

export function secondsUntilRefresh(): number {
  return STEP - (Math.floor(Date.now() / 1000) % STEP)
}
