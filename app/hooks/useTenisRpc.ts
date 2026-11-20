import { supabase } from '@/lib/supabase'
import { cuerpoErrorFunction, mensajeErrorFunction, SIN_CONEXION } from '@/lib/errorFunction'
import { mensajeErrorTenis } from '@/lib/tenis'

// Acceso a los RPC y a la Edge Function `tenis-gestion` de reservas de tenis
// (contrato en odd/tasks/reservas-tenis.md). Los RPC todavía no están en
// lib/database.types.ts (los agrega la migración 20261112000000): se llaman sin
// tipos y cada hook parsea la respuesta con los parsers de lib/tenis.ts.
// Al regenerar los tipos, esto puede pasar a `supabase.rpc` tipado.

export type ResultadoTenis<T> = { ok: true; data: T } | { ok: false; mensaje: string }

type RpcSinTipos = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>

const rpcSinTipos = supabase.rpc.bind(supabase) as unknown as RpcSinTipos

export const ERROR_TENIS = 'No se pudo completar la operación. Probá de nuevo en un rato.'
export const ERROR_CARGA_TENIS = 'No se pudo cargar la información de las canchas. Probá de nuevo en un rato.'

export async function rpcTenis(
  fn: string,
  args: Record<string, unknown> = {},
  porDefecto: string = ERROR_TENIS,
): Promise<ResultadoTenis<unknown>> {
  try {
    const { data, error } = await rpcSinTipos(fn, args)
    if (error) return { ok: false, mensaje: mensajeErrorTenis(error, porDefecto) }
    return { ok: true, data }
  } catch (e) {
    return { ok: false, mensaje: mensajeErrorTenis(e, porDefecto) }
  }
}

// `tenis-gestion`: acciones que además de un RPC mandan mail o push
// (resolver-comprobante, bloqueo-puntual) o firman la imagen (ver-comprobante).
// Un error trae `{ codigo }` (se traduce) o `{ error }` en el body.
export async function gestionTenis(
  body: Record<string, unknown>,
  porDefecto: string = ERROR_TENIS,
): Promise<ResultadoTenis<Record<string, unknown>>> {
  try {
    const { data, error } = await supabase.functions.invoke('tenis-gestion', { body })
    if (error) {
      if ((error as { name?: string }).name === 'FunctionsFetchError') return { ok: false, mensaje: SIN_CONEXION }
      const cuerpo = await cuerpoErrorFunction(error)
      if (typeof cuerpo?.codigo === 'string') return { ok: false, mensaje: mensajeErrorTenis(cuerpo, porDefecto) }
      return { ok: false, mensaje: await mensajeErrorFunction(error, porDefecto) }
    }
    const d = data && typeof data === 'object' ? data as Record<string, unknown> : {}
    if (d.ok === false) {
      return { ok: false, mensaje: typeof d.codigo === 'string' ? mensajeErrorTenis(d, porDefecto) : porDefecto }
    }
    return { ok: true, data: d }
  } catch {
    return { ok: false, mensaje: porDefecto }
  }
}
