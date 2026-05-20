import { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import {
  useCobranzas,
  EventoFinanciero,
  CobranzaJugador,
  FormaDePago,
} from '@/hooks/useCobranzas'
import { colors, fonts } from '@/constants/theme'
import { useTheme } from '@/contexts/ThemeContext'

// ─── Design tokens ────────────────────────────────────────────────────────────

const PAPEL     = colors.papel        // '#F6F1E4'
const TINTA     = colors.tinta        // '#0E0E0E'
const ORO       = colors.oro          // '#E8B53C'
const ORO_HONDO = colors.oroHondo     // '#C9961F'
const GRIS      = colors.grisClaro    // '#E5E0D0'
const ROJO      = colors.rojoUrgente  // '#C0392B'
const MUTED     = '#7C7267'
const DIVIDER   = '#D9D3C4'
const VERDE     = '#4A7C59'

const TIPO_LABEL: Record<string, string> = {
  viaje:         'VIAJE',
  tercer_tiempo: '3er TIEMPO',
  recaudacion:   'RECAUDACIÓN',
}

const FORMA_OPS: Array<{ key: FormaDePago; label: string }> = [
  { key: 'efectivo',      label: 'EFECTIVO' },
  { key: 'transferencia', label: 'TRANSF.' },
  { key: 'otro',          label: 'OTRO' },
]

function formatFecha(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function formatMonto(n: number) {
  return '$ ' + n.toLocaleString('es-AR', {
    minimumFractionDigits: 0, maximumFractionDigits: 2,
  })
}

// ─── Barra de progreso ────────────────────────────────────────────────────────

function BarraProgreso({ pct }: { pct: number }) {
  const filled = Math.min(Math.max(pct, 0), 100)
  return (
    <View style={s.progWrap}>
      <View style={[s.progFill, { width: `${filled}%` }]} />
    </View>
  )
}

// ─── Card de evento financiero ────────────────────────────────────────────────

function EventoCard({
  evento,
  onSelect,
}: {
  evento: EventoFinanciero
  onSelect: (ev: EventoFinanciero) => void
}) {
  const { pctCobrado, countPagados, countJugadores, montoCobrado } = evento
  return (
    <TouchableOpacity style={s.eventoCard} onPress={() => onSelect(evento)} activeOpacity={0.82}>
      {/* Tipo + % badge */}
      <View style={s.eventoCardHead}>
        <View style={s.tipoBadge}>
          <Text style={s.tipoBadgeTexto}>{TIPO_LABEL[evento.tipo] ?? evento.tipo}</Text>
        </View>
        <View style={s.pctBadge}>
          <Text style={s.pctBadgeTexto}>{pctCobrado}%</Text>
        </View>
      </View>

      {/* Nombre + fecha */}
      <Text style={s.eventoNombre} numberOfLines={2}>{evento.nombre}</Text>
      {evento.fecha && (
        <Text style={s.eventoFecha}>{formatFecha(evento.fecha)}</Text>
      )}

      {/* Progreso */}
      <BarraProgreso pct={pctCobrado} />

      {/* Stats */}
      <Text style={s.eventoStats}>
        {countPagados}/{countJugadores} PAGADOS
        {montoCobrado > 0 ? `  ·  ${formatMonto(montoCobrado)}` : ''}
      </Text>

      <Ionicons
        name="chevron-forward"
        size={14}
        color={MUTED}
        style={{ position: 'absolute', right: 14, top: '50%' }}
      />
    </TouchableOpacity>
  )
}

// ─── Fila de jugador en el detalle ────────────────────────────────────────────

function FilaJugador({
  jugador,
  index,
  onTap,
}: {
  jugador: CobranzaJugador
  index: number
  onTap: (id: string) => void
}) {
  const pagado = jugador.estado === 'pagado'
  const numero = String(index + 1).padStart(2, '0')
  return (
    <TouchableOpacity style={s.filaJugador} onPress={() => onTap(jugador.jugadorId)} activeOpacity={0.8}>
      <Text style={s.filaNumero}>{numero}</Text>
      <Text style={s.filaNombre} numberOfLines={1}>{jugador.nombre}</Text>
      <View style={[s.estadoBadge, pagado ? s.estadoPagado : s.estadoPendiente]}>
        <Text style={[s.estadoTexto, pagado ? s.estadoPagadoTexto : s.estadoPendienteTexto]}>
          {pagado ? 'PAGADO' : 'PENDIENTE'}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

// ─── Barra de resumen (detalle del evento) ────────────────────────────────────

function BarraResumen({
  pagados, pendientes, cobrado,
}: {
  pagados: number; pendientes: number; cobrado: number
}) {
  return (
    <View style={s.resumenBar}>
      <View style={s.resumenItem}>
        <Text style={s.resumenVal}>{formatMonto(cobrado)}</Text>
        <Text style={s.resumenLabel}>COBRADO</Text>
      </View>
      <View style={s.resumenDiv} />
      <View style={s.resumenItem}>
        <Text style={[s.resumenVal, { color: VERDE }]}>{pagados}</Text>
        <Text style={s.resumenLabel}>PAGADOS</Text>
      </View>
      <View style={s.resumenDiv} />
      <View style={s.resumenItem}>
        <Text style={[s.resumenVal, { color: pendientes > 0 ? ROJO : MUTED }]}>{pendientes}</Text>
        <Text style={s.resumenLabel}>PENDIENTES</Text>
      </View>
    </View>
  )
}

// ─── Modal de pago ────────────────────────────────────────────────────────────

function ModalPago({
  jugador,
  guardando,
  error,
  onClose,
  onGuardar,
  onToggle,
  onMonto,
  onForma,
}: {
  jugador: CobranzaJugador
  guardando: boolean
  error: string | null
  onClose: () => void
  onGuardar: () => void
  onToggle: (id: string) => void
  onMonto: (id: string, v: string) => void
  onForma: (id: string, f: FormaDePago) => void
}) {
  const pagado = jugador.estado === 'pagado'

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeAreaView style={s.modalContainer}>
        {/* Header */}
        <View style={s.modalHeader}>
          <View>
            <Text style={s.modalSuper}>PAGO · JUGADOR</Text>
            <Text style={s.modalTitulo} numberOfLines={2}>{jugador.nombre}</Text>
          </View>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={s.modalClose} disabled={guardando}>
            <Ionicons name="close" size={20} color={MUTED} />
          </TouchableOpacity>
        </View>
        <View style={s.separador} />

        <ScrollView contentContainerStyle={s.modalScroll} keyboardShouldPersistTaps="handled">
          {/* Selector PAGADO / PENDIENTE */}
          <View style={s.campo}>
            <Text style={s.campoLabel}>ESTADO</Text>
            <View style={s.estadoSelector}>
              <TouchableOpacity
                style={[s.estadoSelectorBtn, pagado && s.estadoSelectorBtnActivo]}
                onPress={() => !pagado && onToggle(jugador.jugadorId)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color={pagado ? TINTA : MUTED}
                  style={{ marginRight: 6 }}
                />
                <Text style={[s.estadoSelectorTexto, pagado && s.estadoSelectorTextoActivo]}>
                  PAGADO
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.estadoSelectorBtn, !pagado && s.estadoPendienteSelector]}
                onPress={() => pagado && onToggle(jugador.jugadorId)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="time-outline"
                  size={18}
                  color={!pagado ? ROJO : MUTED}
                  style={{ marginRight: 6 }}
                />
                <Text style={[s.estadoSelectorTexto, !pagado && { color: ROJO }]}>
                  PENDIENTE
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Monto y forma de pago — solo si pagado */}
          {pagado && (
            <>
              <View style={s.campo}>
                <Text style={s.campoLabel}>MONTO</Text>
                <View style={s.montoWrap}>
                  <Text style={s.montoSimbolo}>$</Text>
                  <TextInput
                    style={s.montoInput}
                    value={jugador.monto}
                    onChangeText={v => onMonto(jugador.jugadorId, v)}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={MUTED}
                    maxLength={10}
                  />
                </View>
              </View>

              <View style={s.campo}>
                <Text style={s.campoLabel}>FORMA DE PAGO</Text>
                <View style={s.formaRow}>
                  {FORMA_OPS.map(({ key, label }) => {
                    const activo = jugador.formaDePago === key
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[s.formaBtn, activo && s.formaBtnActivo]}
                        onPress={() => onForma(jugador.jugadorId, key)}
                        activeOpacity={0.75}
                      >
                        <Text style={[s.formaBtnTexto, activo && s.formaBtnTextoActivo]}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>
            </>
          )}

          {/* Error */}
          {error && (
            <View style={s.bannerError}>
              <Text style={s.bannerErrorTexto}>{error}</Text>
            </View>
          )}

          {/* Botón guardar */}
          <TouchableOpacity
            style={[s.botonPrincipal, guardando && { opacity: 0.6 }]}
            onPress={onGuardar}
            disabled={guardando}
            activeOpacity={0.85}
          >
            {guardando
              ? <ActivityIndicator color={ORO} size="small" />
              : <Text style={s.botonPrincipalTexto}>GUARDAR</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  )
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function CobranzasScreen() {
  const {
    loading, divisionNombre, sinDivision,
    eventos, eventoSeleccionado, paso,
    cargandoJugadores, jugadores, resumen,
    guardando, guardadoOk, error,
    seleccionarEvento, volverAEventos,
    toggleEstado, actualizarMonto, actualizarFormaDePago,
    guardarCobranzas,
  } = useCobranzas()

  const { colors: tc } = useTheme()
  const [modalJugadorId, setModalJugadorId] = useState<string | null>(null)
  const jugadorModal = jugadores.find(j => j.jugadorId === modalJugadorId) ?? null

  function handleGuardarModal() {
    guardarCobranzas()
    setModalJugadorId(null)
  }

  if (loading) {
    return (
      <SafeAreaView style={s.centrado}>
        <ActivityIndicator color={ORO} size="large" />
      </SafeAreaView>
    )
  }

  if (sinDivision) {
    return (
      <SafeAreaView style={s.centrado}>
        <Text style={s.mutedTexto}>Sin división asignada.</Text>
        <Text style={s.mutedTexto}>Contactá a la Subcomisión.</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[s.container, { backgroundColor: tc.fondo }]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.labelHeader}>
          {paso === 'jugadores' && eventoSeleccionado
            ? `MANAGER · ${divisionNombre.toUpperCase()} · EVENTO`
            : `MANAGER · ${divisionNombre.toUpperCase()}`}
        </Text>
        <Text style={s.titulo}>Cobranzas</Text>
      </View>
      <View style={s.separador} />

      {/* ── Paso: Eventos ── */}
      {paso === 'eventos' && (
        <ScrollView contentContainerStyle={s.lista}>
          <View style={s.seccionHeader}>
            <Text style={s.seccionLabel}>EVENTOS ACTIVOS</Text>
            <Text style={s.seccionConteo}>{eventos.length}</Text>
          </View>

          {eventos.length === 0 ? (
            <View style={{ gap: 6, marginTop: 8 }}>
              <Text style={s.emptyTexto}>Sin eventos activos.</Text>
              <Text style={s.emptySubtexto}>
                La Subcomisión o el Coordinador deben crear viajes, tercer tiempos o recaudaciones.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 12, marginTop: 8 }}>
              {eventos.map(ev => (
                <EventoCard key={ev.id} evento={ev} onSelect={seleccionarEvento} />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* ── Paso: Jugadores ── */}
      {paso === 'jugadores' && (
        <View style={{ flex: 1 }}>
          {/* Volver */}
          <TouchableOpacity style={s.volverBtn} onPress={volverAEventos} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={16} color={ORO} />
            <Text style={s.volverTexto}>Eventos</Text>
          </TouchableOpacity>

          {/* Header del evento seleccionado */}
          {eventoSeleccionado && (
            <View style={s.eventoResumen}>
              <View style={s.tipoBadge}>
                <Text style={s.tipoBadgeTexto}>{TIPO_LABEL[eventoSeleccionado.tipo] ?? eventoSeleccionado.tipo}</Text>
              </View>
              <Text style={s.eventoResumenNombre} numberOfLines={2}>{eventoSeleccionado.nombre}</Text>
              {eventoSeleccionado.fecha && (
                <Text style={s.eventoFecha}>{formatFecha(eventoSeleccionado.fecha)}</Text>
              )}
            </View>
          )}

          {/* Resumen */}
          <BarraResumen
            pagados={resumen.pagados}
            pendientes={resumen.pendientes}
            cobrado={resumen.cobrado}
          />
          <View style={s.separador} />

          {cargandoJugadores ? (
            <View style={s.centrado}>
              <ActivityIndicator color={ORO} />
            </View>
          ) : (
            <ScrollView contentContainerStyle={s.jugadoresList}>
              {jugadores.length === 0 ? (
                <Text style={s.emptyTexto}>Sin jugadores activos en la división.</Text>
              ) : (
                jugadores.map((j, i) => (
                  <View key={j.jugadorId}>
                    {i > 0 && <View style={s.filaDiv} />}
                    <FilaJugador
                      jugador={j}
                      index={i}
                      onTap={setModalJugadorId}
                    />
                  </View>
                ))
              )}

              {error && (
                <View style={s.bannerError}>
                  <Text style={s.bannerErrorTexto}>{error}</Text>
                </View>
              )}

              {guardadoOk && (
                <View style={s.bannerOk}>
                  <Text style={s.bannerOkTexto}>COBRANZAS GUARDADAS</Text>
                </View>
              )}
            </ScrollView>
          )}

          {/* Botón guardar global */}
          {!cargandoJugadores && jugadores.length > 0 && (
            <View style={s.bottomBar}>
              <TouchableOpacity
                style={[s.botonPrincipal, guardando && { opacity: 0.6 }]}
                onPress={guardarCobranzas}
                disabled={guardando}
                activeOpacity={0.85}
              >
                {guardando
                  ? <ActivityIndicator color={ORO} size="small" />
                  : <Text style={s.botonPrincipalTexto}>GUARDAR TODOS</Text>
                }
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Modal de pago por jugador */}
      <Modal visible={modalJugadorId !== null} animationType="slide" presentationStyle="pageSheet">
        {jugadorModal && (
          <ModalPago
            jugador={jugadorModal}
            guardando={guardando}
            error={error}
            onClose={() => setModalJugadorId(null)}
            onGuardar={handleGuardarModal}
            onToggle={toggleEstado}
            onMonto={actualizarMonto}
            onForma={actualizarFormaDePago}
          />
        )}
      </Modal>
    </SafeAreaView>
  )
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: PAPEL },
  centrado:   { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: PAPEL, gap: 8 },
  mutedTexto: { color: MUTED, fontSize: 13, fontFamily: fonts.cuerpo, fontStyle: 'italic', textAlign: 'center' },

  // Header
  header:      { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  labelHeader: { fontSize: 10, letterSpacing: 2, color: ORO, fontFamily: fonts.label, marginBottom: 4 },
  titulo:      { fontSize: 32, fontStyle: 'italic', fontFamily: fonts.titulo, color: TINTA, lineHeight: 38 },
  separador:   { height: 1, backgroundColor: DIVIDER, marginHorizontal: 20 },

  // Lista eventos
  lista:         { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  seccionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seccionLabel:  { fontSize: 10, letterSpacing: 2, color: ORO, fontFamily: fonts.label },
  seccionConteo: { fontSize: 13, color: MUTED, fontWeight: '600' },
  emptyTexto:    { color: MUTED, fontSize: 14, fontStyle: 'italic', fontFamily: fonts.cuerpo },
  emptySubtexto: { color: MUTED, fontSize: 12, fontFamily: fonts.cuerpo, lineHeight: 18 },

  // Evento card
  eventoCard:     { borderWidth: 1, borderColor: DIVIDER, borderRadius: 4, padding: 16, backgroundColor: PAPEL, gap: 8 },
  eventoCardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eventoNombre:   { fontSize: 16, fontWeight: '700', color: TINTA, fontFamily: fonts.cuerpo, lineHeight: 22 },
  eventoFecha:    { fontSize: 11, color: MUTED, fontFamily: fonts.label, letterSpacing: 0.5 },
  eventoStats:    { fontSize: 10, color: MUTED, fontFamily: fonts.label, letterSpacing: 0.5 },

  // Tipo badge
  tipoBadge:      { alignSelf: 'flex-start', borderWidth: 1, borderColor: DIVIDER, borderRadius: 2, paddingHorizontal: 7, paddingVertical: 3 },
  tipoBadgeTexto: { fontSize: 9, letterSpacing: 1.5, color: MUTED, fontFamily: fonts.label, fontWeight: '700' },

  // % badge
  pctBadge:      { backgroundColor: ORO, borderRadius: 2, paddingHorizontal: 8, paddingVertical: 3 },
  pctBadgeTexto: { fontSize: 12, fontWeight: '700', color: TINTA, fontFamily: fonts.label },

  // Barra de progreso
  progWrap: { height: 4, backgroundColor: GRIS, borderRadius: 2, overflow: 'hidden' },
  progFill: { height: 4, backgroundColor: ORO, borderRadius: 2 },

  // Volver
  volverBtn:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, gap: 4 },
  volverTexto:{ fontSize: 13, color: ORO, fontFamily: fonts.label, letterSpacing: 0.5 },

  // Header evento seleccionado (detalle)
  eventoResumen:       { paddingHorizontal: 20, paddingBottom: 14, gap: 6 },
  eventoResumenNombre: { fontSize: 20, fontStyle: 'italic', fontFamily: fonts.titulo, color: TINTA, lineHeight: 26 },

  // Barra de resumen
  resumenBar:  { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 14 },
  resumenItem: { flex: 1, alignItems: 'center', gap: 3 },
  resumenDiv:  { width: 1, backgroundColor: DIVIDER, marginVertical: 4 },
  resumenLabel:{ fontSize: 9, letterSpacing: 1.5, color: MUTED, fontFamily: fonts.label },
  resumenVal:  { fontSize: 16, fontWeight: '700', color: TINTA, fontFamily: fonts.cuerpo },

  // Lista jugadores
  jugadoresList: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  filaDiv:       { height: 1, backgroundColor: DIVIDER },

  // Fila jugador
  filaJugador: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 10 },
  filaNumero:  { fontSize: 11, color: MUTED, fontFamily: fonts.label, width: 20, textAlign: 'right' },
  filaNombre:  { flex: 1, fontSize: 14, fontWeight: '700', color: TINTA, fontFamily: fonts.cuerpo },

  // Badges de estado en la lista
  estadoBadge:          { borderRadius: 2, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  estadoPagado:         { backgroundColor: VERDE, borderColor: VERDE },
  estadoPendiente:      { backgroundColor: 'transparent', borderColor: DIVIDER },
  estadoTexto:          { fontSize: 9, fontWeight: '700', letterSpacing: 1, fontFamily: fonts.label },
  estadoPagadoTexto:    { color: '#FFFFFF' },
  estadoPendienteTexto: { color: MUTED },

  // Bottom bar
  bottomBar: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: DIVIDER, backgroundColor: PAPEL },

  // Banners
  bannerError:      { marginTop: 12, backgroundColor: '#FEF2F2', borderLeftWidth: 3, borderLeftColor: ROJO, borderRadius: 4, padding: 12 },
  bannerErrorTexto: { fontSize: 13, color: '#991B1B', fontFamily: fonts.cuerpo },
  bannerOk:         { marginTop: 12, backgroundColor: TINTA, borderLeftWidth: 3, borderLeftColor: ORO, borderRadius: 4, padding: 14 },
  bannerOkTexto:    { fontSize: 11, color: ORO, fontWeight: '700', fontFamily: fonts.label, letterSpacing: 2 },

  // Modal
  modalContainer: { flex: 1, backgroundColor: PAPEL },
  modalHeader:    { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 18 },
  modalSuper:     { fontSize: 10, letterSpacing: 2, color: ORO, fontFamily: fonts.label, marginBottom: 4 },
  modalTitulo:    { fontSize: 26, fontStyle: 'italic', fontFamily: fonts.titulo, color: TINTA, maxWidth: '85%' },
  modalClose:     { padding: 4, marginTop: 4 },
  modalScroll:    { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48, gap: 24 },

  // Campos del modal
  campo:     { gap: 10 },
  campoLabel:{ fontSize: 10, letterSpacing: 2, color: ORO, fontFamily: fonts.label },

  // Selector PAGADO / PENDIENTE
  estadoSelector:            { flexDirection: 'row', gap: 10 },
  estadoSelectorBtn:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 3, borderWidth: 1.5, borderColor: DIVIDER },
  estadoSelectorBtnActivo:   { backgroundColor: ORO, borderColor: ORO },
  estadoPendienteSelector:   { borderColor: ROJO },
  estadoSelectorTexto:       { fontSize: 11, letterSpacing: 1.5, color: MUTED, fontFamily: fonts.label, fontWeight: '700' },
  estadoSelectorTextoActivo: { color: TINTA },

  // Monto
  montoWrap:   { flexDirection: 'row', alignItems: 'flex-end', borderBottomWidth: 1.5, borderBottomColor: ORO, paddingBottom: 8 },
  montoSimbolo:{ fontSize: 22, color: MUTED, fontFamily: fonts.label, marginRight: 6, lineHeight: 36 },
  montoInput:  { flex: 1, fontSize: 32, fontWeight: '700', color: TINTA, fontFamily: fonts.cuerpo, padding: 0 },

  // Forma de pago
  formaRow:           { flexDirection: 'row', gap: 8 },
  formaBtn:           { flex: 1, paddingVertical: 10, borderRadius: 3, borderWidth: 1.5, borderColor: DIVIDER, alignItems: 'center' },
  formaBtnActivo:     { backgroundColor: TINTA, borderColor: TINTA },
  formaBtnTexto:      { fontSize: 10, letterSpacing: 1, color: MUTED, fontFamily: fonts.label, fontWeight: '700' },
  formaBtnTextoActivo:{ color: ORO },

  // Botón principal
  botonPrincipal:      { backgroundColor: TINTA, paddingVertical: 15, borderRadius: 3, alignItems: 'center' },
  botonPrincipalTexto: { color: ORO, fontSize: 11, letterSpacing: 2.5, fontFamily: fonts.label, fontWeight: '700' },
})
