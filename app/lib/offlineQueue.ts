import AsyncStorage from '@react-native-async-storage/async-storage'
import { nuevoIdCola } from './offlineSync'

export type OperacionOffline = 'asistencia' | 'lesion'

export interface ItemCola {
  id: string
  tipo: OperacionOffline
  payload: Record<string, unknown>
  creadoEn: number
  // Fallas permanentes acumuladas (las de red no cuentan), ver particionarFallidos.
  intentos?: number
  ultimoError?: string
}

const CLAVE_COLA = 'rugby_offline_queue'
// Ítems que fallaron MAX_INTENTOS veces por un error que no es de red: salen
// de la cola (no se reintentan más) pero se conservan, no se borran.
const CLAVE_NO_ENVIADAS = 'rugby_offline_queue_no_enviadas'

// Toda lectura-modificación-escritura pasa por esta cadena: la sincronización
// automática corre en paralelo con `encolar` y, sin candado, una escritura
// pisaba a la otra y se perdía un ítem.
let cadena: Promise<unknown> = Promise.resolve()
function conCandado<T>(fn: () => Promise<T>): Promise<T> {
  const resultado = cadena.then(fn, fn)
  cadena = resultado.catch(() => undefined)
  return resultado
}

async function leer(clave: string): Promise<ItemCola[]> {
  const raw = await AsyncStorage.getItem(clave)
  return raw ? (JSON.parse(raw) as ItemCola[]) : []
}

export function encolar(
  item: Omit<ItemCola, 'id' | 'creadoEn'>,
): Promise<ItemCola> {
  return conCandado(async () => {
    const cola = await leer(CLAVE_COLA)
    const nuevoItem: ItemCola = {
      ...item,
      id: nuevoIdCola(),
      creadoEn: Date.now(),
    }
    await AsyncStorage.setItem(CLAVE_COLA, JSON.stringify([...cola, nuevoItem]))
    return nuevoItem
  })
}

export function obtenerCola(): Promise<ItemCola[]> {
  return leer(CLAVE_COLA)
}

export function eliminarDeCola(id: string): Promise<void> {
  return aplicarResultadoSync({ enviados: [id], reintentar: [], descartar: [] })
}

// Una sola escritura (bajo el candado) para todo lo que dejó una sincronización:
// saca los enviados, actualiza los intentos de los que fallaron y mueve los
// que llegaron al tope a la lista de no enviadas. Los ítems encolados mientras
// tanto se conservan porque se relee la cola dentro del candado.
export function aplicarResultadoSync(r: {
  enviados: string[]
  reintentar: ItemCola[]
  descartar: ItemCola[]
}): Promise<void> {
  if (r.enviados.length === 0 && r.reintentar.length === 0 && r.descartar.length === 0) return Promise.resolve()
  return conCandado(async () => {
    const quitar = new Set([...r.enviados, ...r.descartar.map(i => i.id)])
    const actualizados = new Map(r.reintentar.map(i => [i.id, i]))
    const cola = await leer(CLAVE_COLA)
    const nueva = cola
      .filter(item => !quitar.has(item.id))
      .map(item => actualizados.get(item.id) ?? item)
    await AsyncStorage.setItem(CLAVE_COLA, JSON.stringify(nueva))
    if (r.descartar.length > 0) {
      const noEnviadas = await leer(CLAVE_NO_ENVIADAS)
      await AsyncStorage.setItem(CLAVE_NO_ENVIADAS, JSON.stringify([...noEnviadas, ...r.descartar]))
    }
  })
}

export async function tamañoCola(): Promise<number> {
  return (await leer(CLAVE_COLA)).length
}

export async function cantidadNoEnviadas(): Promise<number> {
  return (await leer(CLAVE_NO_ENVIADAS)).length
}
