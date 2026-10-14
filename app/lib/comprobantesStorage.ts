// Persistencia en AsyncStorage de los comprobantes mandados por WhatsApp
// (lógica pura y formato de claves en comprobanteEnviado.ts).

import AsyncStorage from '@react-native-async-storage/async-storage'
import { parseEntradaComprobante, type ComprobanteEnviado } from './comprobanteEnviado'

export async function guardarComprobanteEnviado(entrada: ComprobanteEnviado): Promise<void> {
  await AsyncStorage.setItem(
    entrada.clave,
    JSON.stringify({ enviadoAt: entrada.enviadoAt, periodos: entrada.periodos }),
  )
}

// Todas las entradas de un socio (prefijoComprobantes). Si AsyncStorage falla
// devuelve [] — el feedback es un extra, nunca bloquea la pantalla de cuotas.
export async function leerComprobantesEnviados(prefijo: string): Promise<ComprobanteEnviado[]> {
  try {
    const claves = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(prefijo))
    if (claves.length === 0) return []
    const pares = await AsyncStorage.multiGet(claves)
    return pares
      .map(([clave, raw]) => parseEntradaComprobante(clave, raw))
      .filter((e): e is ComprobanteEnviado => e !== null)
  } catch {
    return []
  }
}

export async function borrarComprobanteEnviado(clave: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(clave)
  } catch {
    // si no se pudo borrar, se vuelve a mostrar "registrado" la próxima vez
  }
}
