// Guard de navegación del layout raíz (app/_layout.tsx).
//
// Antes hacía `router.replace` al inicio del rol cada vez que se refrescaba el
// token (cada hora, o al volver a la app): sacaba a la persona de lo que estaba
// haciendo (un formulario a medio cargar, un detalle abierto). Ahora decide a
// dónde tendría que estar (`destinoGuard`) y sólo redirige si no está ya ahí
// (`yaEstaEnDestino`, con los segmentos de useSegments()). Lógica pura
// (guardRaiz.check.ts).

import { ROL_RUTA_INICIAL, type Rol } from '../constants/roles'

export interface EstadoGuard {
  haySesion:           boolean
  rol:                 Rol | null
  nuevoUsuario:        boolean
  recuperandoPassword: boolean
  registroSinSesion:   boolean
  restringido:         boolean
  restringidoLoading:  boolean
  terminosPendiente:   boolean
  terminosLoading:     boolean
  mailPendiente:       boolean
  mailLoading:         boolean
}

// Ruta a la que tiene que ir la persona, o null si todavía no se sabe (algo
// está cargando) o no hay que moverla.
export function destinoGuard(e: EstadoGuard): string | null {
  if (e.nuevoUsuario && e.haySesion) return '/(auth)/registro'
  if (e.recuperandoPassword) return '/(auth)/reset-password'
  if (!e.haySesion) {
    // registro-tutor corre sin sesión y cierra la del menor restringido al
    // montarse: ese cierre no tiene que rebotarlo al login.
    return e.registroSinSesion ? null : '/(auth)/login'
  }
  if (!e.rol) return null
  if (e.restringidoLoading) return null
  if (e.restringido) return '/(auth)/acceso-restringido'
  if (e.terminosLoading) return null
  if (e.terminosPendiente) return '/(auth)/terminos'
  if (e.mailLoading) return null
  if (e.mailPendiente) return '/(auth)/registrar-mail'
  return ROL_RUTA_INICIAL[e.rol] ?? '/(auth)/login'
}

// Pantallas de auth a las que se llega desde el destino sin pasar por el guard:
// estando en ellas, la persona ya está "en" ese destino.
const PANTALLAS_EQUIVALENTES: Record<string, string[]> = {
  login:                ['login', 'forgot-password', 'registro-tutor'],
  'acceso-restringido': ['acceso-restringido', 'registro-tutor'],
}

export function yaEstaEnDestino(destino: string, segmentos: readonly string[]): boolean {
  const [, grupo, pantalla] = destino.split('/')
  if (segmentos[0] !== grupo) return false
  // Grupo de un rol: cualquier pantalla del grupo sirve.
  if (grupo !== '(auth)') return true
  const equivalentes = PANTALLAS_EQUIVALENTES[pantalla] ?? [pantalla]
  return equivalentes.includes(segmentos[1] ?? '')
}
