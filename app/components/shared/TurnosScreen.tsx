import { View, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Header } from '@/components/shared/Header'
import { TurnosGimnasio } from '@/components/shared/TurnosGimnasio'
import { colors } from '@/constants/theme'

// Pantalla de turnos del gimnasio de (cliente-gimnasio). El socio usa el mismo
// turnero dentro de su Agenda ((socio)/turnos).

export default function TurnosScreen() {
  const insets = useSafeAreaInsets()
  return (
    <View style={s.root}>
      <View style={{ paddingTop: insets.top }}>
        <Header />
      </View>
      <TurnosGimnasio />
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.fondo },
})
