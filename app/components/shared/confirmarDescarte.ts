import { Alert } from 'react-native'

// Antes de cambiar de división, turno o partido con marcas sin guardar
// (auditoría entrenador T3). Sin `onGuardar` sólo ofrece Seguir / Descartar.
// `titulo` y `textoSeguir` permiten reusarlo fuera de asistencia (detalle de
// Usuarios, auditoría auth T12); por defecto queda el texto de asistencia.
export function confirmarDescarte({
  titulo = 'Asistencia sin guardar',
  textoSeguir = 'Seguir marcando',
  mensaje,
  onGuardar,
  onDescartar,
}: {
  titulo?: string
  textoSeguir?: string
  mensaje: string
  onGuardar?: () => void
  onDescartar: () => void
}) {
  Alert.alert(
    titulo,
    mensaje,
    [
      { text: textoSeguir, style: 'cancel' },
      ...(onGuardar ? [{ text: 'Guardar y cambiar', onPress: onGuardar }] : []),
      { text: 'Descartar', style: 'destructive' as const, onPress: onDescartar },
    ],
    { cancelable: true },
  )
}
