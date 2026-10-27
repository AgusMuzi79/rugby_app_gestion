import { useState, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Modal,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { fonts } from '@/constants/theme'
import type { CobroJugador, FormaDePago } from '@/lib/cobrosPorDivision'
import type { CambioCobro, CobrosSubcomisionState } from '@/hooks/useCobrosSubcomision'
import { CARD, DIVIDER, FONDO, MUTED, ORO, ROJO, ROJO_TEXTO, SOBRE_ORO, TEXTO, VERDE, formatMonto } from './estilo'

// Cobros de una recaudación de Subcomisión agrupados por división: resumen por
// división y, en cada una, sus jugadores. Tocar un jugador abre el modal para
// marcar pagado (monto + forma de pago) o volver a pendiente.

const FORMA_OPS: Array<{ key: FormaDePago; label: string }> = [
  { key: 'efectivo',      label: 'EFECTIVO' },
  { key: 'transferencia', label: 'TRANSF.' },
  { key: 'otro',          label: 'OTRO' },
]

// ─── Modal de pago ────────────────────────────────────────────────────────────

function ModalCobro({
  jugador, guardando, error, onClose, onGuardar,
}: {
  jugador: CobroJugador; guardando: boolean; error: string | null
  onClose: () => void; onGuardar: (c: CambioCobro) => void
}) {
  const [pagado, setPagado] = useState(jugador.estado === 'pagado')
  const [monto, setMonto]   = useState(jugador.monto)
  const [forma, setForma]   = useState<FormaDePago | null>(jugador.formaDePago)

  useEffect(() => {
    setPagado(jugador.estado === 'pagado')
    setMonto(jugador.monto)
    setForma(jugador.formaDePago)
  }, [jugador.jugadorId])

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={s.modalContainer}>
        <View style={s.modalHeader}>
          <View style={s.flex}>
            <Text style={s.modalSuper}>PAGO · JUGADOR</Text>
            <Text style={s.modalTitulo} numberOfLines={2}>{jugador.nombre}</Text>
          </View>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={s.modalClose} disabled={guardando}>
            <Ionicons name="close" size={20} color={MUTED} />
          </TouchableOpacity>
        </View>
        <View style={s.separador} />

        <ScrollView contentContainerStyle={s.modalScroll} keyboardShouldPersistTaps="handled">
          <View style={s.campo}>
            <Text style={s.campoLabel}>ESTADO</Text>
            <View style={s.selectorRow}>
              <TouchableOpacity
                style={[s.selectorBtn, pagado && s.selectorBtnPagado]}
                onPress={() => setPagado(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-circle" size={18} color={pagado ? FONDO : MUTED} style={s.iconMr} />
                <Text style={[s.selectorTexto, pagado && s.selectorTextoPagado]}>PAGADO</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.selectorBtn, !pagado && s.selectorBtnPendiente]}
                onPress={() => setPagado(false)}
                activeOpacity={0.8}
              >
                <Ionicons name="time-outline" size={18} color={!pagado ? ROJO : MUTED} style={s.iconMr} />
                <Text style={[s.selectorTexto, !pagado && s.selectorTextoPendiente]}>PENDIENTE</Text>
              </TouchableOpacity>
            </View>
          </View>

          {pagado && (
            <>
              <View style={s.campo}>
                <Text style={s.campoLabel}>MONTO</Text>
                <View style={s.montoWrap}>
                  <Text style={s.montoSimbolo}>$</Text>
                  <TextInput
                    style={s.montoInput}
                    value={monto}
                    onChangeText={setMonto}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={MUTED}
                    maxLength={12}
                  />
                </View>
              </View>

              <View style={s.campo}>
                <Text style={s.campoLabel}>FORMA DE PAGO</Text>
                <View style={s.selectorRow}>
                  {FORMA_OPS.map(({ key, label }) => {
                    const activo = forma === key
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[s.formaBtn, activo && s.formaBtnActivo]}
                        onPress={() => setForma(activo ? null : key)}
                        activeOpacity={0.75}
                      >
                        <Text style={[s.formaTexto, activo && s.formaTextoActivo]}>{label}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>
            </>
          )}

          {error && (
            <View style={s.bannerError}>
              <Text style={s.bannerErrorTexto}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[s.botonPrincipal, guardando && s.botonPrincipalOff]}
            onPress={() => onGuardar({ pagado, monto, formaDePago: forma })}
            disabled={guardando}
            activeOpacity={0.85}
          >
            {guardando
              ? <ActivityIndicator color={SOBRE_ORO} size="small" />
              : <Text style={s.botonPrincipalTexto}>GUARDAR</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function CobrosPanel({
  estado, onGuardado,
}: {
  estado: CobrosSubcomisionState
  onGuardado?: () => void   // p. ej. refrescar el resumen Cobrado / Egresos / Neto
}) {
  const { cargando, errorCarga, recargar, editable, cobros, guardandoId, errorGuardado, limpiarError, guardarCobro } = estado
  const [modalId, setModalId] = useState<string | null>(null)

  const jugadorModal = modalId
    ? cobros.divisiones.flatMap(d => d.jugadores).find(j => j.jugadorId === modalId) ?? null
    : null

  function abrir(id: string) {
    if (!editable) return
    limpiarError()
    setModalId(id)
  }

  async function guardar(c: CambioCobro) {
    if (!modalId) return
    const ok = await guardarCobro(modalId, c)
    if (ok) {
      setModalId(null)
      onGuardado?.()
    }
  }

  if (cargando && cobros.divisiones.length === 0) {
    return <ActivityIndicator color={ORO} style={s.loader} />
  }

  return (
    <View style={s.wrap}>
      {errorCarga && (
        <TouchableOpacity style={s.bannerError} onPress={recargar} activeOpacity={0.8}>
          <Text style={s.bannerErrorTexto}>{errorCarga} Tocá para reintentar.</Text>
        </TouchableOpacity>
      )}

      {!editable && (
        <View style={s.bannerInfo}>
          <Text style={s.bannerInfoTexto}>Evento cerrado: los pagos quedan sólo para consulta.</Text>
        </View>
      )}

      <Text style={s.totalTexto}>
        {cobros.total.pagados} PAGADOS · {cobros.total.pendientes} PENDIENTES · {formatMonto(cobros.total.cobrado)}
      </Text>

      {cobros.divisiones.length === 0 && !errorCarga ? (
        <Text style={s.emptyTexto}>Sin jugadores en las divisiones del evento.</Text>
      ) : (
        cobros.divisiones.map(d => (
          <View key={d.divisionId ?? '_'} style={s.divCard}>
            <View style={s.divHeader}>
              <Text style={s.divNombre} numberOfLines={1}>{d.divisionNombre}</Text>
              <Text style={s.divStats}>
                {d.pagados}/{d.pagados + d.pendientes} · {formatMonto(d.cobrado)}
              </Text>
            </View>
            {d.jugadores.map(j => {
              const pagado = j.estado === 'pagado'
              return (
                <TouchableOpacity
                  key={j.jugadorId}
                  style={s.fila}
                  onPress={() => abrir(j.jugadorId)}
                  activeOpacity={editable ? 0.8 : 1}
                  disabled={guardandoId === j.jugadorId}
                >
                  <Text style={s.filaNombre} numberOfLines={1}>{j.nombre}</Text>
                  {pagado && <Text style={s.filaMonto}>{formatMonto(j.montoPagado)}</Text>}
                  <View style={[s.estadoBadge, pagado ? s.estadoPagado : s.estadoPendiente]}>
                    <Text style={[s.estadoTexto, pagado ? s.estadoPagadoTexto : s.estadoPendienteTexto]}>
                      {pagado ? 'PAGADO' : 'PENDIENTE'}
                    </Text>
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>
        ))
      )}

      <Modal visible={jugadorModal !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalId(null)}>
        {jugadorModal && (
          <ModalCobro
            jugador={jugadorModal}
            guardando={guardandoId === jugadorModal.jugadorId}
            error={errorGuardado}
            onClose={() => setModalId(null)}
            onGuardar={guardar}
          />
        )}
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  flex:   { flex: 1 },
  wrap:   { gap: 12 },
  loader: { marginTop: 16 },

  totalTexto: { fontFamily: fonts.label, fontSize: 13, color: MUTED, letterSpacing: 0.5 },
  emptyTexto: { fontFamily: fonts.cuerpo, color: MUTED, fontSize: 16, fontStyle: 'italic' },

  // División
  divCard:   { borderWidth: 1, borderColor: DIVIDER, borderRadius: 4, backgroundColor: CARD, paddingHorizontal: 14, paddingBottom: 4 },
  divHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: DIVIDER },
  divNombre: { flex: 1, fontFamily: fonts.label, fontSize: 14, letterSpacing: 1.5, color: ORO, marginRight: 8 },
  divStats:  { fontFamily: fonts.label, fontSize: 13, color: MUTED },

  // Jugador
  fila:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 10 },
  filaNombre: { flex: 1, fontFamily: fonts.cuerpo, fontSize: 16, fontWeight: '700', color: TEXTO },
  filaMonto:  { fontFamily: fonts.label, fontSize: 13, color: MUTED },
  estadoBadge:          { borderRadius: 2, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  estadoPagado:         { backgroundColor: VERDE, borderColor: VERDE },
  estadoPendiente:      { backgroundColor: 'transparent', borderColor: DIVIDER },
  estadoTexto:          { fontFamily: fonts.label, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  estadoPagadoTexto:    { color: '#FFFFFF' },
  estadoPendienteTexto: { color: MUTED },

  // Banners
  bannerError:      { backgroundColor: '#2A1010', borderLeftWidth: 3, borderLeftColor: ROJO, borderRadius: 4, padding: 12 },
  bannerErrorTexto: { fontFamily: fonts.cuerpo, fontSize: 15, color: '#FFAAAA' },
  bannerInfo:       { borderWidth: 1, borderColor: DIVIDER, borderLeftWidth: 3, borderLeftColor: ORO, borderRadius: 4, padding: 12 },
  bannerInfoTexto:  { fontFamily: fonts.cuerpo, fontSize: 15, color: TEXTO },

  // Modal
  modalContainer: { flex: 1, backgroundColor: FONDO },
  modalHeader:    { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 18 },
  modalSuper:     { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: ORO, marginBottom: 4 },
  modalTitulo:    { fontFamily: fonts.titulo, fontSize: 26, color: TEXTO },
  modalClose:     { padding: 4, marginTop: 4 },
  separador:      { height: 1, backgroundColor: DIVIDER, marginHorizontal: 20 },
  modalScroll:    { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48, gap: 24 },
  campo:          { gap: 10 },
  campoLabel:     { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: ORO },

  selectorRow:            { flexDirection: 'row', gap: 10 },
  selectorBtn:            { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 3, borderWidth: 1.5, borderColor: DIVIDER },
  selectorBtnPagado:      { backgroundColor: ORO, borderColor: ORO },
  selectorBtnPendiente:   { borderColor: ROJO },
  selectorTexto:          { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1.5, color: MUTED, fontWeight: '700' },
  selectorTextoPagado:    { color: SOBRE_ORO },
  selectorTextoPendiente: { color: ROJO_TEXTO },
  iconMr:                 { marginRight: 6 },

  montoWrap:    { flexDirection: 'row', alignItems: 'flex-end', borderBottomWidth: 1.5, borderBottomColor: ORO, paddingBottom: 8 },
  montoSimbolo: { fontFamily: fonts.label, fontSize: 23, color: MUTED, marginRight: 6, lineHeight: 36 },
  montoInput:   { flex: 1, fontFamily: fonts.cuerpo, fontSize: 32, fontWeight: '700', color: TEXTO, padding: 0 },

  formaBtn:         { flex: 1, paddingVertical: 10, borderRadius: 3, borderWidth: 1.5, borderColor: DIVIDER, alignItems: 'center' },
  formaBtnActivo:   { backgroundColor: ORO, borderColor: ORO },
  formaTexto:       { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, color: MUTED, fontWeight: '700' },
  formaTextoActivo: { color: SOBRE_ORO },

  botonPrincipal:      { backgroundColor: ORO, paddingVertical: 15, borderRadius: 3, alignItems: 'center' },
  botonPrincipalOff:   { opacity: 0.6 },
  botonPrincipalTexto: { fontFamily: fonts.label, color: SOBRE_ORO, fontSize: 13, letterSpacing: 2.5, fontWeight: '700' },
})
