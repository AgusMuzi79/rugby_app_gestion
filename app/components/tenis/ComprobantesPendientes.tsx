import { useCallback, useState } from 'react'
import { View, Text, Modal, Image, TextInput, ScrollView, ActivityIndicator, Linking, Alert, StyleSheet, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, fonts } from '@/constants/theme'
import { ErrorCarga } from '@/components/shared/ErrorCarga'
import { accionesTenis, useAjustesCobro, useComprobantesPendientes, type ComprobantePendiente } from '@/hooks/useTenisGestor'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'
import { etiquetaDiaCorta, fechaArgentina, horaArgentina, inicioReal } from '@/lib/tenis'
import { formatMonto } from '@/lib/formatoMonto'
import { AjustesCobro } from './AjustesCobro'
import { Aviso, BarraModal, Boton, estilosTenis } from './ui'

// Comprobantes de transferencia de invitados (reserva desde la web) que
// esperan revisión: ver la imagen, aprobar o rechazar con motivo (el rechazo
// le manda un mail al invitado con ese motivo). Arriba, los ajustes de cobro
// pendientes (devoluciones / diferencias de reservas editadas o corregidas).

export function ComprobantesPendientes() {
  const { lista, loading, error, refetch: refetchComprobantes } = useComprobantesPendientes()
  const ajustes = useAjustesCobro()
  const refetchAjustes = ajustes.refetch
  const refetch = useCallback(() => { refetchComprobantes(); refetchAjustes() }, [refetchComprobantes, refetchAjustes])
  useRefreshOnFocus(refetch)
  const [imagen, setImagen] = useState<string | null>(null)
  const [abriendo, setAbriendo] = useState<string | null>(null)
  const [rechazando, setRechazando] = useState<ComprobantePendiente | null>(null)
  const [motivo, setMotivo] = useState('')
  const [resolviendo, setResolviendo] = useState<string | null>(null)
  const [errorAccion, setErrorAccion] = useState<string | null>(null)

  async function ver(c: ComprobantePendiente) {
    setAbriendo(c.reserva_id)
    const r = await accionesTenis.verComprobante(c.reserva_id)
    setAbriendo(null)
    if (!r.ok) { Alert.alert('No se pudo abrir', r.mensaje); return }
    if (r.data.esPdf) Linking.openURL(r.data.url).catch(() => Alert.alert('No se pudo abrir', 'Probá de nuevo.'))
    else setImagen(r.data.url)
  }

  async function resolver(c: ComprobantePendiente, aprobado: boolean, motivoTexto: string | null) {
    setResolviendo(c.reserva_id)
    setErrorAccion(null)
    const r = await accionesTenis.resolverComprobante(c.reserva_id, aprobado, motivoTexto)
    setResolviendo(null)
    if (!r.ok) { setErrorAccion(r.mensaje); return false }
    refetch()
    return true
  }

  function aprobar(c: ComprobantePendiente) {
    Alert.alert('Aprobar comprobante', `¿Aprobás el pago de ${c.titular} por ${formatMonto(c.total)}?`, [
      { text: 'No', style: 'cancel' },
      { text: 'Aprobar', onPress: () => { resolver(c, true, null) } },
    ])
  }

  async function confirmarRechazo() {
    if (!rechazando) return
    if (!motivo.trim()) { setErrorAccion('Escribí el motivo: le llega por mail al invitado.'); return }
    if (await resolver(rechazando, false, motivo.trim())) { setRechazando(null); setMotivo('') }
  }

  // Cada lista muestra su propio error con REINTENTAR: si falla una, no puede
  // parecer vacía ("sin ajustes" / "no hay comprobantes").
  const sinDatos = lista.length === 0 && ajustes.lista.length === 0
  if (sinDatos && !error && !ajustes.error && (loading || ajustes.loading)) {
    return <ActivityIndicator color={colors.oro} style={s.cargando} />
  }

  return (
    <ScrollView
      contentContainerStyle={s.contenido}
      refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={colors.oro} />}
    >
      {ajustes.error && (
        <View style={s.errorAjustes}>
          <Text style={estilosTenis.label}>AJUSTES PENDIENTES</Text>
          <ErrorCarga mensaje={ajustes.error} onReintentar={refetchAjustes} />
        </View>
      )}
      <AjustesCobro lista={ajustes.lista} onCambio={refetchAjustes} />
      {error
        ? <ErrorCarga mensaje={error} onReintentar={refetchComprobantes} />
        : lista.length === 0 && !loading && <Text style={estilosTenis.vacio}>No hay comprobantes para revisar.</Text>}
      {errorAccion && !rechazando && <Aviso tipo="error">{errorAccion}</Aviso>}
      {lista.map(c => (
        <View key={c.reserva_id} style={[estilosTenis.card, s.card]}>
          <Text style={s.titular}>{c.titular}</Text>
          {!!c.email && <Text style={estilosTenis.mutedCard}>{c.email}</Text>}
          <Text style={estilosTenis.textoCard}>
            Cancha {c.cancha} · {etiquetaDiaCorta(fechaArgentina(c.inicio))} · {inicioReal(c.inicio)} a {horaArgentina(c.fin)} · {c.modalidad === 'dobles' ? 'Dobles' : 'Singles'}
          </Text>
          <Text style={estilosTenis.textoCard}>Total {formatMonto(c.total)}</Text>
          {c.vence_at && (
            <Text style={estilosTenis.mutedCard}>Tiene que subirlo antes del {etiquetaDiaCorta(fechaArgentina(c.vence_at))} a las {horaArgentina(c.vence_at)}</Text>
          )}
          <Boton texto="VER COMPROBANTE" variante="secundario" cargando={abriendo === c.reserva_id} onPress={() => ver(c)} />
          <View style={s.acciones}>
            <View style={{ flex: 1 }}>
              <Boton texto="APROBAR" cargando={resolviendo === c.reserva_id} onPress={() => aprobar(c)} />
            </View>
            <View style={{ flex: 1 }}>
              <Boton texto="RECHAZAR" variante="peligro" disabled={resolviendo === c.reserva_id} onPress={() => { setRechazando(c); setMotivo(''); setErrorAccion(null) }} />
            </View>
          </View>
        </View>
      ))}

      <Modal visible={imagen !== null} animationType="fade" onRequestClose={() => setImagen(null)}>
        <SafeAreaView style={estilosTenis.sheet}>
          <BarraModal titulo="COMPROBANTE" onCerrar={() => setImagen(null)} />
          {imagen && <Image source={{ uri: imagen }} style={s.imagen} resizeMode="contain" accessibilityLabel="Imagen del comprobante" />}
        </SafeAreaView>
      </Modal>

      <Modal visible={rechazando !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setRechazando(null)}>
        <SafeAreaView style={estilosTenis.sheet}>
          <BarraModal titulo="RECHAZAR COMPROBANTE" onCerrar={() => setRechazando(null)} />
          <View style={estilosTenis.sheetCuerpo}>
            <Text style={estilosTenis.textoCard}>{rechazando?.titular} recibe un mail con este motivo.</Text>
            <Text style={estilosTenis.label}>MOTIVO</Text>
            <TextInput
              style={[estilosTenis.input, s.motivo]}
              value={motivo}
              onChangeText={setMotivo}
              placeholder="El monto no coincide, la imagen no se lee…"
              placeholderTextColor={colors.muted}
              multiline
              accessibilityLabel="Motivo del rechazo"
            />
            {errorAccion && <Aviso tipo="error">{errorAccion}</Aviso>}
            <Boton texto="RECHAZAR Y AVISAR" variante="peligro" cargando={resolviendo !== null} onPress={confirmarRechazo} />
          </View>
        </SafeAreaView>
      </Modal>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  contenido: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 60 },
  cargando:  { marginVertical: 24 },
  errorAjustes: { marginBottom: 12 },
  card:      { marginBottom: 12 },
  titular:   { fontFamily: fonts.label, fontSize: 16, letterSpacing: 1, color: colors.oro },
  acciones:  { flexDirection: 'row', gap: 12 },
  imagen:    { flex: 1, margin: 12 },
  motivo:    { minHeight: 96, textAlignVertical: 'top', paddingTop: 10 },
})
