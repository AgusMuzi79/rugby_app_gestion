import { useEffect, useState } from 'react'
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
} from 'react-native'
import type { DivisionCoordinador, JugadorDivision } from '@/hooks/useJugadoresDivision'
import { colors, fonts } from '@/constants/theme'

// ─── Tokens (mismos que el resto de pantallas de coordinador) ────────────────

const FONDO   = '#15110A'
const CARD    = '#1C1710'
const TEXTO   = '#F3EFE4'
const MUTED   = '#8E8574'
const DIVIDER = '#2C2418'
const ROJO    = colors.rojoUrgente

export function etiquetaDivision(d: DivisionCoordinador): string {
  return d.linea ? `${d.nombre} · Línea ${d.linea}` : d.nombre
}

function rangoEdad(d: DivisionCoordinador): string | null {
  if (d.edad_min === null && d.edad_max === null) return null
  if (d.edad_min !== null && d.edad_max !== null) {
    return d.edad_min === d.edad_max ? `${d.edad_min} años` : `${d.edad_min} a ${d.edad_max} años`
  }
  return d.edad_min !== null ? `${d.edad_min} años o más` : `hasta ${d.edad_max} años`
}

interface Props {
  jugador: JugadorDivision | null
  origen: DivisionCoordinador | null
  destinos: DivisionCoordinador[]
  moviendo: boolean
  error: string | null
  onClose: () => void
  onConfirmar: (destino: DivisionCoordinador) => void
}

export function ModalMoverJugador({ jugador, origen, destinos, moviendo, error, onClose, onConfirmar }: Props) {
  const [destino, setDestino] = useState<DivisionCoordinador | null>(null)

  // Cada apertura arranca en el paso de elegir destino
  useEffect(() => { setDestino(null) }, [jugador?.id])

  if (!jugador || !origen) return null

  const cerrar = () => { if (!moviendo) onClose() }

  return (
    <Modal visible={!!jugador} animationType="slide" presentationStyle="pageSheet" onRequestClose={cerrar}>
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <Text style={s.titulo}>{destino ? 'Confirmar cambio' : 'Mover a…'}</Text>
          <TouchableOpacity
            onPress={destino ? () => setDestino(null) : cerrar}
            disabled={moviendo}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={destino ? 'Volver a elegir división' : 'Cancelar'}
          >
            <Text style={s.cerrar}>{destino ? 'Volver' : 'Cancelar'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={s.flex} contentContainerStyle={s.body}>
          <Text style={s.jugadorNombre}>{jugador.nombre_completo}</Text>
          <Text style={s.jugadorMeta}>
            Hoy en {etiquetaDivision(origen)}
            {jugador.edad !== null ? ` · ${jugador.edad} años en la temporada` : ''}
          </Text>

          {!destino ? (
            <>
              <Text style={s.label}>DIVISIÓN DESTINO</Text>
              {destinos.length === 0 ? (
                <Text style={s.muted}>
                  No tenés otras divisiones activas de {origen.deporte} asignadas.
                </Text>
              ) : (
                destinos.map(d => {
                  const rango = rangoEdad(d)
                  return (
                    <TouchableOpacity
                      key={d.id}
                      style={s.opcion}
                      onPress={() => setDestino(d)}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={`Mover a ${etiquetaDivision(d)}`}
                    >
                      <View style={s.flex}>
                        <Text style={s.opcionNombre}>{etiquetaDivision(d)}</Text>
                        {rango ? <Text style={s.opcionMeta}>{rango}</Text> : null}
                      </View>
                      <Text style={s.opcionFlecha}>→</Text>
                    </TouchableOpacity>
                  )
                })
              )}
            </>
          ) : (
            <>
              <View style={s.resumen}>
                <Text style={s.resumenLabel}>DE</Text>
                <Text style={s.resumenValor}>{etiquetaDivision(origen)}</Text>
                <Text style={[s.resumenLabel, s.resumenLabelEspacio]}>A</Text>
                <Text style={s.resumenValor}>{etiquetaDivision(destino)}</Text>
              </View>
              <Text style={s.aviso}>
                El jugador deja de figurar en {origen.nombre} y pasa a {destino.nombre}.
                Su asistencia e historial anteriores quedan registrados en {origen.nombre}.
              </Text>
            </>
          )}

          {error && (
            <View style={s.errorBanner} accessibilityRole="alert">
              <Text style={s.errorTexto}>{error}</Text>
            </View>
          )}
        </ScrollView>

        {destino && (
          <View style={s.footer}>
            <TouchableOpacity
              style={[s.botonConfirmar, moviendo && s.botonOff]}
              onPress={() => onConfirmar(destino)}
              disabled={moviendo}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Confirmar mover a ${jugador.nombre_completo} a ${etiquetaDivision(destino)}`}
            >
              {moviendo
                ? <ActivityIndicator color={colors.oro} size="small" />
                : <Text style={s.botonConfirmarTexto}>CONFIRMAR CAMBIO</Text>
              }
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  )
}

const s = StyleSheet.create({
  flex:      { flex: 1 },
  container: { flex: 1, backgroundColor: FONDO },
  header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: DIVIDER },
  titulo:    { fontFamily: fonts.titulo, fontSize: 19, color: TEXTO },
  cerrar:    { fontFamily: fonts.cuerpo, fontSize: 16, color: MUTED },
  body:      { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },

  jugadorNombre: { fontFamily: fonts.cuerpo, fontSize: 19, color: TEXTO, fontWeight: '600' },
  jugadorMeta:   { fontFamily: fonts.cuerpo, fontSize: 14, color: MUTED, marginTop: 4, marginBottom: 22 },

  label: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: colors.oro, marginBottom: 8 },
  muted: { fontFamily: fonts.cuerpo, fontSize: 15, color: MUTED, fontStyle: 'italic' },

  opcion:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14, marginBottom: 8, borderRadius: 6, borderWidth: 1.5, borderColor: DIVIDER, backgroundColor: CARD },
  opcionNombre: { fontFamily: fonts.cuerpo, fontSize: 17, color: TEXTO },
  opcionMeta:   { fontFamily: fonts.label, fontSize: 13, color: MUTED, marginTop: 2, letterSpacing: 0.5 },
  opcionFlecha: { fontFamily: fonts.label, fontSize: 16, color: colors.oroHondo },

  resumen:             { backgroundColor: CARD, borderWidth: 1, borderColor: DIVIDER, borderRadius: 6, padding: 16 },
  resumenLabel:        { fontFamily: fonts.label, fontSize: 12, letterSpacing: 2, color: colors.oroHondo },
  resumenLabelEspacio: { marginTop: 12 },
  resumenValor:        { fontFamily: fonts.cuerpo, fontSize: 18, color: TEXTO, marginTop: 2 },
  aviso:               { fontFamily: fonts.cuerpo, fontSize: 14, color: MUTED, marginTop: 14, lineHeight: 19 },

  errorBanner: { backgroundColor: '#2A1010', borderLeftWidth: 3, borderLeftColor: ROJO, borderRadius: 4, padding: 12, marginTop: 16 },
  errorTexto:  { fontFamily: fonts.cuerpo, fontSize: 15, color: '#FFAAAA' },

  footer:              { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: DIVIDER },
  botonConfirmar:      { backgroundColor: TEXTO, paddingVertical: 16, borderRadius: 4, alignItems: 'center' },
  botonOff:            { opacity: 0.6 },
  botonConfirmarTexto: { fontFamily: fonts.label, color: colors.oro, fontSize: 14, letterSpacing: 2.5, fontWeight: '600' },
})
