import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Header } from '@/components/shared/Header'
import { ReservarAgenda } from '@/components/shared/ReservarAgenda'
import { AgendaEventos } from '@/components/socio/AgendaEventos'
import { FEATURES } from '@/constants/features'
import { useAgenda } from '@/hooks/useAgenda'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'
import { opcionesReserva } from '@/lib/agenda'
import { colors, fonts } from '@/constants/theme'

// Pestaña "Agenda" del socio (ruta histórica `turnos`): arriba el botón
// RESERVAR (gimnasio si tiene el servicio; tenis con FEATURES.tenis, para todo
// socio) y debajo los eventos de sus divisiones. El turnero y la sección Tenis
// se abren en sheets desde el botón (components/shared/ReservarAgenda.tsx).
// La agenda la carga el layout (decide si se ve la pestaña); acá se recarga al
// volver a la pestaña.

export default function AgendaScreen() {
  const insets = useSafeAreaInsets()
  const { agenda, loading, error, refetch } = useAgenda()
  useRefreshOnFocus(refetch)

  const opciones = opcionesReserva({
    tieneGimnasio: agenda?.tiene_gimnasio ?? false,
    tenisActivo:   FEATURES.tenis,
    esSocio:       true,
  })
  const sinEventos = agenda && !error && agenda.divisiones.length === 0

  return (
    <View style={s.root}>
      <View style={{ paddingTop: insets.top }}>
        <Header />
      </View>

      <ScrollView
        contentContainerStyle={s.contenido}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={colors.oro} />}
      >
        <ReservarAgenda opciones={opciones} />
        <AgendaEventos agenda={agenda} loading={loading} error={error} onReintentar={refetch} />
        {sinEventos && (
          <Text style={s.vacio}>
            {opciones.length > 0
              ? 'No tenés eventos de división esta semana.'
              : 'No tenés eventos de división ni reservas disponibles.'}
          </Text>
        )}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: colors.fondo },
  contenido: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 60 },
  vacio:     { fontFamily: fonts.cuerpo, fontSize: 15, fontStyle: 'italic', color: colors.muted, paddingVertical: 8 },
})
