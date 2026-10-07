import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useAuthStore } from '@/stores/authStore'
import { useTutorStore } from '@/stores/tutorStore'
import { colors, fonts } from '@/constants/theme'

// Shown on the shared socio screens only when the logged-in user is a tutor:
// which minor's data is on screen, and chips to switch when there is more
// than one linked minor. Renders nothing for every other role.
export function TutorMenorSelector() {
  const esTutor       = useAuthStore(s => s.rol === 'tutor')
  const menores       = useTutorStore(s => s.menores)
  const seleccionadoId = useTutorStore(s => s.socioSeleccionadoId)
  const seleccionar   = useTutorStore(s => s.setSocioSeleccionado)

  if (!esTutor || menores.length === 0) return null

  if (menores.length === 1) {
    const menor = menores[0]
    return (
      <View style={s.unicoRow}>
        <Text style={s.unicoLabel}>VIENDO LOS DATOS DE</Text>
        <Text style={s.unicoNombre} numberOfLines={1}>
          {menor.nombre} · Nº {menor.numero_socio}
        </Text>
      </View>
    )
  }

  return (
    <View style={s.chipsRow}>
      {menores.map(m => {
        const activo = m.id === seleccionadoId
        return (
          <TouchableOpacity
            key={m.id}
            style={[s.chip, activo && s.chipActivo]}
            onPress={() => seleccionar(m.id)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityState={{ selected: activo }}
          >
            <Text style={[s.chipTexto, activo && s.chipTextoActivo]} numberOfLines={1}>
              {m.nombre.split(' ')[0]}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const s = StyleSheet.create({
  unicoRow: { paddingHorizontal: 20, paddingTop: 14, gap: 4 },
  unicoLabel: {
    fontFamily: fonts.label, fontSize: 11, letterSpacing: 2,
    textTransform: 'uppercase', color: '#8E8574',
  },
  unicoNombre: { fontFamily: fonts.label, fontSize: 14, letterSpacing: 1.5, color: colors.oro },

  chipsRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 20, paddingTop: 14,
  },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#1C1710', borderWidth: 1.5, borderColor: '#2C2418',
  },
  chipActivo: { backgroundColor: colors.oro + '33', borderColor: colors.oro },
  chipTexto: {
    fontFamily: fonts.label, fontSize: 12, letterSpacing: 1.5,
    textTransform: 'uppercase', color: '#8E8574',
  },
  chipTextoActivo: { color: colors.oro },
})
