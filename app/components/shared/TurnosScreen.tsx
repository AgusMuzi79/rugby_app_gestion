import { View, ScrollView, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Header } from '@/components/shared/Header'
import { ReservarAgenda } from '@/components/shared/ReservarAgenda'
import { FEATURES } from '@/constants/features'
import { opcionesReserva } from '@/lib/agenda'
import { colors } from '@/constants/theme'

// Agenda de (cliente-gimnasio): sólo el botón RESERVAR, que abre el sheet del
// gimnasio (aviso o turnero según FEATURES.turneroGimnasio). El cliente
// gimnasio siempre tiene gimnasio y nunca tenis (no es socio).

const OPCIONES = opcionesReserva({ tieneGimnasio: true, tenisActivo: FEATURES.tenis, esSocio: false })

export default function TurnosScreen() {
  const insets = useSafeAreaInsets()
  return (
    <View style={s.root}>
      <View style={{ paddingTop: insets.top }}>
        <Header />
      </View>
      <ScrollView contentContainerStyle={s.contenido}>
        <ReservarAgenda opciones={OPCIONES} />
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: colors.fondo },
  contenido: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 60 },
})
