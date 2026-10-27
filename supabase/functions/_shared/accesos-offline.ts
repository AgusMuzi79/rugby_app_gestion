// Escaneos que la tablet registró SIN CONEXIÓN (dejó pasar y encoló) y manda
// después a socios-qr (acción registrar-offline), que los valida a posteriori.
// Lógica pura (accesos-offline.check.ts).

import { normalizarDni } from './login-identificador.ts'

// Ítems por llamada: la tablet manda de a tandas.
export const MAX_LOTE_OFFLINE = 50

// Más viejo que esto no se acepta: una cola olvidada en una tablet no puede
// cargar ingresos de hace semanas.
export const MAX_ANTIGUEDAD_OFFLINE_MS = 7 * 24 * 60 * 60 * 1000

// Desfase de reloj tolerado entre la tablet y el servidor.
export const TOLERANCIA_FUTURO_MS = 5 * 60 * 1000

// Un ingreso en línea del mismo socio dentro de esta ventana es el mismo
// escaneo (la tablet se cortó por timeout pero el servidor ya lo registró).
export const VENTANA_DUPLICADO_MS = 2 * 60 * 1000

const ID_COLA = /^[A-Za-z0-9-]{1,64}$/

interface ItemBase {
  id_cola:      string
  escaneado_en: string
  instante:     number
}

export type ItemOffline =
  | (ItemBase & { tipo: 'qr'; numero_socio: string; code: string })
  | (ItemBase & { tipo: 'dni'; dni: string })

export type LecturaItem =
  | { ok: true; item: ItemOffline }
  | { ok: false; id_cola: string | null; motivo: string }

export function leerItemOffline(raw: unknown, ahora: number): LecturaItem {
  if (!raw || typeof raw !== 'object') return { ok: false, id_cola: null, motivo: 'Ítem inválido' }
  const r = raw as Record<string, unknown>
  const id = typeof r.id_cola === 'string' && ID_COLA.test(r.id_cola) ? r.id_cola : null
  const falla = (motivo: string): LecturaItem => ({ ok: false, id_cola: id, motivo })
  if (!id) return falla('Ítem sin identificador válido')

  const escaneado = typeof r.escaneado_en === 'string' ? r.escaneado_en : ''
  const instante = Date.parse(escaneado)
  if (!escaneado || Number.isNaN(instante)) return falla('Hora del escaneo ilegible')
  if (instante > ahora + TOLERANCIA_FUTURO_MS) return falla('Hora del escaneo en el futuro')
  if (instante < ahora - MAX_ANTIGUEDAD_OFFLINE_MS) return falla('Escaneo de hace más de 7 días')

  const base: ItemBase = { id_cola: id, escaneado_en: escaneado, instante }

  if (r.tipo === 'qr') {
    // Mismo formato que el QR del carnet: "{numero_socio}:{6 dígitos}".
    const partes = typeof r.qr === 'string' ? r.qr.trim().split(':') : []
    if (partes.length !== 2 || !/^\d+$/.test(partes[0]) || !/^\d{6}$/.test(partes[1])) return falla('QR mal formado')
    return { ok: true, item: { ...base, tipo: 'qr', numero_socio: partes[0], code: partes[1] } }
  }

  if (r.tipo === 'dni') {
    const dni = normalizarDni(typeof r.dni === 'string' ? r.dni : '')
    if (!/^\d{6,9}$/.test(dni)) return falla('DNI inválido')
    return { ok: true, item: { ...base, tipo: 'dni', dni } }
  }

  return falla('Tipo de escaneo desconocido')
}

export function leerLoteOffline(raw: unknown): { ok: true; items: unknown[] } | { ok: false; motivo: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, motivo: 'items es requerido' }
  if (raw.length > MAX_LOTE_OFFLINE) return { ok: false, motivo: `Máximo ${MAX_LOTE_OFFLINE} ítems por envío` }
  return { ok: true, items: raw }
}
