import { useState } from 'react'
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
const AZUL      = '#3B7FC4'

const TIPO_LABEL: Record<TipoEvento, string> = {
  recaudacion:   'RECAUDACIÓN',
  viaje:         'VIAJE',
  tercer_tiempo: '3er TIEMPO',
}

const TIPO_COLOR: Record<TipoEvento, string> = {
  recaudacion:   ORO,
  viaje:         AZUL,
  tercer_tiempo: VERDE,
}

const TIPO_MODAL_LABEL: Record<TipoEvento, string> = {
  recaudacion:   'RECAUDACIÓN\nGLOBAL',
  viaje:         'VIAJE',
  tercer_tiempo: 'TERCER\nTIEMPO',
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
  return '$ ' + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

// ─── Tab switcher ─────────────────────────────────────────────────────────────

type TabActivo = 'activos' | 'historial'

function TabSwitcher({
  tab,
  onChange,
  countActivos,
  countHistorial,
}: {
  tab:           TabActivo
  onChange:      (t: TabActivo) => void
  countActivos:  number
  countHistorial: number
}) {
  const { colors: tc } = useTheme()
  return (
    <View style={s.tabRow}>
      {(['activos', 'historial'] as TabActivo[]).map(t => {
        const activo = tab === t
        const count  = t === 'activos' ? countActivos : countHistorial
        return (
          <TouchableOpacity
            key={t}
            style={[s.tabBtn, activo && s.tabBtnActivo]}
            onPress={() => onChange(t)}
            activeOpacity={0.8}
          >
            <Text style={[s.tabTexto, activo && s.tabTextoActivo, activo && { color: tc.tinta }]}>
              {t === 'activos' ? 'ACTIVOS' : 'HISTORIAL'}
              {count > 0 ? `  ${count}` : ''}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

// ─── Barra de progreso ────────────────────────────────────────────────────────

function BarraProgreso({ pagados, total }: { pagados: number; total: number }) {
  const pct = total > 0 ? (pagados / total) * 100 : 0
  const filled = Math.min(Math.max(pct, 0), 100)
  return (
    <View style={s.progWrap}>
      <View style={[s.progFill, { width: `${filled}%` }]} />
    </View>
  )
}

// ─── Card de evento ───────────────────────────────────────────────────────────

function EventoCard({
  ev,
  muted = false,
  onPress,
}: {
  ev:      EventoItem
  muted?:  boolean
  onPress?: () => void
}) {
  const { colors: tc } = useTheme()
  const color      = TIPO_COLOR[ev.tipo]
  const montoSug   = parseMonto(ev.descripcion)
  const totalPagos = ev.countPagados + ev.countPendientes
  const hayPagos   = totalPagos > 0

  return (
    <TouchableOpacity
      style={[s.eventoCard, muted && s.eventoCardMuted, { backgroundColor: tc.card }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.8 : 1}
    >
      {/* Tipo + división + fecha */}
      <View style={s.eventoCardHead}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={[s.tipoBadge, { borderColor: color }]}>
            <Text style={[s.tipoBadgeTexto, { color }]}>{TIPO_LABEL[ev.tipo]}</Text>
          </View>
          {ev.divisionNombre && (
            <View style={s.divBadge}>
              <Text style={s.divBadgeTexto}>{ev.divisionNombre}</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {ev.fecha && <Text style={s.eventoFecha}>{formatFecha(ev.fecha)}</Text>}
          {onPress && <Ionicons name="chevron-forward" size={13} color={MUTED} />}
        </View>
      </View>

      {/* Nombre */}
      <Text style={[s.eventoNombre, { color: tc.texto }, muted && { color: MUTED }]} numberOfLines={2}>
        {ev.nombre}
      </Text>

      {/* Monto sugerido */}
      {montoSug !== null && (
        <Text style={s.eventoMontoSug}>{formatPesos(montoSug)} por jugador</Text>
      )}

      {/* Progreso + stats */}
      {hayPagos && (
        <>
          <BarraProgreso pagados={ev.countPagados} total={totalPagos} />
          <Text style={s.eventoStats}>
            {ev.countPagados} PAGADOS · {ev.countPendientes} PEND. · {formatPesos(ev.totalCobrado)}
          </Text>
        </>
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
  const color    = TIPO_COLOR[ev.tipo]
  const montoSug = parseMonto(ev.descripcion)
  const hayRes   = ev.resumenTotal.pagados > 0 || ev.resumenTotal.pendientes > 0

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

  const { colors: tc } = useTheme()
  return (
    <SafeAreaView style={[s.container, { backgroundColor: tc.fondo }]}>
      {/* Barra superior */}
      <View style={s.detalleTopBar}>
        <TouchableOpacity onPress={onVolver} style={s.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={ORO} />
        </TouchableOpacity>
        <Text style={s.detalleLabelHeader}>EVENTO · {TIPO_LABEL[ev.tipo]}</Text>
        {ev.estado === 'cerrado' && (
          <View style={s.cerradoBadge}>
            <Text style={s.cerradoTexto}>CERRADO</Text>
          </View>
        )}
      </View>

      {/* Nombre grande */}
      <View style={s.detalleNombreWrap}>
        <Text style={[s.detalleNombre, { color: tc.texto }]}>{ev.nombre}</Text>
      </View>

      {/* Meta */}
      <View style={s.detalleMetaRow}>
        <View style={[s.tipoBadge, { borderColor: color }]}>
          <Text style={[s.tipoBadgeTexto, { color }]}>{TIPO_LABEL[ev.tipo]}</Text>
        </View>
        {ev.divisionNombre && (
          <View style={s.divBadge}>
            <Text style={s.divBadgeTexto}>{ev.divisionNombre}</Text>
          </View>
        )}
        {ev.fecha && <Text style={s.eventoFecha}>{formatFecha(ev.fecha)}</Text>}
      </View>
      {montoSug !== null && (
        <Text style={s.montoSugTexto}>{formatPesos(montoSug)} por jugador</Text>
      )}
      <View style={[s.separador, { backgroundColor: tc.grisClaro }]} />

      {cargando ? (
        <View style={s.centrado}>
          <ActivityIndicator color={ORO} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.detalleScroll} showsVerticalScrollIndicator={false}>
          {/* Resumen cobranzas */}
          {hayRes && (
            <View style={s.seccionBlock}>
              <Text style={s.seccionLabel}>COBRANZAS</Text>
              <View style={s.resumenBar}>
                <View style={s.resumenItem}>
                  <Text style={[s.resumenVal, { color: VERDE }]}>{ev.resumenTotal.pagados}</Text>
                  <Text style={s.resumenLabel}>PAGADOS</Text>
                </View>
                <View style={s.resumenDiv} />
                <View style={s.resumenItem}>
                  <Text style={[s.resumenVal, { color: ev.resumenTotal.pendientes > 0 ? ROJO : MUTED }]}>
                    {ev.resumenTotal.pendientes}
                  </Text>
                  <Text style={s.resumenLabel}>PEND.</Text>
                </View>
                <View style={s.resumenDiv} />
                <View style={s.resumenItem}>
                  <Text style={[s.resumenVal, { fontSize: 15, color: tc.tinta }]}>
                    {formatPesos(ev.resumenTotal.cobrado)}
                  </Text>
                  <Text style={s.resumenLabel}>COBRADO</Text>
                </View>
              </View>

              {/* Por división */}
              {ev.resumenPorDiv.length > 1 && (
                <View style={{ marginTop: 16 }}>
                  <Text style={[s.seccionLabel, { marginBottom: 6 }]}>POR DIVISIÓN</Text>
                  {ev.resumenPorDiv.map((d, i) => (
                    <View key={d.divisionNombre}>
                      {i > 0 && <View style={s.filaDiv} />}
                      <View style={s.divFila}>
                        <Text style={[s.divFilaNombre, { color: tc.tinta }]} numberOfLines={1}>{d.divisionNombre}</Text>
                        <Text style={s.divFilaDetalle}>
                          {d.pagados}P · {d.pendientes}PN · {formatPesos(d.cobrado)}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Pedidos */}
          <View style={[s.seccionBlock, { marginTop: 24 }]}>
            <Text style={s.seccionLabel}>PEDIDOS</Text>
            {ev.pedidos.length === 0 ? (
              <Text style={s.emptyTexto}>Sin pedidos registrados.</Text>
            ) : (
              <View style={{ gap: 10, marginTop: 8 }}>
                {ev.pedidos.map(p => {
                  const confirmado = p.estado === 'confirmado'
                  return (
                    <View key={p.id} style={s.pedidoCard}>
                      <View style={s.pedidoHeader}>
                        <Text style={[s.pedidoManager, { color: tc.tinta }]}>{p.managerNombre}</Text>
                        <View style={[
                          s.estadoBadge,
                          confirmado ? s.estadoConfirmado : s.estadoAbierto,
                        ]}>
                          <Text style={[
                            s.estadoTexto,
                            { color: confirmado ? VERDE : ORO_HONDO },
                          ]}>
                            {confirmado ? 'CONFIRMADO' : 'ABIERTO'}
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
                  )
                })}
              </View>
            )}
          </View>

          {/* Cerrar evento */}
          {ev.estado === 'activo' && (
            <TouchableOpacity
              style={[s.botonCerrar, cerrando && { opacity: 0.6 }]}
              onPress={confirmarCierre}
              disabled={cerrando}
              activeOpacity={0.85}
            >
              {cerrando
                ? <ActivityIndicator color={ROJO} size="small" />
                : <Text style={s.botonCerrarTexto}>CERRAR EVENTO</Text>
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
  const { colors: tc } = useTheme()
  function setTipo(t: TipoEvento) {
    setForm({ ...form, tipo: t, divisionId: t === 'recaudacion' ? null : form.divisionId })
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={[s.modalContainer, { backgroundColor: tc.fondo }]}>
          {/* Header */}
          <View style={s.modalHeader}>
            <View>
              <Text style={s.modalSuper}>NUEVO</Text>
              <Text style={[s.modalTitulo, { color: tc.tinta }]}>Evento</Text>
            </View>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={{ padding: 4, marginTop: 4 }}>
              <Ionicons name="close" size={20} color={MUTED} />
            </TouchableOpacity>
          </View>
          <View style={s.separador} />

          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.modalScroll} keyboardShouldPersistTaps="handled">
            {/* Tipo */}
            <View style={s.campo}>
              <Text style={s.campoLabel}>TIPO</Text>
              <View style={s.tipoRow}>
                {(['recaudacion', 'viaje', 'tercer_tiempo'] as TipoEvento[]).map(t => {
                  const activo = form.tipo === t
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[s.tipoBtn, activo && s.tipoBtnActivo]}
                      onPress={() => setTipo(t)}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.tipoBtnTexto, activo && s.tipoBtnTextoActivo]}>
                        {TIPO_MODAL_LABEL[t]}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>

            {/* División */}
            {form.tipo !== 'recaudacion' && (
              <View style={s.campo}>
                <Text style={s.campoLabel}>DIVISIÓN</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {divisiones.map(d => {
                      const activo = form.divisionId === d.id
                      return (
                        <TouchableOpacity
                          key={d.id}
                          style={[s.divPill, activo && s.divPillActiva]}
                          onPress={() => setForm({ ...form, divisionId: d.id })}
                          activeOpacity={0.8}
                        >
                          <Text style={[s.divPillTexto, activo && s.divPillTextoActivo]}>
                            {d.nombre}
                          </Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* Nombre */}
            <View style={s.campo}>
              <Text style={s.campoLabel}>NOMBRE DEL EVENTO</Text>
              <TextInput
                style={[s.inputLinea, { color: tc.tinta }]}
                placeholder="ej. Viaje Mar del Plata, Asado M14…"
                placeholderTextColor={MUTED}
                value={form.nombre}
                onChangeText={v => setForm({ ...form, nombre: v })}
                returnKeyType="next"
                autoCapitalize="sentences"
              />
            </View>

            {/* Monto sugerido */}
            <View style={s.campo}>
              <Text style={s.campoLabel}>MONTO POR JUGADOR (opcional)</Text>
              <View style={s.montoWrap}>
                <Text style={s.montoSimbolo}>$</Text>
                <TextInput
                  style={[s.montoInput, { color: tc.tinta }]}
                  placeholder="2500"
                  placeholderTextColor={MUTED}
                  value={form.montoSugerido}
                  onChangeText={v => setForm({ ...form, montoSugerido: v })}
                  keyboardType="numeric"
                  returnKeyType="done"
                />
              </View>
            </View>

            {/* Error */}
            {error && (
              <View style={s.bannerError}>
                <Text style={s.bannerErrorTexto}>{error}</Text>
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={[s.modalFooter, { backgroundColor: tc.fondo }]}>
            <TouchableOpacity
              style={[s.botonPrincipal, guardando && { opacity: 0.6 }]}
              onPress={onGuardar}
              disabled={guardando}
              activeOpacity={0.85}
            >
              {guardando
                ? <ActivityIndicator color={ORO} size="small" />
                : <Text style={s.botonPrincipalTexto}>CREAR EVENTO</Text>
              }
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

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
  const { colors: tc } = useTheme()

  const [tabActivo, setTabActivo] = useState<TabActivo>('activos')

  if (loading) {
    return (
      <View style={[s.centrado, { backgroundColor: tc.fondo }]}>
        <ActivityIndicator size="large" color={ORO} />
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

  const listaActual = tabActivo === 'activos' ? eventosActivos : eventosHistorial

  return (
    <SafeAreaView style={[s.container, { backgroundColor: tc.fondo }]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.labelHeader}>SECCIÓN · DIRECTIVA</Text>
        <Text style={[s.titulo, { color: tc.tinta }]}>Eventos</Text>
      </View>
      <View style={[s.separador, { backgroundColor: tc.grisClaro }]} />

      {/* Tabs */}
      <TabSwitcher
        tab={tabActivo}
        onChange={setTabActivo}
        countActivos={eventosActivos.length}
        countHistorial={eventosHistorial.length}
      />
      <View style={[s.separador, { backgroundColor: tc.grisClaro }]} />

      {/* Lista */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.lista}
        showsVerticalScrollIndicator={false}
      >
        {listaActual.length === 0 ? (
          <Text style={s.emptyTexto}>
            {tabActivo === 'activos'
              ? 'Sin eventos activos. Creá el primero.'
              : 'Sin eventos en el historial.'}
          </Text>
        ) : (
          <View style={{ gap: 12 }}>
            {listaActual.map(ev => (
              <EventoCard
                key={ev.id}
                ev={ev}
                muted={tabActivo === 'historial'}
                onPress={tabActivo === 'activos' ? () => abrirDetalle(ev) : undefined}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* FAB */}
      <View style={s.fabWrap}>
        <TouchableOpacity style={s.fab} onPress={abrirModal} activeOpacity={0.85}>
          <Text style={s.fabTexto}>+ NUEVO EVENTO</Text>
        </TouchableOpacity>
      </View>

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
    </SafeAreaView>
  )
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAPEL },
  centrado:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: PAPEL },

  // Header
  header:      { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  labelHeader: { fontSize: 10, letterSpacing: 2, color: ORO, fontFamily: fonts.label, marginBottom: 4 },
  titulo:      { fontSize: 32, fontStyle: 'italic', fontFamily: fonts.titulo, color: TINTA, lineHeight: 38 },
  separador:   { height: 1, backgroundColor: DIVIDER, marginHorizontal: 20 },

  // Tabs con línea dorada
  tabRow:         { flexDirection: 'row', paddingHorizontal: 20, gap: 24 },
  tabBtn:         { paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActivo:   { borderBottomColor: ORO },
  tabTexto:       { fontSize: 10, letterSpacing: 2, color: MUTED, fontFamily: fonts.label, fontWeight: '700' },
  tabTextoActivo: { color: TINTA },

  // Lista
  lista:       { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120 },
  emptyTexto:  { color: MUTED, fontSize: 14, fontStyle: 'italic', fontFamily: fonts.cuerpo },
  filaDiv:     { height: 1, backgroundColor: DIVIDER },
  seccionBlock:{ gap: 0 },
  seccionLabel:{ fontSize: 10, letterSpacing: 2, color: ORO, fontFamily: fonts.label, marginBottom: 8 },

  // Evento card
  eventoCard:     { borderWidth: 1, borderColor: DIVIDER, borderRadius: 4, padding: 14, backgroundColor: PAPEL, gap: 8 },
  eventoCardMuted:{ opacity: 0.5 },
  eventoCardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eventoNombre:   { fontSize: 16, fontWeight: '700', color: TINTA, fontFamily: fonts.cuerpo, lineHeight: 22 },
  eventoFecha:    { fontSize: 11, color: MUTED, fontFamily: fonts.label, letterSpacing: 0.3 },
  eventoMontoSug: { fontSize: 10, color: MUTED, fontFamily: fonts.label },
  eventoStats:    { fontSize: 10, color: MUTED, fontFamily: fonts.label, letterSpacing: 0.3 },

  // Badges
  tipoBadge:      { borderWidth: 1.5, borderRadius: 2, paddingHorizontal: 7, paddingVertical: 3 },
  tipoBadgeTexto: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, fontFamily: fonts.label },
  divBadge:       { borderWidth: 1, borderColor: DIVIDER, borderRadius: 2, paddingHorizontal: 7, paddingVertical: 3 },
  divBadgeTexto:  { fontSize: 9, letterSpacing: 0.5, color: MUTED, fontFamily: fonts.label },

  // Progress bar
  progWrap: { height: 4, backgroundColor: GRIS, borderRadius: 2, overflow: 'hidden' },
  progFill: { height: 4, backgroundColor: ORO, borderRadius: 2 },

  // FAB dorado
  fabWrap: { position: 'absolute', bottom: 24, left: 16, right: 16 },
  fab:     { backgroundColor: ORO, paddingVertical: 15, borderRadius: 3, alignItems: 'center' },
  fabTexto:{ color: TINTA, fontSize: 11, letterSpacing: 2.5, fontFamily: fonts.label, fontWeight: '700' },

  // Detalle — barra superior
  detalleTopBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, gap: 8 },
  backBtn:            { padding: 4 },
  detalleLabelHeader: { flex: 1, fontSize: 10, letterSpacing: 2, color: ORO, fontFamily: fonts.label },
  cerradoBadge:       { backgroundColor: DIVIDER, borderRadius: 2, paddingHorizontal: 8, paddingVertical: 3 },
  cerradoTexto:       { fontSize: 9, color: MUTED, fontWeight: '700', letterSpacing: 1, fontFamily: fonts.label },

  detalleNombreWrap:{ paddingHorizontal: 20, paddingBottom: 12, paddingTop: 4 },
  detalleNombre:    { fontSize: 28, fontStyle: 'italic', fontFamily: fonts.titulo, color: TINTA, lineHeight: 34 },
  detalleMetaRow:   { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', paddingHorizontal: 20, gap: 8, marginBottom: 8 },
  montoSugTexto:    { fontSize: 12, color: ORO_HONDO, fontFamily: fonts.label, paddingHorizontal: 20, marginBottom: 12 },

  detalleScroll: { padding: 20, paddingBottom: 48 },

  // Resumen financiero (barra de 3 celdas)
  resumenBar:   { flexDirection: 'row', borderWidth: 1, borderColor: DIVIDER, borderRadius: 4, overflow: 'hidden' },
  resumenItem:  { flex: 1, alignItems: 'center', paddingVertical: 14, gap: 4 },
  resumenDiv:   { width: 1, backgroundColor: DIVIDER },
  resumenLabel: { fontSize: 9, letterSpacing: 1.5, color: MUTED, fontFamily: fonts.label },
  resumenVal:   { fontSize: 18, fontWeight: '700', fontFamily: fonts.cuerpo },

  // Por división
  divFila:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  divFilaNombre:  { fontSize: 13, color: TINTA, fontFamily: fonts.cuerpo, flex: 1, marginRight: 8 },
  divFilaDetalle: { fontSize: 11, color: MUTED, fontFamily: fonts.label },

  // Pedidos
  pedidoCard:       { borderWidth: 1, borderColor: DIVIDER, borderRadius: 4, padding: 14, gap: 4 },
  pedidoHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  pedidoManager:    { fontSize: 14, fontWeight: '700', color: TINTA, fontFamily: fonts.cuerpo },
  pedidoItem:       { fontSize: 13, color: MUTED, fontFamily: fonts.cuerpo },
  pedidoFecha:      { fontSize: 10, color: MUTED, fontFamily: fonts.label, marginTop: 4 },
  estadoBadge:      { borderRadius: 2, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  estadoConfirmado: { borderColor: VERDE },
  estadoAbierto:    { borderColor: ORO_HONDO },
  estadoTexto:      { fontSize: 9, fontWeight: '700', letterSpacing: 1, fontFamily: fonts.label },

  // Botón cerrar evento — negro ancho con texto rojo
  botonCerrar:      { marginTop: 32, backgroundColor: TINTA, paddingVertical: 15, borderRadius: 3, alignItems: 'center' },
  botonCerrarTexto: { color: ROJO, fontSize: 11, letterSpacing: 2.5, fontFamily: fonts.label, fontWeight: '700' },

  // Modal
  modalContainer: { flex: 1, backgroundColor: PAPEL },
  modalHeader:    { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 18 },
  modalSuper:     { fontSize: 10, letterSpacing: 2, color: ORO, fontFamily: fonts.label, marginBottom: 4 },
  modalTitulo:    { fontSize: 26, fontStyle: 'italic', fontFamily: fonts.titulo, color: TINTA },
  modalScroll:    { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20, gap: 24 },
  modalFooter:    { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: DIVIDER, backgroundColor: PAPEL },

  // Campos
  campo:     { gap: 10 },
  campoLabel:{ fontSize: 10, letterSpacing: 2, color: ORO, fontFamily: fonts.label },

  inputLinea: {
    borderBottomWidth: 1.5,
    borderBottomColor: ORO,
    paddingVertical: 10,
    fontSize: 15,
    color: TINTA,
    fontFamily: fonts.cuerpo,
  },

  montoWrap:   { flexDirection: 'row', alignItems: 'flex-end', borderBottomWidth: 1.5, borderBottomColor: ORO, paddingBottom: 8 },
  montoSimbolo:{ fontSize: 18, color: MUTED, fontFamily: fonts.label, marginRight: 6, lineHeight: 30 },
  montoInput:  { flex: 1, fontSize: 24, fontWeight: '700', color: TINTA, fontFamily: fonts.cuerpo, padding: 0 },

  // Selector tipo (modal)
  tipoRow:            { flexDirection: 'row', gap: 8 },
  tipoBtn:            { flex: 1, paddingVertical: 13, borderRadius: 3, borderWidth: 1.5, borderColor: DIVIDER, alignItems: 'center', justifyContent: 'center', minHeight: 56 },
  tipoBtnActivo:      { backgroundColor: TINTA, borderColor: TINTA },
  tipoBtnTexto:       { fontSize: 9, color: MUTED, fontWeight: '700', letterSpacing: 1, fontFamily: fonts.label, textAlign: 'center', lineHeight: 14 },
  tipoBtnTextoActivo: { color: ORO },

  // División pills
  divPill:            { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: DIVIDER },
  divPillActiva:      { backgroundColor: TINTA, borderColor: TINTA },
  divPillTexto:       { fontSize: 12, color: MUTED, fontFamily: fonts.label },
  divPillTextoActivo: { color: ORO },

  // Banner error
  bannerError:      { backgroundColor: '#FEF2F2', borderLeftWidth: 3, borderLeftColor: ROJO, borderRadius: 4, padding: 12 },
  bannerErrorTexto: { fontSize: 13, color: '#991B1B', fontFamily: fonts.cuerpo },

  // Botón principal
  botonPrincipal:      { backgroundColor: TINTA, paddingVertical: 15, borderRadius: 3, alignItems: 'center' },
  botonPrincipalTexto: { color: ORO, fontSize: 11, letterSpacing: 2.5, fontFamily: fonts.label, fontWeight: '700' },
})
