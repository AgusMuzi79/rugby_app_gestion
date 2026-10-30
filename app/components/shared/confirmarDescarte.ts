import { Alert } from 'react-native'

// Antes de cambiar de división, turno o partido con marcas sin guardar
// (auditoría entrenador T3). Sin `onGuardar` sólo ofrece Seguir / Descartar.
export function confirmarDescarte({
  mensaje,
  onGuardar,
  onDescartar,
}: {
  mensaje: string
  onGuardar?: () => void
  onDescartar: () => void
}) {
  Alert.alert(
    'Asistencia sin guardar',
    mensaje,
    [
      { text: 'Seguir marcando', style: 'cancel' },
      ...(onGuardar ? [{ text: 'Guardar y cambiar', onPress: onGuardar }] : []),
      { text: 'Descartar', style: 'destructive' as const, onPress: onDescartar },
    ],
    { cancelable: true },
  )
}
