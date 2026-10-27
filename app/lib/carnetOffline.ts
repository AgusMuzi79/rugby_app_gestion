// Carnet sin conexión.
//
// El código TOTP sale del secreto guardado en el teléfono (SecureStore), así
// que el QR puede seguir rotando cada minuto sin red. Lo que sí viene de la
// base (nombre, estado, categoría…) se guarda la última vez que se leyó bien
// (AsyncStorage, por usuario) y se muestra con "Sin conexión · estado al
// HH:MM". Una falla de red nunca reemplaza el carnet en pantalla por un error.
// Lógica pura (carnetOffline.check.ts); el hook está en hooks/useCarnet.ts.

import { generateTOTPAt } from './totp-client'
import { contenidoQR } from './qrCarnet'

// Lo que viene de la base: todo el carnet menos el código.
export interface CarnetBase {
  numero_socio: string
  nombre:       string
  estado:       string
  semaforo:     string | null
  categoria:    string
  fotoUrl:      string | null
  roles:        string[]
  division:     string | null
  deporte:      string | null
}

export interface CarnetData extends CarnetBase {
  qrContent: string
  code:      string
}

// Por usuario logueado y por carnet mirado (el propio o el de un menor a
// cargo): un teléfono compartido en la familia no mezcla carnets.
export function claveCacheCarnet(userId: string, socioId?: string): string {
  return socioId ? `carnet_cache_${userId}_${socioId}` : `carnet_cache_${userId}`
}

// El carnet con el código del minuto `ahora`, sin red. null si falta algo.
export function carnetLocal(base: CarnetBase | null, secret: string | null, ahora: number): CarnetData | null {
  if (!base || !secret) return null
  const code = generateTOTPAt(secret, ahora)
  return { ...base, code, qrContent: contenidoQR(base.numero_socio, code) }
}

// Falló la lectura de la base por la red: con un carnet en pantalla se
// queda y se avisa; sin carnet, se muestra el error.
export function trasFalloDeRed(hayCarnet: boolean): 'aviso' | 'error' {
  return hayCarnet ? 'aviso' : 'error'
}

const dos = (n: number) => String(n).padStart(2, '0')

// Hora local de la última lectura buena; con fecha si no fue hoy.
export function etiquetaSinConexion(guardadoEn: number, ahora: number = Date.now()): string {
  const g = new Date(guardadoEn)
  const a = new Date(ahora)
  const hora = `${dos(g.getHours())}:${dos(g.getMinutes())}`
  const mismoDia = g.getFullYear() === a.getFullYear() && g.getMonth() === a.getMonth() && g.getDate() === a.getDate()
  return `Sin conexión · estado al ${mismoDia ? hora : `${dos(g.getDate())}/${dos(g.getMonth() + 1)} ${hora}`}`
}

export function serializarCache(base: CarnetBase, guardadoEn: number): string {
  return JSON.stringify({ base, guardadoEn })
}

// Caché leída del almacenamiento: null si no hay o no tiene la forma esperada
// (una versión vieja o un valor roto se ignoran, no rompen el carnet).
export function parsearCache(raw: string | null): { base: CarnetBase; guardadoEn: number } | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as { base?: Partial<CarnetBase>; guardadoEn?: unknown }
    const b = v.base
    if (!b || typeof v.guardadoEn !== 'number') return null
    if (typeof b.numero_socio !== 'string' || typeof b.nombre !== 'string' || typeof b.estado !== 'string'
      || typeof b.categoria !== 'string' || !Array.isArray(b.roles)) return null
    return {
      base: {
        numero_socio: b.numero_socio,
        nombre:       b.nombre,
        estado:       b.estado,
        semaforo:     b.semaforo ?? null,
        categoria:    b.categoria,
        fotoUrl:      b.fotoUrl ?? null,
        roles:        b.roles,
        division:     b.division ?? null,
        deporte:      b.deporte ?? null,
      },
      guardadoEn: v.guardadoEn,
    }
  } catch {
    return null
  }
}
