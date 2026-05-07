import AsyncStorage from '@react-native-async-storage/async-storage'

export type OperacionOffline = 'asistencia' | 'lesion'

export interface ItemCola {
  id: string
  tipo: OperacionOffline
  payload: Record<string, unknown>
  creadoEn: number
}

const CLAVE_COLA = 'rugby_offline_queue'

export async function encolar(
  item: Omit<ItemCola, 'id' | 'creadoEn'>,
): Promise<ItemCola> {
  const cola = await obtenerCola()
  const nuevoItem: ItemCola = {
    ...item,
    id: crypto.randomUUID(),
    creadoEn: Date.now(),
  }
  await AsyncStorage.setItem(CLAVE_COLA, JSON.stringify([...cola, nuevoItem]))
  return nuevoItem
}

export async function obtenerCola(): Promise<ItemCola[]> {
  const raw = await AsyncStorage.getItem(CLAVE_COLA)
  return raw ? (JSON.parse(raw) as ItemCola[]) : []
}

export async function eliminarDeCola(id: string): Promise<void> {
  const cola = await obtenerCola()
  const filtrada = cola.filter((item) => item.id !== id)
  await AsyncStorage.setItem(CLAVE_COLA, JSON.stringify(filtrada))
}

export async function tamañoCola(): Promise<number> {
  const cola = await obtenerCola()
  return cola.length
}
