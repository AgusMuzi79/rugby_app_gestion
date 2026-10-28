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
  RefreshControl,
  AccessibilityInfo,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import {
  useEventos,
  TIPOS_MANAGER,
  type ModoEventos,
  type TipoEvento,
  type EventoItem,
  type EventoDetalle,
  type NuevoEventoForm,
  type DivisionRef,
} from '@/hooks/useEventos'
import { colors, fonts } from '@/constants/theme'
import { AvatarPerfil } from '@/components/shared/Header'
import { montoSugeridoDe } from '@/lib/montoSugerido'
import { DetalleRecaudacion } from '@/components/eventos/DetalleRecaudacion'
import { formatMonto } from '@/components/eventos/estilo'
import { ErrorCarga } from '@/components/shared/ErrorCarga'
import { useBackDelDetalle } from '@/components/shared/useBackDelDetalle'

// ─── Design tokens ────────────────────────────────────────────────────────────

const FONDO     = colors.fondo
const CARD      = colors.card
const TEXTO     = colors.texto
const MUTED     = colors.muted
const DIVIDER   = colors.borde
const ORO       = colors.oro
const ORO_HONDO = colors.oroHondo
const ROJO      = colors.rojoUrgente
const VERDE     = colors.estadoActivo // sólo texto y bordes: #4A7C59 daba 3.66:1 sobre card
const AZUL      = '#5B9BE0' // #3B7FC4 daba 4.26:1 sobre card

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

const parseMonto = montoSugeridoDe

function formatFecha(fecha: string | null): string {
  if (!fecha) return ''
  const [y, m, d] = fecha.split('-')
  return `${d}/${m}/${y.slice(2)}`
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
    <View style={s.tabRow} accessibilityRole="tablist">
      {(['activos', 'historial'] as TabActivo[]).map(t => {
        const activo = tab === t
        const count  = t === 'activos' ? countActivos : countHistorial
        return (
          <TouchableOpacity
            key={t}
            style={[s.tabBtn, activo && s.tabBtnActivo]}
            onPress={() => onChange(t)}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityState={{ selected: activo }}
            accessibilityLabel={`${t === 'activos' ? 'Activos' : 'Historial'}, ${count}`}
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
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={[
        TIPO_LABEL[ev.tipo],
        ev.nombre,
        ev.divisionNombre,
        hayPagos ? `${ev.countPagados} pagados, ${ev.countPendientes} pendientes` : null,
      ].filter(Boolean).join(', ')}
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
        <Text style={s.eventoMontoSug}>{formatMonto(montoSug)} por jugador</Text>
      )}

      {hayPagos && (
        <>
          <BarraProgreso pagados={ev.countPagados} total={totalPagos} />
          <Text style={s.eventoStats}>
            {ev.countPagados} PAGADOS · {ev.countPendientes} PEND. · {formatMonto(ev.totalCobrado)}
          </Text>
        </>
      )}
    </TouchableOpacity>
  )
}

// ─── Vista detalle ────────────────────────────────────────────────────────────

function EventoDetalleContent({
  ev, cargando, errorCarga, onReintentar, cerrando, errorCierre, onCerrar, onVolver,
}: {
  ev: EventoDetalle; cargando: boolean
  errorCarga: string | null; onReintentar: () => void
  cerrando: boolean; errorCierre: string | null
  onCerrar: () => void; onVolver: () => void
}) {
  // color is truly dynamic (per tipo) — keep inline
  const color    = TIPO_COLOR[ev.tipo]
  const montoSug = parseMonto(ev.descripcion)
  const hayRes   = ev.resumenTotal.pagados > 0 || ev.resumenTotal.pendientes > 0

  function confirmarCierre() {
    Alert.alert(
      'Cerrar evento',
      '¿Cerrar este evento? Ya no se podrán registrar nuevos pagos ni pedidos.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Cerrar', style: 'destructive', onPress: onCerrar },
      ],
    )
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.detalleTopBar}>
        <TouchableOpacity
          onPress={onVolver}
          style={s.backBtn}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Volver a eventos"
        >
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
        <Text style={s.montoSugTexto}>{formatMonto(montoSug)} por jugador</Text>
      )}
      <View style={s.separador} />

      {cargando ? (
        <View style={s.centrado}>
          <ActivityIndicator color={ORO} size="large" />
        </View>
      ) : errorCarga ? (
        <ErrorCarga mensaje={errorCarga} onReintentar={onReintentar} />
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
                    {formatMonto(ev.resumenTotal.cobrado)}
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
                          {d.pagados}P · {d.pendientes}PN · {formatMonto(d.cobrado)}
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

          {errorCierre && (
            <View style={[s.bannerError, s.bannerCierre]} accessibilityRole="alert" accessibilityLiveRegion="polite">
              <Text style={s.bannerErrorTexto}>{errorCierre}</Text>
            </View>
          )}

          {ev.estado === 'activo' && (
            <TouchableOpacity
              style={[s.botonCerrar, cerrando && s.botonCerrarOff]}
              onPress={confirmarCierre}
              disabled={cerrando}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Cerrar evento"
              accessibilityState={{ disabled: cerrando, busy: cerrando }}
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

// Chips de selección múltiple de divisiones.
function SelectorDivisiones({
  divisiones, seleccionadas, onToggle,
}: {
  divisiones: DivisionRef[]; seleccionadas: string[]; onToggle: (id: string) => void
}) {
  if (divisiones.length === 0) {
    return <Text style={s.modalAyuda}>No hay divisiones activas para elegir.</Text>
  }
  return (
    // Selección múltiple: cada pill es un checkbox (no radio).
    <View style={s.divRow} accessibilityLabel="Divisiones">
      {divisiones.map(d => {
        const activa = seleccionadas.includes(d.id)
        return (
          <TouchableOpacity
            key={d.id}
            style={[s.divPill, activa && s.divPillActiva]}
            onPress={() => onToggle(d.id)}
            activeOpacity={0.8}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: activa }}
            accessibilityLabel={d.nombre}
          >
            <Text style={[s.divPillTexto, activa && s.divPillTextoActivo]}>{d.nombre}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

// Subcomisión sólo crea recaudaciones: para todo el club o para divisiones elegidas.
// Manager elige viaje o tercer tiempo y una o más divisiones de su disciplina
// (las suyas vienen preseleccionadas).
function ModalNuevoEvento({
  visible, onClose, onGuardar, modo, divisiones, form, setForm, onToggleDivision, guardando, error,
}: {
  visible: boolean; onClose: () => void; onGuardar: () => Promise<void>
  modo: ModoEventos; divisiones: DivisionRef[]
  form: NuevoEventoForm; setForm: (f: NuevoEventoForm) => void
  onToggleDivision: (id: string) => void
  guardando: boolean; error: string | null
}) {
  const esManager = modo === 'manager'

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.kavFlex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <View>
              <Text style={s.modalSuper}>{esManager ? 'NUEVO' : 'NUEVA'}</Text>
              <Text style={s.modalTitulo}>{esManager ? 'Evento' : 'Recaudación'}</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.7}
              style={s.modalCloseBtn}
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
            >
              <Ionicons name="close" size={20} color={MUTED} />
            </TouchableOpacity>
          </View>
          <View style={s.separador} />

          <ScrollView style={s.scrollFlex} contentContainerStyle={s.modalScroll} keyboardShouldPersistTaps="handled">
            {esManager ? (
              <>
                <View style={s.campo}>
                  <Text style={s.campoLabel}>TIPO</Text>
                  <View style={s.tipoRow} accessibilityRole="radiogroup" accessibilityLabel="Tipo de evento">
                    {TIPOS_MANAGER.map(t => {
                      const activo = form.tipo === t
                      return (
                        <TouchableOpacity
                          key={t}
                          style={[s.tipoBtn, activo && s.tipoBtnActivo]}
                          onPress={() => setForm({ ...form, tipo: t })}
                          activeOpacity={0.8}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: activo }}
                          accessibilityLabel={t === 'viaje' ? 'Viaje' : 'Tercer tiempo'}
                        >
                          <Text style={[s.tipoBtnTexto, activo && s.tipoBtnTextoActivo]}>
                            {TIPO_MODAL_LABEL[t]}
                          </Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </View>

                <View style={s.campo}>
                  <Text style={s.campoLabel}>DIVISIONES</Text>
                  <SelectorDivisiones
                    divisiones={divisiones}
                    seleccionadas={form.divisionIds}
                    onToggle={onToggleDivision}
                  />
                  <Text style={s.modalAyuda}>
                    Cada Manager ve el evento y cobra sólo a los jugadores de sus divisiones.
                  </Text>
                </View>
              </>
            ) : (
              <>
                <View style={s.campo}>
                  <Text style={s.campoLabel}>ALCANCE</Text>
                  <View style={s.tipoRow} accessibilityRole="radiogroup" accessibilityLabel="Alcance">
                    {(['club', 'divisiones'] as const).map(a => {
                      const activo = form.alcance === a
                      return (
                        <TouchableOpacity
                          key={a}
                          style={[s.tipoBtn, activo && s.tipoBtnActivo]}
                          onPress={() => setForm({ ...form, alcance: a })}
                          activeOpacity={0.8}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: activo }}
                          accessibilityLabel={a === 'club' ? 'Todo el club' : 'Elegir divisiones'}
                        >
                          <Text style={[s.tipoBtnTexto, activo && s.tipoBtnTextoActivo]}>
                            {a === 'club' ? 'TODO EL\nCLUB' : 'ELEGIR\nDIVISIONES'}
                          </Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </View>

                {form.alcance === 'divisiones' && (
                  <View style={s.campo}>
                    <Text style={s.campoLabel}>DIVISIONES</Text>
                    <SelectorDivisiones
                      divisiones={divisiones}
                      seleccionadas={form.divisionIds}
                      onToggle={onToggleDivision}
                    />
                  </View>
                )}

                <Text style={s.modalAyuda}>
                  {form.alcance === 'club'
                    ? 'Recaudación de todo el club, visible para todas las divisiones.'
                    : 'Recaudación visible sólo para las divisiones elegidas.'}
                  {' '}Los viajes y tercer tiempos los crea el Manager de cada división.
                </Text>
              </>
            )}

            <View style={s.campo}>
              <Text style={s.campoLabel}>NOMBRE DEL EVENTO</Text>
              <TextInput
                style={s.inputLinea}
                placeholder={esManager ? 'ej. Viaje Mar del Plata, Asado M14…' : 'ej. Rifa anual, Cena del club…'}
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
              <View style={s.bannerError} accessibilityRole="alert" accessibilityLiveRegion="polite">
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
              accessibilityRole="button"
              accessibilityState={{ disabled: guardando, busy: guardando }}
            >
              {guardando
                ? <ActivityIndicator color={colors.sobreOro} size="small" />
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

// Pantalla compartida: Subcomisión (crea y cierra SUS recaudaciones de su
// disciplina, con cobros y egresos por división — 20261019000000) y Manager
// (viajes / tercer tiempos de sus divisiones, ver app/(manager)/eventos.tsx).
export function EventosPantalla({ modo }: { modo: ModoEventos }) {
  const {
    loading, refrescando, recargar, divisionesLabel, divisionesElegibles, sinDivision, errorCarga,
    eventosActivos, eventosHistorial,
    paso, eventoDetalle, cargandoDetalle, errorDetalle, cerrando, errorCierre, cerrarEvento,
    abrirDetalle, volverALista,
    modalVisible, abrirModal, cerrarModal,
    form, setForm, toggleDivisionForm, guardando, errorGuardado, crearEvento,
  } = useEventos(modo)

  const [tabActivo, setTabActivo] = useState<TabActivo>('activos')
  const esManager = modo === 'manager'

  // Back de Android con un evento abierto: vuelve a la lista en vez de salir
  // de la pestaña (T11, interino). Vale para Subcomisión y Manager.
  useBackDelDetalle(paso === 'detalle', volverALista)

  // Error de carga (red / permisos): no es lo mismo que "sin división".
  if (errorCarga && !loading && paso === 'lista') {
    return (
      <View style={s.centradoPad}>
        <View style={s.bannerError}>
          <Text style={s.bannerErrorTexto}>{errorCarga}</Text>
        </View>
        <TouchableOpacity style={s.botonPrincipal} onPress={recargar} activeOpacity={0.85}>
          <Text style={s.botonPrincipalTexto}>REINTENTAR</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (esManager && sinDivision && !loading) {
    return (
      <View style={s.centrado}>
        <Text style={s.sinDivTitulo}>Sin división asignada.</Text>
        <Text style={s.emptyTexto}>Contactá a la Subcomisión.</Text>
      </View>
    )
  }

  // Subcomisión: sus recaudaciones con Cobros | Egresos por división.
  if (paso === 'detalle' && eventoDetalle && !esManager) {
    return (
      <DetalleRecaudacion
        ev={eventoDetalle}
        cerrando={cerrando}
        errorCierre={errorCierre}
        onCerrar={cerrarEvento}
        onVolver={volverALista}
      />
    )
  }

  if (paso === 'detalle' && eventoDetalle) {
    return (
      <EventoDetalleContent
        ev={eventoDetalle}
        cargando={cargandoDetalle}
        errorCarga={errorDetalle}
        onReintentar={() => abrirDetalle(eventoDetalle)}
        cerrando={cerrando}
        errorCierre={errorCierre}
        onCerrar={cerrarEvento}
        onVolver={volverALista}
      />
    )
  }

  // Después de los detalles: una relectura nunca reemplaza un detalle abierto.
  if (loading) {
    return (
      <View style={s.centrado}>
        <ActivityIndicator size="large" color={ORO} />
      </View>
    )
  }

  async function handleGuardar() {
    const ok = await crearEvento()
    if (ok) {
      cerrarModal()
      AccessibilityInfo.announceForAccessibility(esManager ? 'Evento creado' : 'Recaudación creada')
    }
  }

  const listaActual = tabActivo === 'activos' ? eventosActivos : eventosHistorial

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={[s.header, s.headerFila]}>
        <View style={s.headerTextos}>
          <Text style={s.labelHeader}>
            {esManager ? `MANAGER · ${divisionesLabel.toUpperCase()}` : 'SECCIÓN · DIRECTIVA'}
          </Text>
          <Text style={s.titulo}>Eventos</Text>
        </View>
        <AvatarPerfil />
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
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={recargar} tintColor={ORO} />}
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
                // Subcomisión también abre las cerradas (cobros y egresos en sólo lectura).
                onPress={tabActivo === 'activos' || !esManager ? () => abrirDetalle(ev) : undefined}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <View style={s.fabWrap}>
        <TouchableOpacity style={s.fab} onPress={abrirModal} activeOpacity={0.85}>
          <Text style={s.fabTexto}>{esManager ? '+ NUEVO EVENTO' : '+ NUEVA RECAUDACIÓN'}</Text>
        </TouchableOpacity>
      </View>

      <ModalNuevoEvento
        visible={modalVisible}
        onClose={cerrarModal}
        onGuardar={handleGuardar}
        modo={modo}
        divisiones={divisionesElegibles}
        form={form}
        setForm={setForm}
        onToggleDivision={toggleDivisionForm}
        guardando={guardando}
        error={errorGuardado}
      />
    </SafeAreaView>
  )
}

export default function EventosScreen() {
  return <EventosPantalla modo="subcomision" />
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: FONDO },
  centrado:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: FONDO },
  centradoPad: { flex: 1, justifyContent: 'center', alignItems: 'stretch', backgroundColor: FONDO, paddingHorizontal: 20, gap: 16 },

  // Header
  header:      { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  headerFila:  { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headerTextos: { flex: 1 },
  labelHeader: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: ORO, marginBottom: 4 },
  titulo:      { fontFamily: fonts.titulo, fontSize: 32, color: TEXTO, lineHeight: 38 },
  separador:   { height: 1, backgroundColor: DIVIDER, marginHorizontal: 20 },

  // Tabs
  tabRow:         { flexDirection: 'row', paddingHorizontal: 20, gap: 24 },
  tabBtn:         { paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActivo:   { borderBottomColor: ORO },
  tabTexto:       { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: MUTED, fontWeight: '700' },
  tabTextoActivo: { color: TEXTO },

  // Lista
  scrollFlex:  { flex: 1 },
  lista:       { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120 },
  listaGap:    { gap: 12 },
  emptyTexto:  { fontFamily: fonts.cuerpo, color: MUTED, fontSize: 16, fontStyle: 'italic' },
  filaDiv:     { height: 1, backgroundColor: DIVIDER },
  seccionBlock:{ gap: 0 },
  seccionBlockMt: { gap: 0, marginTop: 24 },
  seccionLabel:{ fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: ORO, marginBottom: 8 },
  seccionLabelMb: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: ORO, marginBottom: 6 },

  // Evento card
  eventoCard:     { borderWidth: 1, borderColor: DIVIDER, borderRadius: 4, padding: 14, backgroundColor: CARD, gap: 8 },
  eventoCardMuted:{ opacity: 0.5 },
  eventoCardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eventoCardHeadLeft:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eventoCardHeadRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eventoNombre:   { fontFamily: fonts.cuerpo, fontSize: 18, fontWeight: '700', color: TEXTO, lineHeight: 22 },
  eventoNombreMuted: { color: MUTED },
  eventoFecha:    { fontFamily: fonts.label, fontSize: 13, color: MUTED, letterSpacing: 0.3 },
  eventoMontoSug: { fontFamily: fonts.label, fontSize: 13, color: MUTED },
  eventoStats:    { fontFamily: fonts.label, fontSize: 13, color: MUTED, letterSpacing: 0.3 },

  // Badges
  tipoBadge:      { borderWidth: 1.5, borderRadius: 2, paddingHorizontal: 7, paddingVertical: 3 },
  tipoBadgeTexto: { fontFamily: fonts.label, fontSize: 12, fontWeight: '700', letterSpacing: 1.5 },
  divBadge:       { borderWidth: 1, borderColor: DIVIDER, borderRadius: 2, paddingHorizontal: 7, paddingVertical: 3 },
  divBadgeTexto:  { fontFamily: fonts.label, fontSize: 12, letterSpacing: 0.5, color: MUTED },

  // Progress bar
  progWrap: { height: 4, backgroundColor: DIVIDER, borderRadius: 2, overflow: 'hidden' },
  progFill: { height: 4, backgroundColor: ORO, borderRadius: 2 },

  // FAB
  fabWrap: { position: 'absolute', bottom: 24, left: 16, right: 16 },
  fab:     { backgroundColor: ORO, paddingVertical: 15, borderRadius: 3, alignItems: 'center' },
  fabTexto:{ fontFamily: fonts.label, color: colors.sobreOro, fontSize: 13, letterSpacing: 2.5, fontWeight: '700' },

  // Detalle
  detalleTopBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, gap: 8 },
  backBtn:            { padding: 4 },
  detalleLabelHeader: { flex: 1, fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: ORO },
  cerradoBadge:       { backgroundColor: DIVIDER, borderRadius: 2, paddingHorizontal: 8, paddingVertical: 3 },
  cerradoTexto:       { fontFamily: fonts.label, fontSize: 12, color: MUTED, fontWeight: '700', letterSpacing: 1 },
  detalleNombreWrap:  { paddingHorizontal: 20, paddingBottom: 12, paddingTop: 4 },
  detalleNombre:      { fontFamily: fonts.titulo, fontSize: 28, color: TEXTO, lineHeight: 34 },
  detalleMetaRow:     { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', paddingHorizontal: 20, gap: 8, marginBottom: 8 },
  montoSugTexto:      { fontFamily: fonts.label, fontSize: 14, color: ORO_HONDO, paddingHorizontal: 20, marginBottom: 12 },
  detalleScroll:      { padding: 20, paddingBottom: 48 },

  // Resumen financiero
  resumenBar:    { flexDirection: 'row', borderWidth: 1, borderColor: DIVIDER, borderRadius: 4, overflow: 'hidden' },
  resumenItem:   { flex: 1, alignItems: 'center', paddingVertical: 14, gap: 4 },
  resumenDiv:    { width: 1, backgroundColor: DIVIDER },
  resumenLabel:  { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1.5, color: MUTED },
  resumenVal:    { fontFamily: fonts.cuerpo, fontSize: 19, fontWeight: '700' },
  resumenValVerde:  { color: VERDE },
  resumenValRojo:   { color: colors.rojoTexto },
  resumenValMuted:  { color: MUTED },
  resumenValCobrado:{ fontFamily: fonts.cuerpo, fontSize: 17, fontWeight: '700', color: TEXTO },

  porDivWrap:    { marginTop: 16 },
  divFila:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  divFilaNombre: { fontFamily: fonts.cuerpo, fontSize: 15, color: TEXTO, flex: 1, marginRight: 8 },
  divFilaDetalle:{ fontFamily: fonts.label, fontSize: 13, color: MUTED },

  // Pedidos
  pedidosList:      { gap: 10, marginTop: 8 },
  pedidoCard:       { borderWidth: 1, borderColor: DIVIDER, borderRadius: 4, padding: 14, gap: 4 },
  pedidoHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  pedidoManager:    { fontFamily: fonts.cuerpo, fontSize: 16, fontWeight: '700', color: TEXTO },
  pedidoItem:       { fontFamily: fonts.cuerpo, fontSize: 15, color: MUTED },
  pedidoFecha:      { fontFamily: fonts.label, fontSize: 13, color: MUTED, marginTop: 4 },
  estadoBadge:      { borderRadius: 2, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  estadoConfirmado: { borderColor: VERDE },
  estadoAbierto:    { borderColor: ORO_HONDO },
  estadoTexto:      { fontFamily: fonts.label, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  estadoTextoConfirmado: { color: VERDE },
  estadoTextoAbierto:    { color: ORO_HONDO },

  // Botón cerrar evento
  botonCerrar:      { marginTop: 32, borderWidth: 1.5, borderColor: ROJO, paddingVertical: 15, borderRadius: 3, alignItems: 'center' },
  botonCerrarOff:   { opacity: 0.6 },
  botonCerrarTexto: { fontFamily: fonts.label, color: colors.rojoTexto, fontSize: 13, letterSpacing: 2.5, fontWeight: '700' },

  // Modal
  kavFlex:        { flex: 1 },
  modalContainer: { flex: 1, backgroundColor: FONDO },
  modalHeader:    { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 18 },
  modalSuper:     { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: ORO, marginBottom: 4 },
  modalTitulo:    { fontFamily: fonts.titulo, fontSize: 26, color: TEXTO },
  modalCloseBtn:  { padding: 4, marginTop: 4 },
  modalScroll:    { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20, gap: 24 },
  modalFooter:    { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: DIVIDER, backgroundColor: FONDO },

  // Campos
  campo:     { gap: 10 },
  campoLabel:{ fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: ORO },
  modalAyuda:{ fontFamily: fonts.cuerpo, fontSize: 15, color: MUTED, lineHeight: 20 },
  sinDivTitulo: { fontFamily: fonts.titulo, fontSize: 25, color: TEXTO, marginBottom: 8 },
  divRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  inputLinea: {
    borderBottomWidth: 1.5, borderBottomColor: ORO, paddingVertical: 10,
    fontFamily: fonts.cuerpo, fontSize: 17, color: TEXTO,
  },
  montoWrap:   { flexDirection: 'row', alignItems: 'flex-end', borderBottomWidth: 1.5, borderBottomColor: ORO, paddingBottom: 8 },
  montoSimbolo:{ fontFamily: fonts.label, fontSize: 19, color: MUTED, marginRight: 6, lineHeight: 30 },
  montoInput:  { flex: 1, fontFamily: fonts.cuerpo, fontSize: 25, fontWeight: '700', color: TEXTO, padding: 0 },

  tipoRow:            { flexDirection: 'row', gap: 8 },
  tipoBtn:            { flex: 1, paddingVertical: 13, borderRadius: 3, borderWidth: 1.5, borderColor: DIVIDER, alignItems: 'center', justifyContent: 'center', minHeight: 56 },
  tipoBtnActivo:      { backgroundColor: ORO, borderColor: ORO },
  tipoBtnTexto:       { fontFamily: fonts.label, fontSize: 12, color: MUTED, fontWeight: '700', letterSpacing: 1, textAlign: 'center', lineHeight: 14 },
  tipoBtnTextoActivo: { color: colors.sobreOro },

  divPill:            { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: DIVIDER },
  divPillActiva:      { backgroundColor: ORO, borderColor: ORO },
  divPillTexto:       { fontFamily: fonts.label, fontSize: 14, color: MUTED },
  divPillTextoActivo: { color: colors.sobreOro },

  bannerError:      { backgroundColor: '#2A1010', borderLeftWidth: 3, borderLeftColor: ROJO, borderRadius: 4, padding: 12 },
  bannerErrorTexto: { fontFamily: fonts.cuerpo, fontSize: 15, color: '#FFAAAA' },
  bannerCierre:     { marginTop: 24 },

  botonPrincipal:      { backgroundColor: ORO, paddingVertical: 15, borderRadius: 3, alignItems: 'center' },
  botonPrincipalOff:   { opacity: 0.6 },
  botonPrincipalTexto: { fontFamily: fonts.label, color: colors.sobreOro, fontSize: 13, letterSpacing: 2.5, fontWeight: '700' },
})
