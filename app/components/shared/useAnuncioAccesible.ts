import { useEffect } from 'react'
import { AccessibilityInfo, Platform } from 'react-native'

// Lee en voz alta un mensaje de estado ("Asistencia guardada", un error al
// guardar) cuando aparece o cambia (auditoría entrenador-coordinador T10,
// WCAG 4.1.3). En Android lo anuncia la vista con
// accessibilityLiveRegion="polite", que tiene que estar siempre montada para
// que TalkBack note el cambio; iOS ignora las live regions, así que ahí se
// anuncia a mano (en Android se leería dos veces).
export function useAnuncioAccesible(mensaje: string | null) {
  useEffect(() => {
    if (mensaje && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(mensaje)
  }, [mensaje])
}
