import { View, Text, Modal, ScrollView, ActivityIndicator, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, fonts } from '@/constants/theme'
import { ErrorCarga } from '@/components/shared/ErrorCarga'
import { useHistorialReserva } from '@/hooks/useTenisGestion'
import { ESTADOS_RESERVA, etiquetaDiaCorta, fechaArgentina, horaArgentina } from '@/lib/tenis'
import { ACCIONES_HISTORIAL, TIPOS_RESERVA, horaSnapshot, nombreCancha } from '@/lib/tenisGestion'
import { BarraModal, estilosTenis } from './ui'

// Historial de una reserva (`tenis_reserva_historial`), como el de OnDepor:
// tipo, quién la creó y cuándo, y cada versión con fecha, horario, jugadores,
// cancha, estado y quién la cambió. Se abre desde el listado y la grilla.

function momento(iso: string | null): string {
  return iso ? `${etiquetaDiaCorta(fechaArgentina(iso))} ${horaArgentina(iso)}` : '—'
}

export function HistorialReserva({ reservaId, onCerrar }: { reservaId: string; onCerrar: () => void }) {
  const { datos: h, loading, error, refetch } = useHistorialReserva(reservaId)

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onCerrar}>
      <SafeAreaView style={estilosTenis.sheet}>
        <BarraModal titulo="HISTORIAL DE LA RESERVA" onCerrar={onCerrar} />
        <ScrollView contentContainerStyle={estilosTenis.sheetCuerpo}>
          {loading && !h && <ActivityIndicator color={colors.oro} style={s.cargando} />}
          {error && <ErrorCarga mensaje={error} onReintentar={refetch} />}
          {h && (
            <>
              <View style={estilosTenis.card}>
                <Text style={estilosTenis.textoCard}>Tipo: {(h.tipo && TIPOS_RESERVA[h.tipo]) || h.tipo || '—'}</Text>
                <Text style={estilosTenis.mutedCard}>Creada el {momento(h.creada_at)}{h.creada_por ? ` por ${h.creada_por}` : ''}</Text>
              </View>
              <Text style={estilosTenis.label}>VERSIONES</Text>
              {h.versiones.length === 0 && <Text style={estilosTenis.vacio}>Sin cambios registrados.</Text>}
              {h.versiones.map(v => {
                const sn = v.snapshot
                return (
                  <View key={`${v.version}-${v.hecho_at}`} style={[estilosTenis.card, s.version]}>
                    <Text style={s.accion}>#{v.version} · {ACCIONES_HISTORIAL[v.accion] ?? v.accion}</Text>
                    {sn && (
                      <>
                        <Text style={estilosTenis.textoCard}>
                          {sn.fecha ? etiquetaDiaCorta(sn.fecha) : '—'} · {horaSnapshot(sn.inicio)}–{horaSnapshot(sn.fin)}
                          {sn.cancha ? ` · ${nombreCancha(sn.cancha)}` : ''}
                          {sn.modalidad ? ` · ${sn.modalidad === 'dobles' ? 'Dobles' : 'Singles'}` : ''}
                        </Text>
                        <Text style={estilosTenis.textoCard}>
                          {sn.jugadores.map(j => `${j.nombre}${j.cobrado ? ' (cobrado)' : ''}`).join(', ') || 'Sin jugadores'}
                        </Text>
                        {!!sn.estado && <Text style={estilosTenis.mutedCard}>{ESTADOS_RESERVA[sn.estado] ?? sn.estado}</Text>}
                        {!!sn.comentario && <Text style={estilosTenis.mutedCard}>Comentario: {sn.comentario}</Text>}
                      </>
                    )}
                    <Text style={estilosTenis.mutedCard}>{momento(v.hecho_at)} · {v.hecho_por ?? 'Sistema'}</Text>
                  </View>
                )
              })}
            </>
          )}
          {!loading && !error && !h && <Text style={estilosTenis.vacio}>No hay historial para esta reserva.</Text>}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}

const s = StyleSheet.create({
  cargando: { marginVertical: 24 },
  version:  { marginBottom: 8 },
  accion:   { fontFamily: fonts.label, fontSize: 14, letterSpacing: 1, color: colors.oro },
})
