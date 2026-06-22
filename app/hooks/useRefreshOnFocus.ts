import { useCallback, useRef } from 'react'
import { useFocusEffect } from '@react-navigation/native'

// Llama a `refetch` cada vez que la pantalla recibe el foco, excepto la primera
// vez (el hook ya fetchea al montar con su propio useEffect).
// Usa un ref para el callback — el efecto es estable aunque `refetch` no sea useCallback.
export function useRefreshOnFocus(refetch: () => void) {
  const refetchRef = useRef(refetch)
  refetchRef.current = refetch

  const firstMount = useRef(true)

  useFocusEffect(
    useCallback(() => {
      if (firstMount.current) {
        firstMount.current = false
        return
      }
      refetchRef.current()
    }, [])
  )
}
