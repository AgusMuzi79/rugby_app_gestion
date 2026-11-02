import { Text, StyleSheet } from 'react-native'
import { colors, fonts } from '@/constants/theme'

// Error de un campo de formulario, debajo del campo (lib/validacionAuth.ts).
// El lector de pantalla lo anuncia cuando aparece.
export function ErrorCampo({ mensaje }: { mensaje?: string }) {
  if (!mensaje) return null
  return (
    <Text style={s.texto} accessibilityLiveRegion="polite" accessibilityRole="alert">
      {mensaje}
    </Text>
  )
}

const s = StyleSheet.create({
  texto: {
    fontFamily: fonts.cuerpo,
    fontSize: 14,
    marginTop: 6,
    color: colors.rojoTexto,
  },
})
