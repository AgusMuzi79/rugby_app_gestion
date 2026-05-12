import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  StyleSheet,
  SafeAreaView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import {
  useEventos,
  type TipoEvento,
  type EventoItem,
  type EventoDetalle,
  type NuevoEventoForm,
} from '@/hooks/useEventos'

const CREAM   = '#F5F0E8'
const GOLD    = '#C9A84C'
const DARK    = '#1A1A1A'
const MUTED   = '#888888'
const DIVIDER = '#E5DDD0'
const ROJO    = '#EF4444'
const VERDE   = '#22C55E'
const AZUL    = '#3B82F6'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TIPO_LABEL: Record<TipoEvento, string> = {
  recaudacion:   'Recaudación',
  viaje:         'Viaje',
  tercer_tiempo: 'Tercer Tiempo',
}

const TIPO_COLOR: Record<TipoEvento, string> = {
  recaudacion:   GOLD,
  viaje:         AZUL,
  tercer_tiempo: VERDE,
}

function parseMonto(desc: string | null): number | null {
  if (!desc) return null
  const n = parseFloat(desc.replace(',', '.'))
  return isNaN(n) || n <= 0 ? null : n
}

function formatFecha(fecha: string | null): string {
  if (!fecha) return ''
  const [y, m, d] = fecha.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

function formatPesos(n: number): string {
  return `$${n.toLocaleString('es-AR')}`
}

// ─── EventoCard ──────────────────────────────────────────────────────────────

function EventoCard({
  ev,
  onPress,
  muted = false,
}: {
  ev:      EventoItem
  onPress?: () => void
  muted?:  boolean
}) {
  const color        = TIPO_COLOR[ev.tipo]
  const montoSug     = parseMonto(ev.descripcion)
  const hayCobranzas = ev.countPagados > 0 || ev.countPendientes > 0

  return (
    <TouchableOpacity
      style={[s.card, muted && s.cardMuted]}
      onPress={onPress}
      activeOpacity={onPress ? 0.75 : 1}
    >
      <View style={s.cardFila}>
        <View style={[s.tipoBadge, { borderColor: color }]}>
          <Text style={[s.tipoTexto, { color }]}>{TIPO_LABEL[ev.tipo]}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {ev.fecha ? <Text style={s.cardFecha}>{formatFecha(ev.fecha)}</Text> : null}
          {onPress && <Ionicons name="chevron-forward" size={14} color={MUTED} />}
        </View>
      </View>

      <Text style={[s.cardNombre, muted && { color: MUTED }]} numberOfLines={2}>
        {ev.nombre}
      </Text>

      <View style={[s.cardFila, { marginTop: 2 }]}>
        <Text style={s.cardDiv}>{ev.divisionNombre ?? 'Global'}</Text>
        {montoSug !== null && (
          <Text style={s.cardMontoSug}>{formatPesos(montoSug)} / jugador</Text>
        )}
      </View>

      {hayCobranzas && (
        <View style={s.cardResumen}>
          <View style={s.resumenPill}>
            <Text style={s.resumenPagados}>{ev.countPagados}P</Text>
          </View>
          <View style={[s.resumenPill, { backgroundColor: '#FEF2F2' }]}>
            <Text style={s.resumenPendientes}>{ev.countPendientes}PN</Text>
          </View>
          <Text style={s.resumenCobrado}>{formatPesos(ev.totalCobrado)}</Text>
        </View>
      )}
    </TouchableOpacity>
  )
}

// ─── Vista detalle ────────────────────────────────────────────────────────────

function EventoDetalleContent({
  ev,
  cargando,
  cerrando,
  onCerrar,
  onVolver,
}: {
  ev:       EventoDetalle
  cargando: boolean
  cerrando: boolean
  onCerrar: () => void
  onVolver: () => void
}) {
  const color      = TIPO_COLOR[ev.tipo]
  const montoSug   = parseMonto(ev.descripcion)
  const hayResumen = ev.resumenTotal.pagados > 0 || ev.resumenTotal.pendientes > 0

  function confirmarCierre() {
    Alert.alert(
      'Cerrar evento',
      '¿Cerrar este evento? Los managers ya no podrán registrar nuevos pagos ni pedidos.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Cerrar', style: 'destructive', onPress: onCerrar },
      ],
    )
  }

  return (
    <SafeAreaView style={s.root}>
      <View style={s.detalleHeader}>
        <TouchableOpacity onPress={onVolver} style={s.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={GOLD} />
        </TouchableOpacity>
        <Text style={s.detalleTitulo} numberOfLines={1}>{ev.nombre}</Text>
        {ev.estado === 'cerrado' && (
          <View style={s.cerradoBadge}><Text style={s.cerradoTexto}>CERRADO</Text></View>
        )}
      </View>

      {cargando ? (
        <View style={s.centrado}>
          <ActivityIndicator color={GOLD} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.detalleScroll} showsVerticalScrollIndicator={false}>
          {/* Meta */}
          <View style={s.metaFila}>
            <View style={[s.tipoBadge, { borderColor: color }]}>
              <Text style={[s.tipoTexto, { color }]}>{TIPO_LABEL[ev.tipo]}</Text>
            </View>
            {ev.divisionNombre && <Text style={s.metaDiv}>{ev.divisionNombre}</Text>}
            {ev.fecha && <Text style={s.metaFecha}>{formatFecha(ev.fecha)}</Text>}
          </View>
          {montoSug !== null && (
            <Text style={s.montoSugTexto}>Monto sugerido: {formatPesos(montoSug)} por jugador</Text>
          )}

          {/* Resumen cobranzas */}
          {hayResumen && (
            <View style={{ marginTop: 20 }}>
              <Text style={s.seccionLabel}>COBRANZAS</Text>
              <View style={s.resumenCard}>
                <View style={s.resumenFila}>
                  <Text style={s.resumenItem}>Pagados</Text>
                  <Text style={[s.resumenValor, { color: VERDE }]}>{ev.resumenTotal.pagados}</Text>
                </View>
                <View style={[s.resumenFila, { borderTopWidth: 1, borderTopColor: DIVIDER }]}>
                  <Text style={s.resumenItem}>Pendientes</Text>
                  <Text style={[s.resumenValor, { color: ROJO }]}>{ev.resumenTotal.pendientes}</Text>
                </View>
                <View style={[s.resumenFila, { borderTopWidth: 1, borderTopColor: DIVIDER }]}>
                  <Text style={s.resumenItem}>Total cobrado</Text>
                  <Text style={[s.resumenValor, { color: DARK, fontSize: 18 }]}>
                    {formatPesos(ev.resumenTotal.cobrado)}
                  </Text>
                </View>
              </View>

              {ev.resumenPorDiv.length > 1 && (
                <View style={{ marginTop: 10 }}>
                  <Text style={[s.seccionLabel, { marginBottom: 6 }]}>POR DIVISIÓN</Text>
                  {ev.resumenPorDiv.map(d => (
                    <View key={d.divisionNombre} style={s.divResumenFila}>
                      <Text style={s.divResumenNombre} numberOfLines={1}>{d.divisionNombre}</Text>
                      <Text style={s.divResumenDetalle}>
                        {d.pagados}P · {d.pendientes}PN · {formatPesos(d.cobrado)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Pedidos */}
          <View style={{ marginTop: 24 }}>
            <Text style={s.seccionLabel}>PEDIDOS</Text>
            {ev.pedidos.length === 0 ? (
              <Text style={s.vacio}>Sin pedidos registrados.</Text>
            ) : (
              ev.pedidos.map(p => (
                <View key={p.id} style={s.pedidoCard}>
                  <View style={s.pedidoHeader}>
                    <Text style={s.pedidoManager}>{p.managerNombre}</Text>
                    <View style={[
                      s.pedidoEstadoBadge,
                      p.estado === 'confirmado' ? s.badgeConfirmado : s.badgePendientePed,
                    ]}>
                      <Text style={[
                        s.pedidoEstadoTexto,
                        { color: p.estado === 'confirmado' ? VERDE : GOLD },
                      ]}>
                        {p.estado === 'confirmado' ? 'CONFIRMADO' : 'PENDIENTE'}
                      </Text>
                    </View>
                  </View>
                  {p.items.map((it, idx) => (
                    <Text key={idx} style={s.pedidoItem}>· {it.cantidad}× {it.concepto}</Text>
                  ))}
                  {p.fechaConfirmacion && (
                    <Text style={s.pedidoFecha}>Confirmado el {formatFecha(p.fechaConfirmacion)}</Text>
                  )}
                </View>
              ))
            )}
          </View>

          {/* Cerrar evento */}
          {ev.estado === 'activo' && (
            <TouchableOpacity
              style={[s.btnCerrar, cerrando && { opacity: 0.6 }]}
              onPress={confirmarCierre}
              disabled={cerrando}
              activeOpacity={0.85}
            >
              {cerrando
                ? <ActivityIndicator color={ROJO} size="small" />
                : <Text style={s.btnCerrarTexto}>CERRAR EVENTO</Text>
              }
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

// ─── Modal nuevo evento ───────────────────────────────────────────────────────

function ModalNuevoEvento({
  visible,
  onClose,
  onGuardar,
  divisiones,
  form,
  setForm,
  guardando,
  error,
}: {
  visible:    boolean
  onClose:    () => void
  onGuardar:  () => Promise<void>
  divisiones: Array<{ id: string; nombre: string }>
  form:       NuevoEventoForm
  setForm:    (f: NuevoEventoForm) => void
  guardando:  boolean
  error:      string | null
}) {
  function setTipo(t: TipoEvento) {
    setForm({ ...form, tipo: t, divisionId: t === 'recaudacion' ? null : form.divisionId })
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitulo}>Nuevo evento</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Text style={s.modalCerrar}>Cancelar</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.modalBody}>
            {/* Nombre */}
            <Text style={s.inputLabel}>NOMBRE DEL EVENTO</Text>
            <TextInput
              style={s.input}
              placeholder="ej. Viaje Mar del Plata, Asado M14…"
              placeholderTextColor={MUTED}
              value={form.nombre}
              onChangeText={v => setForm({ ...form, nombre: v })}
              returnKeyType="next"
            />

            {/* Tipo */}
            <Text style={s.inputLabel}>TIPO</Text>
            <View style={s.tipoRow}>
              {(['recaudacion', 'viaje', 'tercer_tiempo'] as TipoEvento[]).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[s.tipoBtn, form.tipo === t && s.tipoBtnActivo]}
                  onPress={() => setTipo(t)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.tipoBtnTexto, form.tipo === t && s.tipoBtnTextoActivo]}>
                    {TIPO_LABEL[t]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* División (solo viaje / tercer_tiempo) */}
            {form.tipo !== 'recaudacion' && (
              <>
                <Text style={s.inputLabel}>DIVISIÓN</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {divisiones.map(d => (
                      <TouchableOpacity
                        key={d.id}
                        style={[s.divPill, form.divisionId === d.id && s.divPillActiva]}
                        onPress={() => setForm({ ...form, divisionId: d.id })}
                        activeOpacity={0.8}
                      >
                        <Text style={[s.divPillTexto, form.divisionId === d.id && s.divPillTextoActivo]}>
                          {d.nombre}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}

            {/* Monto sugerido */}
            <Text style={s.inputLabel}>MONTO SUGERIDO POR JUGADOR (opcional)</Text>
            <TextInput
              style={s.input}
              placeholder="ej. 2500"
              placeholderTextColor={MUTED}
              value={form.montoSugerido}
              onChangeText={v => setForm({ ...form, montoSugerido: v })}
              keyboardType="numeric"
              returnKeyType="done"
            />

            {error && (
              <View style={s.errorBanner}>
                <Text style={s.errorTexto}>{error}</Text>
              </View>
            )}
          </ScrollView>

          <View style={s.modalFooter}>
            <TouchableOpacity
              style={[s.btnGuardar, guardando && { opacity: 0.6 }]}
              onPress={onGuardar}
              disabled={guardando}
              activeOpacity={0.85}
            >
              {guardando
                ? <ActivityIndicator color={GOLD} size="small" />
                : <Text style={s.btnGuardarTexto}>CREAR EVENTO</Text>
              }
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function EventosScreen() {
  const {
    loading,
    divisiones,
    eventosActivos,
    eventosHistorial,
    paso,
    eventoDetalle,
    cargandoDetalle,
    cerrando,
    cerrarEvento,
    abrirDetalle,
    volverALista,
    modalVisible,
    abrirModal,
    cerrarModal,
    form,
    setForm,
    guardando,
    errorGuardado,
    crearEvento,
  } = useEventos()

  if (loading) {
    return (
      <View style={s.centrado}>
        <ActivityIndicator size="large" color={GOLD} />
      </View>
    )
  }

  if (paso === 'detalle' && eventoDetalle) {
    return (
      <EventoDetalleContent
        ev={eventoDetalle}
        cargando={cargandoDetalle}
        cerrando={cerrando}
        onCerrar={cerrarEvento}
        onVolver={volverALista}
      />
    )
  }

  async function handleGuardar() {
    const ok = await crearEvento()
    if (ok) cerrarModal()
  }

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Text style={s.headerLabel}>SUBCOMISIÓN</Text>
        <View style={s.headerFila}>
          <Text style={s.headerTitulo}>Eventos</Text>
          <TouchableOpacity style={s.botonNuevo} onPress={abrirModal} activeOpacity={0.8}>
            <Text style={s.botonNuevoTexto}>+ Nuevo</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.headerSub}>
          {eventosActivos.length} activo{eventosActivos.length !== 1 ? 's' : ''}
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.listaContent} showsVerticalScrollIndicator={false}>
        <Text style={s.seccionLabel}>EVENTOS ACTIVOS</Text>
        {eventosActivos.length === 0 ? (
          <Text style={s.vacio}>Sin eventos activos. Creá el primero.</Text>
        ) : (
          eventosActivos.map(ev => (
            <EventoCard key={ev.id} ev={ev} onPress={() => abrirDetalle(ev)} />
          ))
        )}

        {eventosHistorial.length > 0 && (
          <>
            <Text style={[s.seccionLabel, { marginTop: 24 }]}>HISTORIAL</Text>
            {eventosHistorial.map(ev => (
              <EventoCard key={ev.id} ev={ev} muted />
            ))}
          </>
        )}
      </ScrollView>

      <ModalNuevoEvento
        visible={modalVisible}
        onClose={cerrarModal}
        onGuardar={handleGuardar}
        divisiones={divisiones}
        form={form}
        setForm={setForm}
        guardando={guardando}
        error={errorGuardado}
      />
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: CREAM },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: CREAM },

  header:          { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 14, backgroundColor: DARK },
  headerLabel:     { fontSize: 10, letterSpacing: 2.5, color: GOLD, marginBottom: 4 },
  headerFila:      { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  headerTitulo:    { fontSize: 28, fontStyle: 'italic', fontFamily: 'serif', color: '#FFF' },
  headerSub:       { fontSize: 12, color: '#888', marginTop: 4 },
  botonNuevo:      { backgroundColor: GOLD, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 4, marginBottom: 4 },
  botonNuevoTexto: { color: DARK, fontSize: 12, letterSpacing: 1.5, fontWeight: '700' },

  listaContent: { padding: 16, paddingBottom: 40, gap: 10 },
  seccionLabel: { fontSize: 10, letterSpacing: 2, color: GOLD, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  vacio:        { color: MUTED, fontSize: 13, fontStyle: 'italic', paddingVertical: 4 },

  card:        { backgroundColor: '#FFF', borderRadius: 10, padding: 14, gap: 6, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4 },
  cardMuted:   { opacity: 0.55 },
  cardFila:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardNombre:  { fontSize: 16, fontWeight: '600', color: DARK },
  cardFecha:   { fontSize: 12, color: MUTED },
  cardDiv:     { fontSize: 11, color: GOLD, letterSpacing: 0.5 },
  cardMontoSug: { fontSize: 11, color: MUTED },
  cardResumen:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  resumenPill:  { backgroundColor: '#F0FFF4', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  resumenPagados:    { fontSize: 11, color: VERDE, fontWeight: '700' },
  resumenPendientes: { fontSize: 11, color: ROJO, fontWeight: '700' },
  resumenCobrado:    { fontSize: 12, fontWeight: '600', color: DARK },

  tipoBadge: { borderWidth: 1.5, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  tipoTexto: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  // Detalle
  detalleHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: DARK, gap: 10 },
  backBtn:       { padding: 4 },
  detalleTitulo: { flex: 1, fontSize: 18, fontStyle: 'italic', fontFamily: 'serif', color: '#FFF' },
  cerradoBadge:  { backgroundColor: '#3A3A3A', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  cerradoTexto:  { fontSize: 10, color: MUTED, fontWeight: '700', letterSpacing: 0.5 },

  detalleScroll: { padding: 20, paddingBottom: 48 },

  metaFila:      { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  metaDiv:       { fontSize: 13, color: MUTED },
  metaFecha:     { fontSize: 12, color: MUTED },
  montoSugTexto: { fontSize: 13, color: GOLD, marginTop: 8 },

  resumenCard:  { backgroundColor: '#FFF', borderRadius: 10, overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, marginTop: 8 },
  resumenFila:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  resumenItem:  { fontSize: 14, color: MUTED },
  resumenValor: { fontSize: 22, fontWeight: '700' },

  divResumenFila:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: DIVIDER },
  divResumenNombre:  { fontSize: 13, fontWeight: '600', color: DARK, flex: 1, marginRight: 8 },
  divResumenDetalle: { fontSize: 12, color: MUTED },

  pedidoCard:         { backgroundColor: '#FFF', borderRadius: 10, padding: 14, marginTop: 8, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3 },
  pedidoHeader:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  pedidoManager:      { fontSize: 14, fontWeight: '600', color: DARK },
  pedidoEstadoBadge:  { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  badgeConfirmado:    { backgroundColor: '#F0FFF4' },
  badgePendientePed:  { backgroundColor: '#FEFCE8' },
  pedidoEstadoTexto:  { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  pedidoItem:         { fontSize: 13, color: MUTED, marginTop: 2 },
  pedidoFecha:        { fontSize: 11, color: MUTED, marginTop: 6 },

  btnCerrar:      { marginTop: 32, borderWidth: 1.5, borderColor: ROJO, borderRadius: 6, paddingVertical: 15, alignItems: 'center' },
  btnCerrarTexto: { color: ROJO, fontSize: 12, letterSpacing: 2, fontWeight: '700' },

  // Modal
  modalContainer: { flex: 1, backgroundColor: CREAM },
  modalHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: DIVIDER },
  modalTitulo:    { fontSize: 18, fontStyle: 'italic', fontFamily: 'serif', color: DARK },
  modalCerrar:    { fontSize: 14, color: MUTED },
  modalBody:      { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },
  modalFooter:    { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: DIVIDER },

  inputLabel: { fontSize: 10, letterSpacing: 2, color: GOLD, marginBottom: 6 },
  input:      { borderWidth: 1.5, borderColor: DIVIDER, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: DARK, backgroundColor: '#FFF', marginBottom: 20 },

  tipoRow:            { flexDirection: 'row', gap: 8, marginBottom: 20 },
  tipoBtn:            { flex: 1, paddingVertical: 11, borderRadius: 4, borderWidth: 1.5, borderColor: DIVIDER, alignItems: 'center' },
  tipoBtnActivo:      { backgroundColor: DARK, borderColor: DARK },
  tipoBtnTexto:       { fontSize: 11, color: MUTED, fontWeight: '500' },
  tipoBtnTextoActivo: { color: GOLD },

  divPill:            { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: DIVIDER },
  divPillActiva:      { backgroundColor: DARK, borderColor: DARK },
  divPillTexto:       { fontSize: 13, color: MUTED },
  divPillTextoActivo: { color: GOLD },

  errorBanner: { backgroundColor: '#FEF2F2', borderLeftWidth: 3, borderLeftColor: ROJO, borderRadius: 4, padding: 12, marginTop: 4 },
  errorTexto:  { fontSize: 13, color: '#991B1B' },
  btnGuardar:      { backgroundColor: DARK, paddingVertical: 16, borderRadius: 4, alignItems: 'center' },
  btnGuardarTexto: { color: GOLD, fontSize: 12, letterSpacing: 2.5, fontWeight: '600' },
})
