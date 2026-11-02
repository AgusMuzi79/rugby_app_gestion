// Límite propio de pedidos de recupero de contraseña (login-dni, action 'reset').
// Lógica pura (recupero-intentos.check.ts); el conteo atómico vive en la base
// (registrar_intento_recupero, migración 20261107000000).
//
// Todos los pedidos le llegan a GoTrue desde la IP de login-dni, así que el
// límite de GoTrue es uno solo para todo el club: hace falta uno propio por
// identificador y por cliente. Pasado el límite la respuesta sigue siendo la
// genérica { ok: true } y no se manda nada: ni oráculo ni lluvia de mails.
//
// Límites, evaluados en este orden (la base corta en el primero que rechaza,
// así un pedido frenado por la ventana corta no gasta las largas):
// - 1 por identificador cada 60 s: un doble toque o un reintento impaciente
//   no manda dos mails (el link anterior sigue sirviendo).
// - 3 por identificador por hora: alcanza para "no me llegó, lo pido de nuevo"
//   y corta a quien quiera llenarle la casilla a otro.
// - 20 por IP por hora: una familia o la red del club comparten IP; 20 cubre
//   a varios socios y frena a quien recorre DNIs de a uno.
//
// Las claves son HMAC-SHA-256 con una clave del servidor (claveHmacRecupero):
// la tabla nunca guarda DNIs, mails ni IPs recuperables. Un sha-256 sin clave
// no alcanzaba: los DNIs son pocos y se prueban todos en segundos.

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

// Clave del HMAC: el secret propio RECUPERO_HMAC_KEY (supabase secrets set
// RECUPERO_HMAC_KEY=...), o la service role key si no está cargado (siempre
// existe en las Edge Functions y nunca sale del servidor). Rotar cualquiera de
// las dos cambia todas las claves y reinicia los conteos: es inofensivo (como
// mucho, alguien puede pedir un link más en esa hora). null = ninguna.
export function claveHmacRecupero(env: (nombre: string) => string | undefined): string | null {
  return env('RECUPERO_HMAC_KEY') || env('SUPABASE_SERVICE_ROLE_KEY') || null
}

async function hmacHex(claveHmac: string, texto: string): Promise<string> {
  const codificar = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', codificar.encode(claveHmac), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const firma = await crypto.subtle.sign('HMAC', key, codificar.encode(texto))
  return Array.from(new Uint8Array(firma), (b) => b.toString(16).padStart(2, '0')).join('')
}

// IP del cliente, o null si no se puede saber. `header` = req.headers.get.
// - cf-connecting-ip: Supabase está detrás de Cloudflare, que pone ahí la IP
//   desde la que le abrieron la conexión y pisa cualquier valor que mande el
//   cliente (el gateway de Supabase lo registra en sus logs).
// - Si no viene, la ÚLTIMA entrada de x-forwarded-for: cada proxy agrega la
//   IP que lo llamó al final, así que la última la puso la plataforma. La
//   primera (la que usan los ejemplos de Supabase) la escribe el cliente:
//   cambiándola en cada pedido esquivaba el límite por IP.
export function ipCliente(header: (nombre: string) => string | null): string | null {
  const cf = (header('cf-connecting-ip') ?? '').trim()
  if (cf) return cf
  const ultima = (header('x-forwarded-for') ?? '').split(',').pop()?.trim()
  return ultima || null
}

function clave(prefijo: string, limite: Limite, hash: string): ClaveRecupero {
  return {
    // Una fila por ventana: la tabla guarda un solo conteo por clave.
    clave: `${prefijo}:${limite.ventanaSegundos}:${hash}`,
    ventana: `${limite.ventanaSegundos} seconds`,
    maximo: limite.maximo,
  }
}

// Claves a registrar para un pedido, en el orden en que se evalúan: las del
// identificador (normalizado, con su tipo para que un DNI y un mail iguales no
// se pisen) y, si se conoce, la de la IP.
export async function clavesRecupero(
  identificador: Identificador,
  ip: string | null,
  claveHmac: string,
): Promise<ClaveRecupero[]> {
  const texto = identificador.tipo === 'dni' ? `dni:${identificador.dni}` : `email:${identificador.email}`
  const hashId = await hmacHex(claveHmac, texto)
  const claves = LIMITES_RECUPERO.identificador.map((l) => clave('id', l, hashId))
  if (ip) claves.push(clave('ip', LIMITES_RECUPERO.ip, await hmacHex(claveHmac, `ip:${ip}`)))
  return claves
}

// Parámetros de registrar_intento_recupero: tres arrays paralelos, en orden.
export function parametrosLimite(claves: ClaveRecupero[]) {
  return {
    p_claves: claves.map((c) => c.clave),
    p_ventanas: claves.map((c) => c.ventana),
    p_maximos: claves.map((c) => c.maximo),
  }
}

// Resultado de registrar_intento_recupero: 0 = todas pasaron; i = la i-ésima
// clave (desde 1) rechazó y las siguientes ni se contaron; 'error' = la base
// no respondió. Cualquier otra cosa también es error. El aviso (para el log)
// lleva sólo la clave hasheada y la ventana.
export function decisionRecupero(
  resultado: unknown,
  claves: ClaveRecupero[],
): { decision: 'enviar' | 'limitado' | 'error'; aviso: string | null } {
  if (resultado === 0) return { decision: 'enviar', aviso: null }
  if (typeof resultado === 'number' && Number.isInteger(resultado) && resultado >= 1 && resultado <= claves.length) {
    const { clave: c, ventana } = claves[resultado - 1]
    return { decision: 'limitado', aviso: `login-dni reset: limitado (clave=${c}, ventana=${ventana})` }
  }
  return { decision: 'error', aviso: null }
}
