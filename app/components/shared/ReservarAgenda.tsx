import { useRef, useState } from 'react'
import { View, Text, Modal, Pressable, ScrollView, RefreshControl, Platform, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AvisoGimnasio } from '@/components/shared/AvisoGimnasio'
import { TenisSocio, type TenisSocioRef } from '@/components/tenis/TenisSocio'
import { BarraModal, Boton, estilosTenis } from '@/components/tenis/ui'
import type { OpcionReserva } from '@/lib/agenda'
import { colors, fonts } from '@/constants/theme'

// Botón RESERVAR de la Agenda (arriba de los eventos). Con una sola opción la
// abre directo; con gimnasio y tenis primero pregunta cuál. Sin opciones no
// se dibuja. Tenis se monta al abrir el sheet, así cada apertura recarga.
// editarTenis: la Agenda pide abrir tenis con esa reserva en edición (botón
// EDITAR de una card); onCerrar avisa al cerrar cualquier sheet y onCambioTenis
// cuando se reservó, editó o canceló, así la Agenda recarga sus turnos.

export function ReservarAgenda({ opciones, editarTenis = null, onCerrar, onCambioTenis }: {
  opciones:       OpcionReserva[]
  editarTenis?:   string | null
  onCerrar?:      () => void
  onCambioTenis?: () => void
}) {
  const [abierta, setAbierta] = useState<OpcionReserva | 'elegir' | null>(null)
  const tenisRef = useRef<TenisSocioRef>(null)
  // iOS no presenta un modal mientras se cierra otro: la opción elegida se
  // abre recién en onDismiss del selector.
  const pendiente = useRef<OpcionReserva | null>(null)

  if (opciones.length === 0) return null

  const cerrar = () => { setAbierta(null); onCerrar?.() }
  const elegir = (o: OpcionReserva) => {
    if (Platform.OS === 'ios') {
      pendiente.current = o
      setAbierta(null)
    } else {
      setAbierta(o)
    }
  }
  const alCerrarSelector = () => {
    const o = pendiente.current
    pendiente.current = null
    if (o) setAbierta(o)
  }

  return (
    <>
      <Boton
        texto="RESERVAR"
        onPress={() => setAbierta(opciones.length === 1 ? opciones[0] : 'elegir')}
      />

      <Modal
        visible={abierta === 'elegir'}
        transparent
        animationType="fade"
        onRequestClose={cerrar}
        onDismiss={alCerrarSelector}
      >
        <View style={s.contenedor}>
          <Pressable style={s.velo} onPress={cerrar} accessibilityRole="button" accessibilityLabel="Cerrar" />
          <View style={s.selector}>
            <Text style={s.selectorTitulo} accessibilityRole="header">¿QUÉ QUERÉS RESERVAR?</Text>
            {opciones.map(o => (
              <Boton
                key={o}
                texto={o === 'gimnasio' ? 'GIMNASIO' : 'TENIS'}
                onPress={() => elegir(o)}
              />
            ))}
            <Boton texto="CANCELAR" variante="secundario" onPress={cerrar} />
          </View>
        </View>
      </Modal>

      <AvisoGimnasio visible={abierta === 'gimnasio'} onCerrar={cerrar} />

      <Modal visible={abierta === 'tenis' || (!!editarTenis && opciones.includes('tenis'))} animationType="slide" presentationStyle="pageSheet" onRequestClose={cerrar}>
        <SafeAreaView style={estilosTenis.sheet}>
          <BarraModal titulo="TENIS" onCerrar={cerrar} />
          <ScrollView
            contentContainerStyle={estilosTenis.sheetCuerpo}
            refreshControl={
              <RefreshControl refreshing={false} onRefresh={() => tenisRef.current?.refetch()} tintColor={colors.oro} />
            }
          >
            <TenisSocio ref={tenisRef} editarInicial={editarTenis} onCambio={onCambioTenis} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  )
}

const s = StyleSheet.create({
  contenedor:     { flex: 1, justifyContent: 'flex-end' },
  velo:           { ...StyleSheet.absoluteFillObject, backgroundColor: colors.fondo, opacity: 0.85 },
  selector:       { backgroundColor: colors.card, borderTopLeftRadius: 12, borderTopRightRadius: 12, borderTopWidth: 1, borderColor: colors.borde, padding: 20, paddingBottom: 36 },
  selectorTitulo: { fontFamily: fonts.label, fontSize: 14, letterSpacing: 2, color: colors.texto, marginBottom: 4 },
})
