import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  TextInput,
} from 'react-native'
import {
  useCobranzas,
  EventoFinanciero,
  CobranzaJugador,
  FormaDePago,
  Resumen,
} from '@/hooks/useCobranzas'

const CREAM   = '#F5F0E8'
const GOLD    = '#C9A84C'
const DARK    = '#1A1A1A'
const DIVIDER = '#D1C9B8'
const MUTED   = '#7C7267'
const VERDE   = '#22C55E'
const ROJO    = '#EF4444'
const AZUL    = '#3B82F6'

const TIPO_LABEL: Record<string, string> = {
  viaje:         'Viaje',
  tercer_tiempo: 'Tercer Tiempo',
  recaudacion:   'Recaudación',
}

const TIPO_COLOR: Record<string, string> = {
  viaje:         AZUL,
  tercer_tiempo: VERDE,
  recaudacion:   GOLD,
}

const FORMA_LABEL: Array<{ key: FormaDePago; label: string }> = [
  { key: 'efectivo',     label: 'Efectivo'     },
  { key: 'transferencia', label: 'Transferencia' },
  { key: 'otro',         label: 'Otro'          },
]

function formatFecha(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function formatMonto(n: number) {
  return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ─── Chip de tipo de evento ───────────────────────────────────────────────────

function TipoBadge({ tipo }: { tipo: string }) {
  const color = TIPO_COLOR[tipo] ?? MUTED
  return (
    <View style={[styles.tipoBadge, { borderColor: color }]}>
      <Text style={[styles.tipoBadgeTexto, { color }]}>{TIPO_LABEL[tipo] ?? tipo}</Text>
    </View>
  )
}

// ─── Card de evento financiero ────────────────────────────────────────────────

function EventoCard({
  evento,
  activo,
  onSelect,
}: {
  evento: EventoFinanciero
  activo: boolean
  onSelect: (ev: EventoFinanciero) => void
}) {
  return (
    <TouchableOpacity
      style={[styles.card, activo && styles.cardActivo]}
      onPress={() => onSelect(evento)}
      activeOpacity={0.8}
    >
      <View style={styles.cardRow}>
        <View style={[styles.dot, { backgroundColor: activo ? GOLD : DIVIDER }]} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[styles.cardTitulo, activo && { color: GOLD }]} numberOfLines={1}>
            {evento.nombre}
          </Text>
          {evento.fecha && (
            <Text style={styles.cardSub}>{formatFecha(evento.fecha)}</Text>
          )}
          {evento.descripcion ? (
            <Text style={styles.cardSub} numberOfLines={1}>{evento.descripcion}</Text>
          ) : null}
        </View>
        <TipoBadge tipo={evento.tipo} />
        {activo && <Text style={styles.checkVerde}>✓</Text>}
      </View>
    </TouchableOpacity>
  )
}

// ─── Barra de resumen ─────────────────────────────────────────────────────────

function BarraResumen({ resumen }: { resumen: Resumen }) {
  return (
    <View style={styles.resumenBar}>
      <View style={styles.resumenItem}>
        <Text style={styles.resumenLabel}>COBRADO</Text>
        <Text style={styles.resumenValor}>{formatMonto(resumen.cobrado)}</Text>
      </View>
      <View style={styles.resumenDiv} />
      <View style={styles.resumenItem}>
        <Text style={styles.resumenLabel}>PAGADOS</Text>
        <Text style={[styles.resumenValor, { color: VERDE }]}>{resumen.pagados}</Text>
      </View>
      <View style={styles.resumenDiv} />
      <View style={styles.resumenItem}>
        <Text style={styles.resumenLabel}>PENDIENTES</Text>
        <Text style={[styles.resumenValor, { color: resumen.pendientes > 0 ? ROJO : MUTED }]}>
          {resumen.pendientes}
        </Text>
      </View>
    </View>
  )
}

// ─── Fila de cobranza por jugador ─────────────────────────────────────────────

function CobranzaRow({
  jugador,
  onToggle,
  onMonto,
  onForma,
}: {
  jugador: CobranzaJugador
  onToggle: (id: string) => void
  onMonto: (id: string, v: string) => void
  onForma: (id: string, f: FormaDePago) => void
}) {
  const pagado = jugador.estado === 'pagado'

  return (
    <View style={styles.cobranzaRow}>
      {/* Nombre + toggle estado */}
      <View style={styles.cobranzaCabeza}>
        <Text style={styles.jugadorNombre} numberOfLines={1}>{jugador.nombre}</Text>
        <TouchableOpacity
          style={[styles.estadoChip, pagado ? styles.chipPagado : styles.chipPendiente]}
          onPress={() => onToggle(jugador.jugadorId)}
          activeOpacity={0.75}
        >
          <Text style={[styles.chipTexto, { color: pagado ? '#fff' : MUTED }]}>
            {pagado ? '✓ Pagado' : 'Pendiente'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Monto + forma (solo si pagado) */}
      {pagado && (
        <View style={styles.pagoDetalle}>
          <View style={styles.montoRow}>
            <Text style={styles.campoLabel}>MONTO $</Text>
            <TextInput
              style={styles.montoInput}
              value={jugador.monto}
              onChangeText={v => onMonto(jugador.jugadorId, v)}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={DIVIDER}
              maxLength={10}
            />
          </View>
          <View style={styles.formaRow}>
            {FORMA_LABEL.map(({ key, label }) => {
              const activo = jugador.formaDePago === key
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.formaBtn, activo && styles.formaBtnActivo]}
                  onPress={() => onForma(jugador.jugadorId, key)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.formaBtnTexto, activo && { color: DARK, fontWeight: '700' }]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      )}
    </View>
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

  if (loading) {
    return (
      <SafeAreaView style={styles.centrado}>
        <ActivityIndicator color={GOLD} size="large" />
      </SafeAreaView>
    )
  }

  if (sinDivision) {
    return (
      <SafeAreaView style={styles.centrado}>
        <Text style={styles.mutedTexto}>Sin división asignada.</Text>
        <Text style={styles.mutedTexto}>Contactá a la Subcomisión.</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.labelHeader}>
          MANAGER · {divisionNombre.toUpperCase()}
          {paso === 'jugadores' && eventoSeleccionado ? ' · COBRANZAS' : ''}
        </Text>
        <Text style={styles.titulo}>Cobranzas</Text>
      </View>
      <View style={styles.separador} />

      {/* ── Paso: Eventos ── */}
      {paso === 'eventos' && (
        <ScrollView contentContainerStyle={styles.lista}>
          <Text style={styles.seccionLabel}>EVENTOS ACTIVOS</Text>

          {eventos.length === 0 ? (
            <View style={{ gap: 4, marginTop: 8 }}>
              <Text style={styles.emptyTexto}>Sin eventos activos.</Text>
              <Text style={styles.emptySubtexto}>
                La Subcomisión o el Coordinador deben crear viajes, tercer tiempos o recaudaciones.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10, marginTop: 8 }}>
              {eventos.map(ev => (
                <EventoCard
                  key={ev.id}
                  evento={ev}
                  activo={eventoSeleccionado?.id === ev.id}
                  onSelect={seleccionarEvento}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* ── Paso: Jugadores / Cobranzas ── */}
      {paso === 'jugadores' && (
        <View style={{ flex: 1 }}>
          <TouchableOpacity style={styles.volverBtn} onPress={volverAEventos} activeOpacity={0.7}>
            <Text style={styles.volverTexto}>← Volver a eventos</Text>
          </TouchableOpacity>

          {/* Encabezado del evento seleccionado */}
          {eventoSeleccionado && (
            <View style={styles.eventoResumen}>
              <View style={styles.cardRow}>
                <TipoBadge tipo={eventoSeleccionado.tipo} />
                <Text style={styles.eventoNombre} numberOfLines={1}>{eventoSeleccionado.nombre}</Text>
              </View>
              {eventoSeleccionado.fecha && (
                <Text style={styles.cardSub}>{formatFecha(eventoSeleccionado.fecha)}</Text>
              )}
            </View>
          )}

          {/* Resumen */}
          <BarraResumen resumen={resumen} />
          <View style={styles.separador} />

          {cargandoJugadores ? (
            <View style={styles.centrado}>
              <ActivityIndicator color={GOLD} />
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.jugadoresList}
              keyboardShouldPersistTaps="handled"
            >
              {jugadores.length === 0 ? (
                <Text style={styles.emptyTexto}>Sin jugadores activos en la división.</Text>
              ) : (
                jugadores.map((j, i) => (
                  <View key={j.jugadorId}>
                    {i > 0 && <View style={styles.filaDiv} />}
                    <CobranzaRow
                      jugador={j}
                      onToggle={toggleEstado}
                      onMonto={actualizarMonto}
                      onForma={actualizarFormaDePago}
                    />
                  </View>
                ))
              )}

              {error && (
                <View style={styles.bannerError}>
                  <Text style={styles.bannerErrorTexto}>{error}</Text>
                </View>
              )}

              {guardadoOk && (
                <View style={styles.bannerOk}>
                  <Text style={styles.bannerOkTexto}>✓ Cobranzas guardadas</Text>
                </View>
              )}
            </ScrollView>
          )}

          {/* Botón guardar fijo al fondo */}
          {!cargandoJugadores && jugadores.length > 0 && (
            <View style={styles.bottomBar}>
              <TouchableOpacity
                style={[styles.boton, guardando && { opacity: 0.6 }]}
                onPress={guardarCobranzas}
                disabled={guardando}
                activeOpacity={0.85}
              >
                {guardando
                  ? <ActivityIndicator color={GOLD} size="small" />
                  : <Text style={styles.botonTexto}>GUARDAR CAMBIOS</Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  )
}

// ─── Estilos ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: CREAM },
  centrado:     { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: CREAM, gap: 8 },
  mutedTexto:   { color: MUTED, fontSize: 14, fontFamily: 'serif', fontStyle: 'italic', textAlign: 'center' },

  header:       { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  labelHeader:  { fontSize: 10, letterSpacing: 2, color: GOLD, marginBottom: 4 },
  titulo:       { fontSize: 32, fontStyle: 'italic', fontFamily: 'serif', color: DARK, lineHeight: 36 },
  separador:    { height: 1, backgroundColor: DIVIDER, marginHorizontal: 20 },

  lista:        { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  seccionLabel: { fontSize: 10, letterSpacing: 2, color: GOLD },
  emptyTexto:   { color: MUTED, fontSize: 14, fontStyle: 'italic', fontFamily: 'serif' },
  emptySubtexto:{ color: MUTED, fontSize: 12, marginTop: 4 },
  checkVerde:   { fontSize: 16, color: VERDE, fontWeight: '700' },

  // Evento card
  card:         { borderWidth: 1, borderColor: DIVIDER, borderRadius: 8, padding: 14 },
  cardActivo:   { borderColor: GOLD, backgroundColor: '#FBF6EA' },
  cardRow:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot:          { width: 8, height: 8, borderRadius: 4 },
  cardTitulo:   { flex: 1, fontSize: 15, fontWeight: '700', color: DARK },
  cardSub:      { fontSize: 12, color: MUTED, marginTop: 2 },

  // Tipo badge
  tipoBadge:      { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  tipoBadgeTexto: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  // Volver
  volverBtn:    { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8 },
  volverTexto:  { color: GOLD, fontSize: 13, fontWeight: '600' },

  // Evento resumen (en paso jugadores)
  eventoResumen:{ paddingHorizontal: 20, paddingBottom: 12, gap: 4 },
  eventoNombre: { flex: 1, fontSize: 16, fontWeight: '700', color: DARK },

  // Barra de resumen
  resumenBar:   { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 14, gap: 0 },
  resumenItem:  { flex: 1, alignItems: 'center', gap: 2 },
  resumenDiv:   { width: 1, backgroundColor: DIVIDER, marginVertical: 4 },
  resumenLabel: { fontSize: 9, letterSpacing: 1.5, color: MUTED },
  resumenValor: { fontSize: 16, fontWeight: '700', color: DARK },

  // Lista jugadores
  jugadoresList:{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  filaDiv:      { height: 1, backgroundColor: DIVIDER },

  // Fila cobranza
  cobranzaRow:  { paddingVertical: 12, gap: 10 },
  cobranzaCabeza:{ flexDirection: 'row', alignItems: 'center', gap: 10 },
  jugadorNombre:{ flex: 1, fontSize: 14, fontWeight: '600', color: DARK },

  // Toggle estado
  estadoChip:     { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1 },
  chipPagado:     { backgroundColor: VERDE, borderColor: VERDE },
  chipPendiente:  { backgroundColor: 'transparent', borderColor: DIVIDER },
  chipTexto:      { fontSize: 12, fontWeight: '600' },

  // Detalle pago
  pagoDetalle:  { paddingLeft: 0, gap: 8 },
  montoRow:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  campoLabel:   { fontSize: 10, letterSpacing: 1.5, color: GOLD, width: 60 },
  montoInput:   { borderWidth: 1.5, borderColor: DIVIDER, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10, fontSize: 16, fontWeight: '700', color: DARK, width: 110 },

  // Forma de pago
  formaRow:       { flexDirection: 'row', gap: 8 },
  formaBtn:       { borderWidth: 1, borderColor: DIVIDER, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  formaBtnActivo: { borderColor: GOLD, backgroundColor: '#FBF0D0' },
  formaBtnTexto:  { fontSize: 12, color: MUTED },

  // Bottom bar
  bottomBar:    { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: DIVIDER, backgroundColor: CREAM },
  boton:        { backgroundColor: DARK, paddingVertical: 14, borderRadius: 4, alignItems: 'center' },
  botonTexto:   { color: GOLD, fontSize: 11, letterSpacing: 2.5, fontWeight: '600' },

  // Banners
  bannerError:      { marginTop: 12, backgroundColor: '#FEF2F2', borderLeftWidth: 3, borderLeftColor: ROJO, borderRadius: 6, padding: 12 },
  bannerErrorTexto: { fontSize: 13, color: '#991B1B' },
  bannerOk:         { marginTop: 12, alignItems: 'center', paddingVertical: 8 },
  bannerOkTexto:    { fontSize: 13, color: VERDE, fontWeight: '600' },
})
