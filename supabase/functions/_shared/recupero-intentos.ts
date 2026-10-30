// Límite propio de pedidos de recupero de contraseña (login-dni, action 'reset').
// Lógica pura (recupero-intentos.check.ts); el conteo atómico vive en la base
// (registrar_intento_recupero, migración 20261107000000).
//
// Todos los pedidos le llegan a GoTrue desde la IP de login-dni, así que el
// límite de GoTrue es uno solo para todo el club: hace falta uno propio por
// identificador y por cliente. Pasado el límite la respuesta sigue siendo la
// genérica { ok: true } y no se manda nada: ni oráculo ni lluvia de mails.
//
// Límites:
// - 1 por identificador cada 60 s: un doble toque o un reintento impaciente
//   no manda dos mails (el link anterior sigue sirviendo).
// - 3 por identificador por hora: alcanza para "no me llegó, lo pido de nuevo"
//   y corta a quien quiera llenarle la casilla a otro.
// - 20 por IP por hora: una familia o la red del club comparten IP; 20 cubre
//   a varios socios y frena a quien recorre DNIs de a uno.
//
// Las claves son hashes sha-256: la tabla nunca guarda DNIs, mails ni IPs.

import type { Identificador } from './login-identificador.ts'

type Limite = { ventanaSegundos: number; maximo: number }

export const LIMITES_RECUPERO: { identificador: Limite[]; ip: Limite } = {
  identificador: [
    { ventanaSegundos: 60, maximo: 1 },
    { ventanaSegundos: 3600, maximo: 3 },
  ],
  ip: { ventanaSegundos: 3600, maximo: 20 },
}

export type ClaveRecupero = { clave: string; ventana: string; maximo: number }

async function sha256Hex(texto: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

// IP del cliente: la primera entrada de x-forwarded-for. null si no viene.
export function ipCliente(xForwardedFor: string | null | undefined): string | null {
  const primera = (xForwardedFor ?? '').split(',')[0].trim()
  return primera || null
}

function clave(prefijo: string, limite: Limite, hash: string): ClaveRecupero {
  return {
    // Una fila por ventana: la tabla guarda un solo conteo por clave.
    clave: `${prefijo}:${limite.ventanaSegundos}:${hash}`,
    ventana: `${limite.ventanaSegundos} seconds`,
    maximo: limite.maximo,
  }
}

// Claves a registrar para un pedido: las del identificador (normalizado, con
// su tipo para que un DNI y un mail iguales no se pisen) y, si se conoce, la
// de la IP.
export async function clavesRecupero(identificador: Identificador, ip: string | null): Promise<ClaveRecupero[]> {
  const texto = identificador.tipo === 'dni' ? `dni:${identificador.dni}` : `email:${identificador.email}`
  const hashId = await sha256Hex(texto)
  const claves = LIMITES_RECUPERO.identificador.map((l) => clave('id', l, hashId))
  if (ip) claves.push(clave('ip', LIMITES_RECUPERO.ip, await sha256Hex(ip)))
  return claves
}

// Resultado de cada registrar_intento_recupero: true = permitido, false =
// pasado del límite, 'error' = la base no respondió.
export function decisionRecupero(resultados: (boolean | 'error')[]): 'enviar' | 'limitado' | 'error' {
  if (resultados.includes('error')) return 'error'
  if (resultados.includes(false)) return 'limitado'
  return 'enviar'
}
