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

// ─── Tokens ───────────────────────────────────────────────────────────────────

const FONDO     = '#15110A'
const CARD      = '#1C1710'
const TEXTO     = '#F3EFE4'
const MUTED     = '#8E8574'
const DIVIDER   = '#2C2418'
const ORO       = colors.oro
const ORO_HONDO = colors.oroHondo
const ROJO      = colors.rojoUrgente
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
  return '$ ' + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

// ─── Barra de progreso ────────────────────────────────────────────────────────

function BarraProgreso({ pct }: { pct: number }) {
  const filled = Math.min(Math.max(pct, 0), 100)
  return (
    <View style={s.progWrap}>
      {/* width is truly dynamic — keep inline */}
      <View style={[s.progFill, { width: `${filled}%` }]} />
    </View>
  )
}

// ─── Card de evento financiero ────────────────────────────────────────────────

function EventoCard({
  evento, onSelect,
}: {
  evento: EventoFinanciero; onSelect: (ev: EventoFinanciero) => void
}) {
  const { pctCobrado, countPagados, countJugadores, montoCobrado } = evento
  return (
    <TouchableOpacity style={s.eventoCard} onPress={() => onSelect(evento)} activeOpacity={0.82}>
      <View style={s.eventoCardHead}>
        <View style={s.tipoBadge}>
          <Text style={s.tipoBadgeTexto}>{TIPO_LABEL[evento.tipo] ?? evento.tipo}</Text>
        </View>
        <View style={s.pctBadge}>
          <Text style={s.pctBadgeTexto}>{pctCobrado}%</Text>
        </View>
      </View>

      <Text style={s.eventoNombre} numberOfLines={2}>{evento.nombre}</Text>
      {evento.fecha && (
        <Text style={s.eventoFecha}>{formatFecha(evento.fecha)}</Text>
      )}

      <BarraProgreso pct={pctCobrado} />

      <Text style={s.eventoStats}>
        {countPagados}/{countJugadores} PAGADOS
        {montoCobrado > 0 ? `  ·  ${formatMonto(montoCobrado)}` : ''}
      </Text>

      {/* position 'absolute' with a fixed offset is safe in StyleSheet */}
      <Ionicons
        name="chevron-forward"
        size={14}
        color={MUTED}
        style={s.eventoChevron}
      />
    </TouchableOpacity>
  )
}

// ─── Fila de jugador en el detalle ────────────────────────────────────────────

function FilaJugador({
  jugador, index, onTap,
}: {
  jugador: CobranzaJugador; index: number; onTap: (id: string) => void
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

// ─── Barra de resumen ─────────────────────────────────────────────────────────

function BarraResumen({
  pagados, pendientes, cobrado,
}: {
  pagados: number; pendientes: number; cobrado: number
}) {
  return (
    <View style={s.resumenBar}>
      <View style={s.resumenItem}>
        <Text style={[s.resumenVal, s.resumenValTexto]}>{formatMonto(cobrado)}</Text>
        <Text style={s.resumenLabel}>COBRADO</Text>
      </View>
      <View style={s.resumenDiv} />
      <View style={s.resumenItem}>
        <Text style={[s.resumenVal, s.resumenValVerde]}>{pagados}</Text>
        <Text style={s.resumenLabel}>PAGADOS</Text>
      </View>
      <View style={s.resumenDiv} />
      <View style={s.resumenItem}>
        <Text style={[s.resumenVal, pendientes > 0 ? s.resumenValRojo : s.resumenValMuted]}>{pendientes}</Text>
        <Text style={s.resumenLabel}>PENDIENTES</Text>
      </View>
    </View>
  )
}

// ─── Modal de pago ────────────────────────────────────────────────────────────

function ModalPago({
  jugador, guardando, error, onClose, onGuardar, onToggle, onMonto, onForma,
}: {
  jugador: CobranzaJugador; guardando: boolean; error: string | null
  onClose: () => void; onGuardar: () => void
  onToggle: (id: string) => void
  onMonto: (id: string, v: string) => void
  onForma: (id: string, f: FormaDePago) => void
}) {
  const pagado = jugador.estado === 'pagado'

  return (
    <KeyboardAvoidingView
      style={s.kavFlex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeAreaView style={s.modalContainer}>
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
          {/* Estado selector */}
          <View style={s.campo}>
            <Text style={s.campoLabel}>ESTADO</Text>
            <View style={s.estadoSelector}>
              <TouchableOpacity
                style={[s.estadoSelectorBtn, pagado && s.estadoSelectorBtnActivo]}
                onPress={() => !pagado && onToggle(jugador.jugadorId)}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-circle" size={18} color={pagado ? FONDO : MUTED} style={s.estadoIconMr} />
                <Text style={[s.estadoSelectorTexto, pagado && s.estadoSelectorTextoActivo]}>
                  PAGADO
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.estadoSelectorBtn, !pagado && s.estadoPendienteSelector]}
                onPress={() => pagado && onToggle(jugador.jugadorId)}
                activeOpacity={0.8}
              >
                <Ionicons name="time-outline" size={18} color={!pagado ? ROJO : MUTED} style={s.estadoIconMr} />
                <Text style={[s.estadoSelectorTexto, !pagado && s.estadoSelectorTextoPendiente]}>
                  PENDIENTE
                </Text>
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

          {error && (
            <View style={s.bannerError}>
              <Text style={s.bannerErrorTexto}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[s.botonPrincipal, guardando && s.botonPrincipalOff]}
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

// ─── Screen ───────────────────────────────────────────────────────────────────

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

  const [modalJugadorId, setModalJugadorId] = useState<string | null>(null)
  const jugadorModal = jugadores.find(j => j.jugadorId === modalJugadorId) ?? null

  function handleGuardarModal() { guardarCobranzas(); setModalJugadorId(null) }

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
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.labelHeader}>
          {paso === 'jugadores' && eventoSeleccionado
            ? `MANAGER · ${divisionNombre.toUpperCase()} · EVENTO`
            : `MANAGER · ${divisionNombre.toUpperCase()}`}
        </Text>
        <Text style={s.titulo}>Cobranzas</Text>
      </View>
      <View style={s.separador} />

      {paso === 'eventos' && (
        <ScrollView contentContainerStyle={s.lista}>
          <View style={s.seccionHeader}>
            <Text style={s.seccionLabel}>EVENTOS ACTIVOS</Text>
            <Text style={s.seccionConteo}>{eventos.length}</Text>
          </View>

          {eventos.length === 0 ? (
            <View style={s.emptyWrap}>
              <Text style={s.emptyTexto}>Sin eventos activos.</Text>
              <Text style={s.emptySubtexto}>
                La Subcomisión o el Coordinador deben crear viajes, tercer tiempos o recaudaciones.
              </Text>
            </View>
          ) : (
            <View style={s.eventosWrap}>
              {eventos.map(ev => (
                <EventoCard key={ev.id} evento={ev} onSelect={seleccionarEvento} />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {paso === 'jugadores' && (
        <View style={s.jugadoresFlex}>
          <TouchableOpacity style={s.volverBtn} onPress={volverAEventos} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={16} color={ORO} />
            <Text style={s.volverTexto}>Eventos</Text>
          </TouchableOpacity>

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

          {!cargandoJugadores && jugadores.length > 0 && (
            <View style={s.bottomBar}>
              <TouchableOpacity
                style={[s.botonPrincipal, guardando && s.botonPrincipalOff]}
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
  container:  { flex: 1, backgroundColor: FONDO },
  centrado:   { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: FONDO, gap: 8 },
  mutedTexto: { fontFamily: fonts.cuerpo, color: MUTED, fontSize: 13, fontStyle: 'italic', textAlign: 'center' },

  // Header
  header:      { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  labelHeader: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 2, color: ORO, marginBottom: 4 },
  titulo:      { fontFamily: fonts.titulo, fontSize: 32, color: TEXTO, lineHeight: 38 },
  separador:   { height: 1, backgroundColor: DIVIDER, marginHorizontal: 20 },

  // Lista eventos
  lista:         { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  seccionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seccionLabel:  { fontFamily: fonts.label, fontSize: 10, letterSpacing: 2, color: ORO },
  seccionConteo: { fontFamily: fonts.cuerpo, fontSize: 13, color: MUTED, fontWeight: '600' },
  emptyTexto:    { fontFamily: fonts.cuerpo, color: MUTED, fontSize: 14, fontStyle: 'italic' },
  emptySubtexto: { fontFamily: fonts.cuerpo, color: MUTED, fontSize: 12, lineHeight: 18 },
  emptyWrap:     { gap: 6, marginTop: 8 },
  eventosWrap:   { gap: 12, marginTop: 8 },

  // Evento card
  eventoCard:     { borderWidth: 1, borderColor: DIVIDER, borderRadius: 4, padding: 16, backgroundColor: CARD, gap: 8 },
  eventoCardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eventoNombre:   { fontFamily: fonts.cuerpo, fontSize: 16, fontWeight: '700', color: TEXTO, lineHeight: 22 },
  eventoFecha:    { fontFamily: fonts.label, fontSize: 11, color: MUTED, letterSpacing: 0.5 },
  eventoStats:    { fontFamily: fonts.label, fontSize: 10, color: MUTED, letterSpacing: 0.5 },
  eventoChevron:  { position: 'absolute', right: 14, top: 16 },

  // Tipo badge
  tipoBadge:      { alignSelf: 'flex-start', borderWidth: 1, borderColor: DIVIDER, borderRadius: 2, paddingHorizontal: 7, paddingVertical: 3 },
  tipoBadgeTexto: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1.5, color: MUTED, fontWeight: '700' },

  // % badge
  pctBadge:      { backgroundColor: ORO, borderRadius: 2, paddingHorizontal: 8, paddingVertical: 3 },
  pctBadgeTexto: { fontFamily: fonts.label, fontSize: 12, fontWeight: '700', color: FONDO },

  // Barra de progreso
  progWrap: { height: 4, backgroundColor: DIVIDER, borderRadius: 2, overflow: 'hidden' },
  progFill: { height: 4, backgroundColor: ORO, borderRadius: 2 },

  // Volver
  volverBtn:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, gap: 4 },
  volverTexto:{ fontFamily: fonts.label, fontSize: 13, color: ORO, letterSpacing: 0.5 },

  // Paso jugadores
  jugadoresFlex: { flex: 1 },
  eventoResumen:       { paddingHorizontal: 20, paddingBottom: 14, gap: 6 },
  eventoResumenNombre: { fontFamily: fonts.titulo, fontSize: 20, color: TEXTO, lineHeight: 26 },

  // Barra de resumen
  resumenBar:  { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 14 },
  resumenItem: { flex: 1, alignItems: 'center', gap: 3 },
  resumenDiv:  { width: 1, backgroundColor: DIVIDER, marginVertical: 4 },
  resumenLabel:{ fontFamily: fonts.label, fontSize: 9, letterSpacing: 1.5, color: MUTED },
  resumenVal:  { fontFamily: fonts.cuerpo, fontSize: 16, fontWeight: '700' },
  resumenValTexto:{ color: TEXTO },
  resumenValVerde:{ color: VERDE },
  resumenValRojo: { color: ROJO },
  resumenValMuted:{ color: MUTED },

  // Lista jugadores
  jugadoresList: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  filaDiv:       { height: 1, backgroundColor: DIVIDER },
  filaJugador:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 10 },
  filaNumero:    { fontFamily: fonts.label, fontSize: 11, color: MUTED, width: 20, textAlign: 'right' },
  filaNombre:    { flex: 1, fontFamily: fonts.cuerpo, fontSize: 14, fontWeight: '700', color: TEXTO },

  // Badges de estado en la lista
  estadoBadge:          { borderRadius: 2, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  estadoPagado:         { backgroundColor: VERDE, borderColor: VERDE },
  estadoPendiente:      { backgroundColor: 'transparent', borderColor: DIVIDER },
  estadoTexto:          { fontFamily: fonts.label, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  estadoPagadoTexto:    { color: '#FFFFFF' },
  estadoPendienteTexto: { color: MUTED },

  // Bottom bar
  bottomBar: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: DIVIDER, backgroundColor: FONDO },

  // Banners
  bannerError:      { marginTop: 12, backgroundColor: '#2A1010', borderLeftWidth: 3, borderLeftColor: ROJO, borderRadius: 4, padding: 12 },
  bannerErrorTexto: { fontFamily: fonts.cuerpo, fontSize: 13, color: '#FFAAAA' },
  bannerOk:         { marginTop: 12, backgroundColor: TEXTO, borderLeftWidth: 3, borderLeftColor: ORO, borderRadius: 4, padding: 14 },
  bannerOkTexto:    { fontFamily: fonts.label, fontSize: 11, color: ORO, fontWeight: '700', letterSpacing: 2 },

  // Modal
  kavFlex:        { flex: 1 },
  modalContainer: { flex: 1, backgroundColor: FONDO },
  modalHeader:    { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 18 },
  modalSuper:     { fontFamily: fonts.label, fontSize: 10, letterSpacing: 2, color: ORO, marginBottom: 4 },
  modalTitulo:    { fontFamily: fonts.titulo, fontSize: 26, color: TEXTO, maxWidth: '85%' },
  modalClose:     { padding: 4, marginTop: 4 },
  modalScroll:    { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48, gap: 24 },
  campo:          { gap: 10 },
  campoLabel:     { fontFamily: fonts.label, fontSize: 10, letterSpacing: 2, color: ORO },

  // Estado selector
  estadoSelector:            { flexDirection: 'row', gap: 10 },
  estadoSelectorBtn:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 3, borderWidth: 1.5, borderColor: DIVIDER },
  estadoSelectorBtnActivo:   { backgroundColor: ORO, borderColor: ORO },
  estadoPendienteSelector:   { borderColor: ROJO },
  estadoSelectorTexto:       { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.5, color: MUTED, fontWeight: '700' },
  estadoSelectorTextoActivo: { color: FONDO },
  estadoSelectorTextoPendiente: { color: ROJO },
  estadoIconMr:              { marginRight: 6 },

  // Monto
  montoWrap:   { flexDirection: 'row', alignItems: 'flex-end', borderBottomWidth: 1.5, borderBottomColor: ORO, paddingBottom: 8 },
  montoSimbolo:{ fontFamily: fonts.label, fontSize: 22, color: MUTED, marginRight: 6, lineHeight: 36 },
  montoInput:  { flex: 1, fontFamily: fonts.cuerpo, fontSize: 32, fontWeight: '700', color: TEXTO, padding: 0 },

  // Forma de pago
  formaRow:           { flexDirection: 'row', gap: 8 },
  formaBtn:           { flex: 1, paddingVertical: 10, borderRadius: 3, borderWidth: 1.5, borderColor: DIVIDER, alignItems: 'center' },
  formaBtnActivo:     { backgroundColor: TEXTO, borderColor: TEXTO },
  formaBtnTexto:      { fontFamily: fonts.label, fontSize: 10, letterSpacing: 1, color: MUTED, fontWeight: '700' },
  formaBtnTextoActivo:{ color: ORO },

  // Botón principal
  botonPrincipal:      { backgroundColor: TEXTO, paddingVertical: 15, borderRadius: 3, alignItems: 'center' },
  botonPrincipalOff:   { opacity: 0.6 },
  botonPrincipalTexto: { fontFamily: fonts.label, color: ORO, fontSize: 11, letterSpacing: 2.5, fontWeight: '700' },
})
