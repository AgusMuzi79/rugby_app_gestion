// Reglas puras del aviso push de una noticia (notifications → noticia_publicada).
// Se chequean con aviso-noticia.check.ts. El aviso sale una sola vez por
// noticia: el RPC reclamar_aviso_noticia (migración 20261030000000) marca
// noticias.notificada_at de forma atómica y sólo con 'reclamada' se manda.

export type EstadoReclamo = 'reclamada' | 'ya_notificada' | 'no_publicada' | 'no_existe'

const ESTADOS: readonly EstadoReclamo[] = ['reclamada', 'ya_notificada', 'no_publicada', 'no_existe']

export function leerEstadoReclamo(valor: unknown): EstadoReclamo | null {
  return typeof valor === 'string' && (ESTADOS as readonly string[]).includes(valor)
    ? valor as EstadoReclamo
    : null
}

// El push no le llegó a nadie aunque había a quién mandarlo: se libera la
// marca para que volver a publicar lo reintente. Si salió aunque sea uno, la
// marca queda (reintentar le repetiría el aviso a quien ya lo recibió).
export function pushFalloEntero(resumen: { tokensValidos: number; ok: number }): boolean {
  return resumen.tokensValidos > 0 && resumen.ok === 0
}
