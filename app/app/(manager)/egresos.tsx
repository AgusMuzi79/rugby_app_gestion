import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useEgresos, type EventoEgresos } from '@/hooks/useEgresos'
import { colors, fonts } from '@/constants/theme'
import { ResumenBalance } from '@/components/eventos/ResumenBalance'
import { EgresosPanel } from '@/components/eventos/EgresosPanel'
import {
  CARD, DIVIDER, FONDO, MUTED, ORO, ROJO, TEXTO, formatFechaLarga,
} from '@/components/eventos/estilo'

const TIPO_LABEL: Record<string, string> = {
  viaje:         'VIAJE',
  tercer_tiempo: '3er TIEMPO',
}

// ─── Chip de evento ───────────────────────────────────────────────────────────

function EventoChip({
  evento, activo, onPress,
}: {
  evento: EventoEgresos; activo: boolean; onPress: (id: string) => void
}) {
  const cerrado = evento.estado !== 'activo'
  return (
    <TouchableOpacity
      style={[s.chip, activo && s.chipActivo]}
      onPress={() => onPress(evento.id)}
      activeOpacity={0.8}
    >
      <Text style={[s.chipNombre, activo && s.chipNombreActivo]} numberOfLines={1}>{evento.nombre}</Text>
      <Text style={[s.chipMeta, activo && s.chipMetaActivo]} numberOfLines={1}>
        {TIPO_LABEL[evento.tipo] ?? evento.tipo} · {cerrado ? 'CERRADO' : 'ACTIVO'}
      </Text>
    </TouchableOpacity>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function EgresosScreen() {
  const {
    loading, errorCarga, recargar,
    eventos, eventoSeleccionado, seleccionarEvento, detalle,
  } = useEgresos()
  const router = useRouter()

  if (loading && eventos.length === 0) {
    return (
      <SafeAreaView style={s.centrado}>
        <ActivityIndicator color={ORO} size="large" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.labelHeader}>MANAGER · VIAJES Y TERCER TIEMPOS</Text>
        <Text style={s.titulo}>Egresos</Text>
      </View>
      <View style={s.separador} />

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.lista} keyboardShouldPersistTaps="handled">
          {errorCarga && (
            <TouchableOpacity style={s.bannerError} onPress={recargar} activeOpacity={0.8}>
              <Text style={s.bannerErrorTexto}>{errorCarga} Tocá para reintentar.</Text>
            </TouchableOpacity>
          )}

          {eventos.length === 0 ? (
            !errorCarga && (
              <View style={s.emptyWrap}>
                <Text style={s.emptyTexto}>Sin viajes ni tercer tiempos.</Text>
                <Text style={s.emptySubtexto}>
                  Creá un viaje o tercer tiempo para empezar a cargar sus egresos.
                </Text>
                <TouchableOpacity
                  style={s.gestionarBtn}
                  onPress={() => router.navigate('/(manager)/eventos')}
                  activeOpacity={0.8}
                >
                  <Text style={s.gestionarBtnTexto}>VIAJES Y TERCER TIEMPOS →</Text>
                </TouchableOpacity>
              </View>
            )
          ) : (
            <>
              <Text style={s.seccionLabel}>EVENTO</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.chipsRow}
              >
                {eventos.map(ev => (
                  <EventoChip
                    key={ev.id}
                    evento={ev}
                    activo={ev.id === eventoSeleccionado?.id}
                    onPress={seleccionarEvento}
                  />
                ))}
              </ScrollView>

              {eventoSeleccionado && (
                <View style={s.eventoResumen}>
                  <Text style={s.eventoNombre} numberOfLines={2}>{eventoSeleccionado.nombre}</Text>
                  <Text style={s.eventoMeta}>
                    {[
                      eventoSeleccionado.divisionNombre,
                      eventoSeleccionado.fecha ? formatFechaLarga(eventoSeleccionado.fecha) : null,
                    ].filter(Boolean).join('  ·  ')}
                  </Text>
                </View>
              )}

              <ResumenBalance balance={detalle.balance} />
              <EgresosPanel estado={detalle} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: FONDO },
  centrado:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: FONDO, gap: 8 },
  flex:      { flex: 1 },

  // Header
  header:      { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  labelHeader: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: ORO, marginBottom: 4 },
  titulo:      { fontFamily: fonts.titulo, fontSize: 32, color: TEXTO, lineHeight: 38 },
  separador:   { height: 1, backgroundColor: DIVIDER, marginHorizontal: 20 },

  lista:         { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40, gap: 14 },
  seccionLabel:  { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: ORO },
  emptyWrap:     { gap: 6, marginTop: 8 },
  emptyTexto:    { fontFamily: fonts.cuerpo, color: MUTED, fontSize: 16, fontStyle: 'italic' },
  emptySubtexto: { fontFamily: fonts.cuerpo, color: MUTED, fontSize: 14, lineHeight: 18 },
  gestionarBtn:      { marginTop: 14, borderWidth: 1, borderColor: DIVIDER, borderRadius: 3, paddingVertical: 14, alignItems: 'center' },
  gestionarBtnTexto: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: ORO, fontWeight: '700' },

  // Chips de evento
  chipsRow:         { gap: 8, paddingRight: 16 },
  chip:             { borderWidth: 1, borderColor: DIVIDER, borderRadius: 3, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: CARD, maxWidth: 220 },
  chipActivo:       { backgroundColor: TEXTO, borderColor: TEXTO },
  chipNombre:       { fontFamily: fonts.cuerpo, fontSize: 15, fontWeight: '700', color: TEXTO },
  chipNombreActivo: { color: colors.sobreOro },
  chipMeta:         { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1, color: MUTED, marginTop: 2 },
  chipMetaActivo:   { color: colors.oroSobreClaro },

  // Evento elegido
  eventoResumen: { gap: 4 },
  eventoNombre:  { fontFamily: fonts.titulo, fontSize: 21, color: TEXTO, lineHeight: 26 },
  eventoMeta:    { fontFamily: fonts.label, fontSize: 13, color: MUTED, letterSpacing: 0.5 },

  // Banners
  bannerError:      { backgroundColor: '#2A1010', borderLeftWidth: 3, borderLeftColor: ROJO, borderRadius: 4, padding: 12 },
  bannerErrorTexto: { fontFamily: fonts.cuerpo, fontSize: 15, color: '#FFAAAA' },
})
