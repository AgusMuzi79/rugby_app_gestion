import { useCallback, useRef } from 'react'
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Header } from '@/components/shared/Header'
import { TurnosGimnasio } from '@/components/shared/TurnosGimnasio'
import { AgendaEventos } from '@/components/socio/AgendaEventos'
import { TenisSocio, type TenisSocioRef } from '@/components/tenis/TenisSocio'
import { FEATURES } from '@/constants/features'
import { useAgenda } from '@/hooks/useAgenda'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'
import { puedeVerAgenda } from '@/lib/agenda'
import { colors, fonts } from '@/constants/theme'

// Pestaña "Agenda" del socio (ruta histórica `turnos`): eventos de sus
// divisiones y, si tiene el servicio, el turnero del gimnasio debajo.
// La agenda la carga el layout (decide si se ve la pestaña); acá se recarga al
// volver a la pestaña. Con FEATURES.tenis, debajo de los eventos va la
// sección Tenis (reservas de canchas), que ve todo socio activo.

export default function AgendaScreen() {
  const insets = useSafeAreaInsets()
  const { agenda, loading, error, refetch: refetchAgenda } = useAgenda()
  const tenisRef = useRef<TenisSocioRef>(null)
  const refetch = useCallback(async () => {
    tenisRef.current?.refetch()
    await refetchAgenda()
  }, [refetchAgenda])
  useRefreshOnFocus(refetch)

  const eventos = (
    <>
      <AgendaEventos agenda={agenda} loading={loading} error={error} onReintentar={refetchAgenda} />
      {FEATURES.tenis && <TenisSocio ref={tenisRef} />}
    </>
  )

  return (
    <View style={s.root}>
      <View style={{ paddingTop: insets.top }}>
        <Header />
      </View>

      {agenda?.tiene_gimnasio ? (
        <TurnosGimnasio encabezado={eventos} onRefresh={refetch} />
      ) : (
        <ScrollView
          contentContainerStyle={s.contenido}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={colors.oro} />}
        >
          {eventos}
          {!FEATURES.tenis && agenda && !error && !puedeVerAgenda(agenda) && (
            <Text style={s.vacio}>No tenés eventos de división ni turnos de gimnasio.</Text>
          )}
        </ScrollView>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: colors.fondo },
  contenido: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 60 },
  vacio:     { fontFamily: fonts.cuerpo, fontSize: 15, fontStyle: 'italic', color: colors.muted, paddingVertical: 8 },
})
