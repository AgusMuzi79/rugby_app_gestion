import { View, Text, Modal, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { TurnosGimnasio } from '@/components/shared/TurnosGimnasio'
import { BarraModal, Boton, Titulo, estilosTenis } from '@/components/tenis/ui'
import { FEATURES } from '@/constants/features'
import { colors, fonts } from '@/constants/theme'

// Sheet "Gimnasio" del botón RESERVAR (Agenda del socio y del cliente
// gimnasio). Con FEATURES.turneroGimnasio apagado muestra un aviso; prendido,
// el turnero de siempre.

export function AvisoGimnasio({ visible, onCerrar }: { visible: boolean; onCerrar: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCerrar}>
      <SafeAreaView style={estilosTenis.sheet}>
        <BarraModal titulo="GIMNASIO" onCerrar={onCerrar} />
        {FEATURES.turneroGimnasio ? (
          <TurnosGimnasio />
        ) : (
          <View style={estilosTenis.sheetCuerpo}>
            <Titulo>Gimnasio</Titulo>
            <Text style={s.texto}>Las reservas de turno no están activas. Podés ir al gimnasio con normalidad.</Text>
            <Boton texto="CERRAR" variante="secundario" onPress={onCerrar} />
          </View>
        )}
      </SafeAreaView>
    </Modal>
  )
}

const s = StyleSheet.create({
  texto: { fontFamily: fonts.cuerpo, fontSize: 16, lineHeight: 22, color: colors.texto, marginTop: 4 },
})
