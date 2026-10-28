import { useCallback, useRef } from 'react'
import { BackHandler } from 'react-native'
import { useFocusEffect } from 'expo-router'

// Interino hasta pasar los detalles a rutas reales de un Stack (auditoría UX
// manager-subcomisión, T11): las pantallas que simulan una pila con un estado
// `paso` (Cobranzas, Fichajes, Eventos) no tienen Back de sistema. Con el
// detalle abierto, el Back de Android llama a `alVolver` (el mismo "‹ Volver"
// de la pantalla) en vez de salir de la pestaña. Sólo se registra mientras la
// pantalla tiene el foco, así no intercepta el Back de otra pestaña. Un Modal
// abierto recibe el Back antes (su onRequestClose).
export function useBackDelDetalle(detalleAbierto: boolean, alVolver: () => void) {
  // Siempre la última versión del callback, sin re-registrar en cada render.
  const alVolverRef = useRef(alVolver)
  alVolverRef.current = alVolver

  useFocusEffect(
    useCallback(() => {
      if (!detalleAbierto) return
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        alVolverRef.current()
        return true
      })
      return () => sub.remove()
    }, [detalleAbierto]),
  )
}
