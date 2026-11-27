import { formatMonto } from './formatoMonto'
import { normalizarDni } from './entradaDni'
import {
  validarInvitado,
  type Cancha, type CargoJugador, type ItemGrilla, type JugadorEntrada, type JugadorPrecargado, type Modalidad,
} from './tenis'

// Lógica pura del formulario de reserva del socio y de la tarjeta del canchero
// (paridad del módulo de tenis): comentario, "Socio a designar", invitado sólo con
// nombre y apellido, cotización antes de confirmar, saldo del check-in,
// canchas libres para una extensión y novedades de tenis. Verificado en
// tenisReserva.check.ts.

// ─── Comentario ───────────────────────────────────────────────────────────────

export const COMENTARIO_MAX = 280

// Lo que se manda en `p_comentario`: recortado, null si quedó vacío.
export function normalizarComentario(t: string | null | undefined): string | null {
  const limpio = (t ?? '').trim().slice(0, COMENTARIO_MAX)
  return limpio === '' ? null : limpio
}

// ─── Socio a designar ─────────────────────────────────────────────────────────

export const NOMBRE_A_DESIGNAR = 'Socio a designar'

export function esEntradaADesignar(e: JugadorEntrada): boolean {
  return 'a_designar' in e && e.a_designar === true
}

// Un lugar "Socio a designar" con una clave que no está entre las ya usadas
// (puede haber varios en dobles).
export function elegidoADesignar(claves: string[]): JugadorPrecargado {
  let n = 0
  while (claves.includes(`designar:${n}`)) n++
  return { clave: `designar:${n}`, nombre: NOMBRE_A_DESIGNAR, entrada: { a_designar: true } }
}

// ─── Invitado ─────────────────────────────────────────────────────────────────

// Invitado con DNI (como siempre) o, con `dniOpcional` (reservas del socio y
// del staff), sólo con nombre y apellido. La clave evita repetirlo.
export function elegidoInvitado(
  inv: { dni: string; nombre: string; apellido: string },
  excluir: string[],
  opciones: { dniOpcional?: boolean } = {},
): { ok: true; elegido: JugadorPrecargado } | { ok: false; mensaje: string } {
  const nombre = inv.nombre.trim()
  const apellido = inv.apellido.trim()
  const dni = normalizarDni(inv.dni)
  const sinDni = dni === '' && (opciones.dniOpcional ?? true)
  if (sinDni) {
    if (!nombre || !apellido) return { ok: false, mensaje: 'Completá nombre y apellido del invitado.' }
  } else {
    const falla = validarInvitado({ dni, nombre, apellido })
    if (falla) return { ok: false, mensaje: falla }
  }
  const clave = sinDni ? `nom:${`${nombre} ${apellido}`.toLowerCase()}` : `dni:${dni}`
  if (excluir.includes(clave)) return { ok: false, mensaje: 'Ese invitado ya está en la reserva.' }
  return {
    ok: true,
    elegido: {
      clave,
      nombre: `${nombre} ${apellido} (invitado)`,
      entrada: sinDni ? { invitado: { nombre, apellido } } : { invitado: { dni, nombre, apellido } },
    },
  }
}

// ─── Cotización (tenis_cotizar) ───────────────────────────────────────────────

export interface Cotizacion {
  jugadores: CargoJugador[]
  total:     number
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function numero(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}
function texto(v: unknown): string | null {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : null
}

export function parsearCotizacion(raw: unknown): Cotizacion | null {
  if (!esObjeto(raw) || !Array.isArray(raw.jugadores)) return null
  return {
    jugadores: raw.jugadores.filter(esObjeto).map(j => ({
      nombre: texto(j.nombre) ?? '—',
      cargo:  numero(j.cargo),
      motivo: texto(j.motivo ?? j.motivo_cargo),
    })),
    total: numero(raw.total),
  }
}

// Identifica un pedido de cotización: si no cambió, no se vuelve a pedir.
export function claveCotizacion(a: {
  canchaId: string; inicio: string; modalidad: Modalidad; jugadores: JugadorEntrada[]; reservaId: string | null
  titularSocioId?: string | null
}): string {
  return JSON.stringify([a.canchaId, a.inicio, a.modalidad, a.jugadores, a.reservaId, a.titularSocioId ?? null])
}

// Reserva telefónica: se cotiza sólo con un titular socio del padrón
// (tenis_cotizar recibe su socio_id); un titular invitado no se cotiza.
export function titularSocioCotizable(e: JugadorEntrada | null | undefined): string | null {
  return e && 'socio_id' in e && typeof e.socio_id === 'string' && e.socio_id ? e.socio_id : null
}

// ─── Saldo del check-in (canchero) ────────────────────────────────────────────

export interface EtiquetaSaldo {
  texto: string
  tono:  'debe' | 'favor' | 'info'
}

export function etiquetasSaldo(j: {
  pendiente: number; diferencia: number; cargo_no_show: number; cargo_no_show_cobrado: boolean
}): EtiquetaSaldo[] {
  const out: EtiquetaSaldo[] = []
  if (j.pendiente > 0) out.push({ texto: `Debe ${formatMonto(j.pendiente)}`, tono: 'debe' })
  if (j.diferencia < 0) out.push({ texto: `Saldo a favor ${formatMonto(-j.diferencia)}`, tono: 'favor' })
  if (j.cargo_no_show > 0) {
    out.push(j.cargo_no_show_cobrado
      ? { texto: `No-show ${formatMonto(j.cargo_no_show)} · cobrado`, tono: 'info' }
      : { texto: `No-show ${formatMonto(j.cargo_no_show)} · sin cobrar`, tono: 'debe' })
  }
  return out
}

// Después de marcar el cobro en la tarjeta (sin volver a consultar, que
// registraría otro ingreso): lo cobrado pasa a ser el cargo y lo pendiente
// baja en lo que se acaba de cobrar (el cargo entero o la diferencia).
export function jugadorTrasCobro<T extends {
  cargo: number; cobrado: boolean; monto_cobrado: number | null; diferencia: number; pendiente: number
}>(j: T): T {
  const cobradoAhora = j.cobrado ? Math.max(j.diferencia, 0) : j.cargo
  return { ...j, cobrado: true, monto_cobrado: j.cargo, diferencia: 0, pendiente: Math.max(0, j.pendiente - cobradoAhora) }
}

// Después de cobrar un lugar "Socio a designar" del titular: queda cobrado y
// su pendiente sale del total del titular.
export function aDesignarTrasCobro<T extends {
  pendiente: number; a_designar: { jugador_id: string; cargo: number; cobrado: boolean; pendiente: number }[]
}>(j: T, jugadorId: string): T {
  const a = j.a_designar.find(x => x.jugador_id === jugadorId)
  if (!a) return j
  return {
    ...j,
    pendiente: Math.max(0, j.pendiente - a.pendiente),
    a_designar: j.a_designar.map(x => x.jugador_id === jugadorId ? { ...x, cobrado: true, pendiente: 0 } : x),
  }
}

// ─── Extensión en otra cancha ─────────────────────────────────────────────────

const NO_OCUPAN = ['cancelada', 'vencida']

// Canchas sin reservas ni bloques en [desde, hasta). Un bloque sin cancha
// (de todas) las ocupa a todas.
export function canchasLibresExtension(
  items: Pick<ItemGrilla, 'cancha_id' | 'inicio' | 'fin' | 'estado'>[],
  canchas: Cancha[],
  desde: string,
  hasta: string,
): Cancha[] {
  const a = Date.parse(desde)
  const b = Date.parse(hasta)
  const pisan = items.filter(i => !NO_OCUPAN.includes(i.estado ?? '') && Date.parse(i.inicio) < b && a < Date.parse(i.fin))
  if (pisan.some(i => i.cancha_id === null)) return []
  return canchas.filter(c => !pisan.some(i => i.cancha_id === c.id))
}

// ─── Novedades de tenis (tenis_novedades_listar) ──────────────────────────────

export interface NovedadTenis {
  id:         string
  titulo:     string
  texto:      string
  destacada:  boolean
  created_at: string | null
}

// Destacadas primero; dentro de cada grupo, las más nuevas arriba.
export function parsearNovedades(raw: unknown): NovedadTenis[] {
  const lista = Array.isArray(raw) ? raw : esObjeto(raw) && Array.isArray(raw.items) ? raw.items : []
  return lista.filter(esObjeto).flatMap(o => {
    const id = texto(o.id)
    if (!id) return []
    return [{
      id,
      titulo:     texto(o.titulo) ?? '',
      texto:      texto(o.texto) ?? '',
      destacada:  o.destacada === true,
      created_at: texto(o.created_at),
    } satisfies NovedadTenis]
  }).sort((x, y) => {
    if (x.destacada !== y.destacada) return x.destacada ? -1 : 1
    return (y.created_at ?? '').localeCompare(x.created_at ?? '')
  })
}
