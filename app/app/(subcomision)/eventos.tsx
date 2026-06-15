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

// ─── Design tokens ────────────────────────────────────────────────────────────

const FONDO     = '#15110A'
const CARD      = '#1C1710'
const TEXTO     = '#F3EFE4'
const MUTED     = '#8E8574'
const DIVIDER   = '#2C2418'
const ORO       = colors.oro
const ORO_HONDO = colors.oroHondo
const ROJO      = colors.rojoUrgente
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
  tab, onChange, countActivos, countHistorial,
}: {
  tab: TabActivo; onChange: (t: TabActivo) => void
  countActivos: number; countHistorial: number
}) {
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
            <Text style={[s.tabTexto, activo && s.tabTextoActivo]}>
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
  const pct    = total > 0 ? (pagados / total) * 100 : 0
  const filled = Math.min(Math.max(pct, 0), 100)
  return (
    <View style={s.progWrap}>
      {/* width is truly dynamic — keep inline */}
      <View style={[s.progFill, { width: `${filled}%` }]} />
    </View>
  )
}

// ─── Card de evento ───────────────────────────────────────────────────────────

function EventoCard({
  ev, muted = false, onPress,
}: {
  ev: EventoItem; muted?: boolean; onPress?: () => void
}) {
  // color is truly dynamic (per tipo from runtime data) — keep inline
  const color      = TIPO_COLOR[ev.tipo]
  const montoSug   = parseMonto(ev.descripcion)
  const totalPagos = ev.countPagados + ev.countPendientes
  const hayPagos   = totalPagos > 0

  return (
    <TouchableOpacity
      style={[s.eventoCard, muted && s.eventoCardMuted]}
      onPress={onPress}
      activeOpacity={onPress ? 0.8 : 1}
    >
      <View style={s.eventoCardHead}>
        <View style={s.eventoCardHeadLeft}>
          <View style={[s.tipoBadge, { borderColor: color }]}>
            <Text style={[s.tipoBadgeTexto, { color }]}>{TIPO_LABEL[ev.tipo]}</Text>
          </View>
          {ev.divisionNombre && (
            <View style={s.divBadge}>
              <Text style={s.divBadgeTexto}>{ev.divisionNombre}</Text>
            </View>
          )}
        </View>
        <View style={s.eventoCardHeadRight}>
          {ev.fecha && <Text style={s.eventoFecha}>{formatFecha(ev.fecha)}</Text>}
          {onPress && <Ionicons name="chevron-forward" size={13} color={MUTED} />}
        </View>
      </View>

      <Text style={[s.eventoNombre, muted && s.eventoNombreMuted]} numberOfLines={2}>
        {ev.nombre}
      </Text>

      {montoSug !== null && (
        <Text style={s.eventoMontoSug}>{formatPesos(montoSug)} por jugador</Text>
      )}

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
  ev, cargando, cerrando, onCerrar, onVolver,
}: {
  ev: EventoDetalle; cargando: boolean; cerrando: boolean; onCerrar: () => void; onVolver: () => void
}) {
  // color is truly dynamic (per tipo) — keep inline
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

  return (
    <SafeAreaView style={s.container}>
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

      <View style={s.detalleNombreWrap}>
        <Text style={s.detalleNombre}>{ev.nombre}</Text>
      </View>

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
      <View style={s.separador} />

      {cargando ? (
        <View style={s.centrado}>
          <ActivityIndicator color={ORO} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.detalleScroll} showsVerticalScrollIndicator={false}>
          {hayRes && (
            <View style={s.seccionBlock}>
              <Text style={s.seccionLabel}>COBRANZAS</Text>
              <View style={s.resumenBar}>
                <View style={s.resumenItem}>
                  <Text style={[s.resumenVal, s.resumenValVerde]}>{ev.resumenTotal.pagados}</Text>
                  <Text style={s.resumenLabel}>PAGADOS</Text>
                </View>
                <View style={s.resumenDiv} />
                <View style={s.resumenItem}>
                  <Text style={[s.resumenVal, ev.resumenTotal.pendientes > 0 ? s.resumenValRojo : s.resumenValMuted]}>
                    {ev.resumenTotal.pendientes}
                  </Text>
                  <Text style={s.resumenLabel}>PEND.</Text>
                </View>
                <View style={s.resumenDiv} />
                <View style={s.resumenItem}>
                  <Text style={s.resumenValCobrado}>
                    {formatPesos(ev.resumenTotal.cobrado)}
                  </Text>
                  <Text style={s.resumenLabel}>COBRADO</Text>
                </View>
              </View>

              {ev.resumenPorDiv.length > 1 && (
                <View style={s.porDivWrap}>
                  <Text style={s.seccionLabelMb}>POR DIVISIÓN</Text>
                  {ev.resumenPorDiv.map((d, i) => (
                    <View key={d.divisionNombre}>
                      {i > 0 && <View style={s.filaDiv} />}
                      <View style={s.divFila}>
                        <Text style={s.divFilaNombre} numberOfLines={1}>{d.divisionNombre}</Text>
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

          <View style={s.seccionBlockMt}>
            <Text style={s.seccionLabel}>PEDIDOS</Text>
            {ev.pedidos.length === 0 ? (
              <Text style={s.emptyTexto}>Sin pedidos registrados.</Text>
            ) : (
              <View style={s.pedidosList}>
                {ev.pedidos.map(p => {
                  const confirmado = p.estado === 'confirmado'
                  return (
                    <View key={p.id} style={s.pedidoCard}>
                      <View style={s.pedidoHeader}>
                        <Text style={s.pedidoManager}>{p.managerNombre}</Text>
                        <View style={[s.estadoBadge, confirmado ? s.estadoConfirmado : s.estadoAbierto]}>
                          <Text style={[s.estadoTexto, confirmado ? s.estadoTextoConfirmado : s.estadoTextoAbierto]}>
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

          {ev.estado === 'activo' && (
            <TouchableOpacity
              style={[s.botonCerrar, cerrando && s.botonCerrarOff]}
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
  visible, onClose, onGuardar, divisiones, form, setForm, guardando, error,
}: {
  visible: boolean; onClose: () => void; onGuardar: () => Promise<void>
  divisiones: Array<{ id: string; nombre: string }>
  form: NuevoEventoForm; setForm: (f: NuevoEventoForm) => void
  guardando: boolean; error: string | null
}) {
  function setTipo(t: TipoEvento) {
    setForm({ ...form, tipo: t, divisionId: t === 'recaudacion' ? null : form.divisionId })
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.kavFlex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <View>
              <Text style={s.modalSuper}>NUEVO</Text>
              <Text style={s.modalTitulo}>Evento</Text>
            </View>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={s.modalCloseBtn}>
              <Ionicons name="close" size={20} color={MUTED} />
            </TouchableOpacity>
          </View>
          <View style={s.separador} />

          <ScrollView style={s.scrollFlex} contentContainerStyle={s.modalScroll} keyboardShouldPersistTaps="handled">
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

            {form.tipo !== 'recaudacion' && (
              <View style={s.campo}>
                <Text style={s.campoLabel}>DIVISIÓN</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={s.divRow}>
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

            <View style={s.campo}>
              <Text style={s.campoLabel}>NOMBRE DEL EVENTO</Text>
              <TextInput
                style={s.inputLinea}
                placeholder="ej. Viaje Mar del Plata, Asado M14…"
                placeholderTextColor={MUTED}
                value={form.nombre}
                onChangeText={v => setForm({ ...form, nombre: v })}
                returnKeyType="next"
                autoCapitalize="sentences"
              />
            </View>

            <View style={s.campo}>
              <Text style={s.campoLabel}>MONTO POR JUGADOR (opcional)</Text>
              <View style={s.montoWrap}>
                <Text style={s.montoSimbolo}>$</Text>
                <TextInput
                  style={s.montoInput}
                  placeholder="2500"
                  placeholderTextColor={MUTED}
                  value={form.montoSugerido}
                  onChangeText={v => setForm({ ...form, montoSugerido: v })}
                  keyboardType="numeric"
                  returnKeyType="done"
                />
              </View>
            </View>

            {error && (
              <View style={s.bannerError}>
                <Text style={s.bannerErrorTexto}>{error}</Text>
              </View>
            )}
          </ScrollView>

          <View style={s.modalFooter}>
            <TouchableOpacity
              style={[s.botonPrincipal, guardando && s.botonPrincipalOff]}
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
    loading, divisiones, eventosActivos, eventosHistorial,
    paso, eventoDetalle, cargandoDetalle, cerrando, cerrarEvento,
    abrirDetalle, volverALista,
    modalVisible, abrirModal, cerrarModal,
    form, setForm, guardando, errorGuardado, crearEvento,
  } = useEventos()

  const [tabActivo, setTabActivo] = useState<TabActivo>('activos')

  if (loading) {
    return (
      <View style={s.centrado}>
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
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.labelHeader}>SECCIÓN · DIRECTIVA</Text>
        <Text style={s.titulo}>Eventos</Text>
      </View>
      <View style={s.separador} />

      <TabSwitcher
        tab={tabActivo}
        onChange={setTabActivo}
        countActivos={eventosActivos.length}
        countHistorial={eventosHistorial.length}
      />
      <View style={s.separador} />

      <ScrollView
        style={s.scrollFlex}
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
          <View style={s.listaGap}>
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
  container: { flex: 1, backgroundColor: FONDO },
  centrado:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: FONDO },

  // Header
  header:      { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  labelHeader: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 2, color: ORO, marginBottom: 4 },
  titulo:      { fontFamily: fonts.titulo, fontSize: 32, color: TEXTO, lineHeight: 38 },
  separador:   { height: 1, backgroundColor: DIVIDER, marginHorizontal: 20 },

  // Tabs
  tabRow:         { flexDirection: 'row', paddingHorizontal: 20, gap: 24 },
  tabBtn:         { paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActivo:   { borderBottomColor: ORO },
  tabTexto:       { fontFamily: fonts.label, fontSize: 10, letterSpacing: 2, color: MUTED, fontWeight: '700' },
  tabTextoActivo: { color: TEXTO },

  // Lista
  scrollFlex:  { flex: 1 },
  lista:       { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120 },
  listaGap:    { gap: 12 },
  emptyTexto:  { fontFamily: fonts.cuerpo, color: MUTED, fontSize: 14, fontStyle: 'italic' },
  filaDiv:     { height: 1, backgroundColor: DIVIDER },
  seccionBlock:{ gap: 0 },
  seccionBlockMt: { gap: 0, marginTop: 24 },
  seccionLabel:{ fontFamily: fonts.label, fontSize: 10, letterSpacing: 2, color: ORO, marginBottom: 8 },
  seccionLabelMb: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 2, color: ORO, marginBottom: 6 },

  // Evento card
  eventoCard:     { borderWidth: 1, borderColor: DIVIDER, borderRadius: 4, padding: 14, backgroundColor: CARD, gap: 8 },
  eventoCardMuted:{ opacity: 0.5 },
  eventoCardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eventoCardHeadLeft:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eventoCardHeadRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eventoNombre:   { fontFamily: fonts.cuerpo, fontSize: 16, fontWeight: '700', color: TEXTO, lineHeight: 22 },
  eventoNombreMuted: { color: MUTED },
  eventoFecha:    { fontFamily: fonts.label, fontSize: 11, color: MUTED, letterSpacing: 0.3 },
  eventoMontoSug: { fontFamily: fonts.label, fontSize: 10, color: MUTED },
  eventoStats:    { fontFamily: fonts.label, fontSize: 10, color: MUTED, letterSpacing: 0.3 },

  // Badges
  tipoBadge:      { borderWidth: 1.5, borderRadius: 2, paddingHorizontal: 7, paddingVertical: 3 },
  tipoBadgeTexto: { fontFamily: fonts.label, fontSize: 9, fontWeight: '700', letterSpacing: 1.5 },
  divBadge:       { borderWidth: 1, borderColor: DIVIDER, borderRadius: 2, paddingHorizontal: 7, paddingVertical: 3 },
  divBadgeTexto:  { fontFamily: fonts.label, fontSize: 9, letterSpacing: 0.5, color: MUTED },

  // Progress bar
  progWrap: { height: 4, backgroundColor: DIVIDER, borderRadius: 2, overflow: 'hidden' },
  progFill: { height: 4, backgroundColor: ORO, borderRadius: 2 },

  // FAB
  fabWrap: { position: 'absolute', bottom: 24, left: 16, right: 16 },
  fab:     { backgroundColor: ORO, paddingVertical: 15, borderRadius: 3, alignItems: 'center' },
  fabTexto:{ fontFamily: fonts.label, color: FONDO, fontSize: 11, letterSpacing: 2.5, fontWeight: '700' },

  // Detalle
  detalleTopBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, gap: 8 },
  backBtn:            { padding: 4 },
  detalleLabelHeader: { flex: 1, fontFamily: fonts.label, fontSize: 10, letterSpacing: 2, color: ORO },
  cerradoBadge:       { backgroundColor: DIVIDER, borderRadius: 2, paddingHorizontal: 8, paddingVertical: 3 },
  cerradoTexto:       { fontFamily: fonts.label, fontSize: 9, color: MUTED, fontWeight: '700', letterSpacing: 1 },
  detalleNombreWrap:  { paddingHorizontal: 20, paddingBottom: 12, paddingTop: 4 },
  detalleNombre:      { fontFamily: fonts.titulo, fontSize: 28, color: TEXTO, lineHeight: 34 },
  detalleMetaRow:     { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', paddingHorizontal: 20, gap: 8, marginBottom: 8 },
  montoSugTexto:      { fontFamily: fonts.label, fontSize: 12, color: ORO_HONDO, paddingHorizontal: 20, marginBottom: 12 },
  detalleScroll:      { padding: 20, paddingBottom: 48 },

  // Resumen financiero
  resumenBar:    { flexDirection: 'row', borderWidth: 1, borderColor: DIVIDER, borderRadius: 4, overflow: 'hidden' },
  resumenItem:   { flex: 1, alignItems: 'center', paddingVertical: 14, gap: 4 },
  resumenDiv:    { width: 1, backgroundColor: DIVIDER },
  resumenLabel:  { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1.5, color: MUTED },
  resumenVal:    { fontFamily: fonts.cuerpo, fontSize: 18, fontWeight: '700' },
  resumenValVerde:  { color: VERDE },
  resumenValRojo:   { color: ROJO },
  resumenValMuted:  { color: MUTED },
  resumenValCobrado:{ fontFamily: fonts.cuerpo, fontSize: 15, fontWeight: '700', color: TEXTO },

  porDivWrap:    { marginTop: 16 },
  divFila:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  divFilaNombre: { fontFamily: fonts.cuerpo, fontSize: 13, color: TEXTO, flex: 1, marginRight: 8 },
  divFilaDetalle:{ fontFamily: fonts.label, fontSize: 11, color: MUTED },

  // Pedidos
  pedidosList:      { gap: 10, marginTop: 8 },
  pedidoCard:       { borderWidth: 1, borderColor: DIVIDER, borderRadius: 4, padding: 14, gap: 4 },
  pedidoHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  pedidoManager:    { fontFamily: fonts.cuerpo, fontSize: 14, fontWeight: '700', color: TEXTO },
  pedidoItem:       { fontFamily: fonts.cuerpo, fontSize: 13, color: MUTED },
  pedidoFecha:      { fontFamily: fonts.label, fontSize: 10, color: MUTED, marginTop: 4 },
  estadoBadge:      { borderRadius: 2, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  estadoConfirmado: { borderColor: VERDE },
  estadoAbierto:    { borderColor: ORO_HONDO },
  estadoTexto:      { fontFamily: fonts.label, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  estadoTextoConfirmado: { color: VERDE },
  estadoTextoAbierto:    { color: ORO_HONDO },

  // Botón cerrar evento
  botonCerrar:      { marginTop: 32, backgroundColor: TEXTO, paddingVertical: 15, borderRadius: 3, alignItems: 'center' },
  botonCerrarOff:   { opacity: 0.6 },
  botonCerrarTexto: { fontFamily: fonts.label, color: ROJO, fontSize: 11, letterSpacing: 2.5, fontWeight: '700' },

  // Modal
  kavFlex:        { flex: 1 },
  modalContainer: { flex: 1, backgroundColor: FONDO },
  modalHeader:    { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 18 },
  modalSuper:     { fontFamily: fonts.label, fontSize: 10, letterSpacing: 2, color: ORO, marginBottom: 4 },
  modalTitulo:    { fontFamily: fonts.titulo, fontSize: 26, color: TEXTO },
  modalCloseBtn:  { padding: 4, marginTop: 4 },
  modalScroll:    { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20, gap: 24 },
  modalFooter:    { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: DIVIDER, backgroundColor: FONDO },

  // Campos
  campo:     { gap: 10 },
  campoLabel:{ fontFamily: fonts.label, fontSize: 10, letterSpacing: 2, color: ORO },
  divRow:    { flexDirection: 'row', gap: 8 },

  inputLinea: {
    borderBottomWidth: 1.5, borderBottomColor: ORO, paddingVertical: 10,
    fontFamily: fonts.cuerpo, fontSize: 15, color: TEXTO,
  },
  montoWrap:   { flexDirection: 'row', alignItems: 'flex-end', borderBottomWidth: 1.5, borderBottomColor: ORO, paddingBottom: 8 },
  montoSimbolo:{ fontFamily: fonts.label, fontSize: 18, color: MUTED, marginRight: 6, lineHeight: 30 },
  montoInput:  { flex: 1, fontFamily: fonts.cuerpo, fontSize: 24, fontWeight: '700', color: TEXTO, padding: 0 },

  tipoRow:            { flexDirection: 'row', gap: 8 },
  tipoBtn:            { flex: 1, paddingVertical: 13, borderRadius: 3, borderWidth: 1.5, borderColor: DIVIDER, alignItems: 'center', justifyContent: 'center', minHeight: 56 },
  tipoBtnActivo:      { backgroundColor: TEXTO, borderColor: TEXTO },
  tipoBtnTexto:       { fontFamily: fonts.label, fontSize: 9, color: MUTED, fontWeight: '700', letterSpacing: 1, textAlign: 'center', lineHeight: 14 },
  tipoBtnTextoActivo: { color: ORO },

  divPill:            { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: DIVIDER },
  divPillActiva:      { backgroundColor: TEXTO, borderColor: TEXTO },
  divPillTexto:       { fontFamily: fonts.label, fontSize: 12, color: MUTED },
  divPillTextoActivo: { color: ORO },

  bannerError:      { backgroundColor: '#2A1010', borderLeftWidth: 3, borderLeftColor: ROJO, borderRadius: 4, padding: 12 },
  bannerErrorTexto: { fontFamily: fonts.cuerpo, fontSize: 13, color: '#FFAAAA' },

  botonPrincipal:      { backgroundColor: TEXTO, paddingVertical: 15, borderRadius: 3, alignItems: 'center' },
  botonPrincipalOff:   { opacity: 0.6 },
  botonPrincipalTexto: { fontFamily: fonts.label, color: ORO, fontSize: 11, letterSpacing: 2.5, fontWeight: '700' },
})
