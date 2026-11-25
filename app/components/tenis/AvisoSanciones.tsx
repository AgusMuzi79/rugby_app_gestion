import { View, Text, Modal, StyleSheet } from 'react-native'
import { colors, fonts } from '@/constants/theme'
import { AVISO_SANCIONES } from '@/lib/tenis'
import { Boton } from './ui'

// Ventana chica antes de confirmar una reserva de socio: recuerda las
// sanciones. VOLVER cierra sin reservar; ENTENDIDO, CONFIRMAR reserva.

export function AvisoSanciones({ visible, onVolver, onConfirmar }: {
  visible:     boolean
  onVolver:    () => void
  onConfirmar: () => void
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onVolver}>
      <View style={s.contenedor}>
        <View style={s.velo} />
        <View style={s.card} accessibilityViewIsModal>
          <Text style={s.titulo} accessibilityRole="header">{AVISO_SANCIONES.titulo}</Text>
          <Text style={s.texto}>{AVISO_SANCIONES.texto}</Text>
          <Boton texto="ENTENDIDO, CONFIRMAR" onPress={onConfirmar} />
          <Boton texto="VOLVER" variante="secundario" onPress={onVolver} />
        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  contenedor: { flex: 1, justifyContent: 'center', padding: 24 },
  velo:       { ...StyleSheet.absoluteFillObject, backgroundColor: colors.fondo, opacity: 0.85 },
  card:       { backgroundColor: colors.card, borderRadius: 8, borderWidth: 1, borderColor: colors.bordeRealce, padding: 20 },
  titulo:     { fontFamily: fonts.titulo, fontSize: 20, letterSpacing: 1, color: colors.texto, marginBottom: 8 },
  texto:      { fontFamily: fonts.cuerpo, fontSize: 15, lineHeight: 21, color: colors.texto },
})
