// Guarda contra el doble envío (auditoría UX manager-subcomisión, T15).
// `disabled={guardando}` depende del re-render: dos toques muy rápidos pueden
// entrar dos veces y duplicar un egreso, un evento o un fichaje. Esta guarda
// es síncrona: el segundo llamado mientras el primero sigue en vuelo no corre
// y devuelve `siOcupado`. Se libera al terminar, también si el envío lanza.
// Los hooks la guardan en un useRef (una por envío). Verificada en
// guardaEnVuelo.check.ts.

export type GuardaEnVuelo = <T>(envio: () => Promise<T>, siOcupado: T) => Promise<T>

export function crearGuardaEnVuelo(): GuardaEnVuelo {
  let enVuelo = false
  return async function guarda<T>(envio: () => Promise<T>, siOcupado: T): Promise<T> {
    if (enVuelo) return siOcupado
    enVuelo = true
    try {
      return await envio()
    } finally {
      enVuelo = false
    }
  }
}

// Igual, pero una guarda por clave (p. ej. el id del egreso a borrar): el
// mismo id no se manda dos veces, y otro id no queda bloqueado por el primero.
export type GuardaPorClave = <T>(clave: string, envio: () => Promise<T>, siOcupado: T) => Promise<T>

export function crearGuardaPorClave(): GuardaPorClave {
  const enVuelo = new Set<string>()
  return async function guarda<T>(clave: string, envio: () => Promise<T>, siOcupado: T): Promise<T> {
    if (enVuelo.has(clave)) return siOcupado
    enVuelo.add(clave)
    try {
      return await envio()
    } finally {
      enVuelo.delete(clave)
    }
  }
}
