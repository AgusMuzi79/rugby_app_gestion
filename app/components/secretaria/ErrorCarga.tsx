import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { colors, fonts } from '@/constants/theme'

// Bloque de error de lectura de las pantallas de Secretaría (auditoría UX
// secretaría, T12): el mensaje como alerta y un REINTENTAR de 44 pt.
export function ErrorCarga({ mensaje, onReintentar }: { mensaje: string; onReintentar: () => void }) {
  return (
    <View style={s.bloque}>
      <View accessibilityRole="alert" accessibilityLiveRegion="polite">
        <Text style={s.texto}>{mensaje}</Text>
      </View>
      <TouchableOpacity
        style={s.reintentar}
        onPress={onReintentar}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel="Reintentar"
      >
        <Text style={s.reintentarText}>REINTENTAR</Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  bloque:         { paddingHorizontal: 20, paddingVertical: 24, gap: 12 },
  texto:          { fontFamily: fonts.cuerpo, fontSize: 16, color: colors.rojoTexto },
  reintentar:     { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.oro, borderRadius: 4, paddingVertical: 12, paddingHorizontal: 24 },
  reintentarText: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: colors.oro },
})
