import AsyncStorage from '@react-native-async-storage/async-storage'
import { nuevoIdCola } from './offlineSync'

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
    id: nuevoIdCola(),
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
  await eliminarVariosDeCola([id])
}

// Una sola escritura para todo lo que ya se sincronizó.
export async function eliminarVariosDeCola(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const quitar = new Set(ids)
  const cola = await obtenerCola()
  await AsyncStorage.setItem(CLAVE_COLA, JSON.stringify(cola.filter((item) => !quitar.has(item.id))))
}

export async function tamañoCola(): Promise<number> {
  const cola = await obtenerCola()
  return cola.length
}
