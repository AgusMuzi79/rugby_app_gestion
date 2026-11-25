import { useCallback, useEffect, useState } from 'react'
import { View, Text, ScrollView, RefreshControl, Alert, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ErrorCarga } from '@/components/shared/ErrorCarga'
import { Header } from '@/components/shared/Header'
import { ReservarAgenda } from '@/components/shared/ReservarAgenda'
import { AgendaEventos } from '@/components/socio/AgendaEventos'
import { FEATURES } from '@/constants/features'
import { useAgenda } from '@/hooks/useAgenda'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'
import { useMisReservasTenis } from '@/hooks/useTenisSocio'
import { agendaVacia, opcionesReserva, reservasTenisAgenda } from '@/lib/agenda'
import { CONFIG_DEFECTO, etiquetaDiaCorta, fechaArgentina, inicioReal, type MiReserva } from '@/lib/tenis'
import { colors, fonts } from '@/constants/theme'

// Pestaña "Agenda" del socio (ruta histórica `turnos`): arriba el botón
// RESERVAR (gimnasio si tiene el servicio; tenis con FEATURES.tenis, para todo
// socio) y debajo los eventos de sus divisiones mezclados con sus turnos de
// tenis (con FEATURES.tenis; EDITAR abre el sheet de tenis con la reserva en
// edición). El turnero y la sección Tenis se abren en sheets desde el botón
// (components/shared/ReservarAgenda.tsx).
// La agenda la carga el layout (decide si se ve la pestaña); acá se recarga al
// volver a la pestaña.

export default function AgendaScreen() {
  const insets = useSafeAreaInsets()
  const { agenda, loading, error, refetch } = useAgenda()
  const tenis = useMisReservasTenis(FEATURES.tenis)
  const refetchTenis = tenis.refetch
  const recargar = useCallback(() => { refetch(); refetchTenis() }, [refetch, refetchTenis])
  useRefreshOnFocus(recargar)

  const [ahoraMs, setAhoraMs] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setAhoraMs(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  const [editarTenis, setEditarTenis] = useState<string | null>(null)
  const [cancelando, setCancelando] = useState<string | null>(null)
  const turnosTenis = FEATURES.tenis ? reservasTenisAgenda(tenis.reservas, ahoraMs) : []

  function pedirCancelacion(r: MiReserva) {
    Alert.alert(
      'Cancelar reserva',
      `¿Cancelás la cancha ${r.cancha} del ${etiquetaDiaCorta(fechaArgentina(r.inicio))} a las ${inicioReal(r.inicio, CONFIG_DEFECTO.margen_inicio_min)}? Si ya pagaste, la devolución la hace la administración del club.`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Cancelá', style: 'destructive', onPress: async () => {
            setCancelando(r.id)
            const res = await tenis.cancelar(r.id)
            setCancelando(null)
            if (!res.ok) Alert.alert('No se pudo cancelar', res.mensaje)
          },
        },
      ],
    )
  }

  const opciones = opcionesReserva({
    tieneGimnasio: agenda?.tiene_gimnasio ?? false,
    tenisActivo:   FEATURES.tenis,
    esSocio:       true,
  })
  // Si falló la carga de la agenda o de los turnos de tenis no se afirma que no hay nada.
  const sinEventos = agendaVacia({
    agendaCargada: !!agenda,
    errorAgenda:   error,
    errorTenis:    tenis.error,
    tenisActivo:   FEATURES.tenis,
    divisiones:    agenda?.divisiones.length ?? 0,
    turnosTenis:   turnosTenis.length,
  })

  return (
    <View style={s.root}>
      <View style={{ paddingTop: insets.top }}>
        <Header />
      </View>

      <ScrollView
        contentContainerStyle={s.contenido}
        refreshControl={<RefreshControl refreshing={false} onRefresh={recargar} tintColor={colors.oro} />}
      >
        <ReservarAgenda
          opciones={opciones}
          editarTenis={editarTenis}
          onCerrar={() => { setEditarTenis(null); refetchTenis() }}
          onCambioTenis={refetchTenis}
        />
        <AgendaEventos
          agenda={agenda}
          loading={loading}
          error={error}
          onReintentar={refetch}
          tenis={FEATURES.tenis ? {
            reservas: turnosTenis, ahoraMs, cancelando,
            onEditar: r => setEditarTenis(r.id),
            onCancelar: pedirCancelacion,
          } : undefined}
        />
        {FEATURES.tenis && tenis.error && <ErrorCarga mensaje={tenis.error} onReintentar={refetchTenis} />}
        {sinEventos && (
          <Text style={s.vacio}>
            {opciones.length > 0
              ? FEATURES.tenis
                ? 'No tenés eventos de división ni turnos de tenis esta semana.'
                : 'No tenés eventos de división esta semana.'
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
