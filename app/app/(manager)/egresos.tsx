import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useEgresos, type Egreso, type EventoEgresos } from '@/hooks/useEgresos'
import { DatePickerField } from '@/components/ui/DatePickerField'
import { colors, fonts } from '@/constants/theme'

// ─── Tokens (mismos que Cobranzas) ────────────────────────────────────────────

const FONDO   = '#15110A'
const CARD    = '#1C1710'
const TEXTO   = '#F3EFE4'
const MUTED   = '#8E8574'
const DIVIDER = '#2C2418'
const ORO     = colors.oro
const ROJO    = colors.rojoUrgente
const VERDE   = '#4A7C59'

const TIPO_LABEL: Record<string, string> = {
  viaje:         'VIAJE',
  tercer_tiempo: '3er TIEMPO',
}

function formatFecha(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function formatMonto(n: number) {
  const abs = '$ ' + Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  return n < 0 ? '− ' + abs : abs
}

// ─── Chip de evento ───────────────────────────────────────────────────────────

function EventoChip({
  evento, activo, onPress,
}: {
  evento: EventoEgresos; activo: boolean; onPress: (id: string) => void
}) {
  const cerrado = evento.estado !== 'activo'
  return (
    <TouchableOpacity
      style={[s.chip, activo && s.chipActivo]}
      onPress={() => onPress(evento.id)}
      activeOpacity={0.8}
    >
      <Text style={[s.chipNombre, activo && s.chipNombreActivo]} numberOfLines={1}>{evento.nombre}</Text>
      <Text style={[s.chipMeta, activo && s.chipMetaActivo]} numberOfLines={1}>
        {TIPO_LABEL[evento.tipo] ?? evento.tipo} · {cerrado ? 'CERRADO' : 'ACTIVO'}
      </Text>
    </TouchableOpacity>
  )
}

// ─── Resumen Cobrado / Egresos / Neto ─────────────────────────────────────────

function Resumen({ cobrado, egresos, neto }: { cobrado: number; egresos: number; neto: number }) {
  return (
    <View style={s.resumenCard}>
      <View style={s.resumenItem}>
        <Text style={[s.resumenVal, s.resumenValTexto]} numberOfLines={1} adjustsFontSizeToFit>{formatMonto(cobrado)}</Text>
        <Text style={s.resumenLabel}>COBRADO</Text>
      </View>
      <View style={s.resumenDiv} />
      <View style={s.resumenItem}>
        <Text style={[s.resumenVal, s.resumenValRojo]} numberOfLines={1} adjustsFontSizeToFit>{formatMonto(egresos)}</Text>
        <Text style={s.resumenLabel}>EGRESOS</Text>
      </View>
      <View style={s.resumenDiv} />
      <View style={s.resumenItem}>
        <Text
          style={[s.resumenVal, neto < 0 ? s.resumenValRojo : s.resumenValVerde]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {formatMonto(neto)}
        </Text>
        <Text style={s.resumenLabel}>NETO</Text>
      </View>
    </View>
  )
}

// ─── Fila de egreso ───────────────────────────────────────────────────────────

function FilaEgreso({
  egreso, editable, borrando, onBorrar,
}: {
  egreso: Egreso; editable: boolean; borrando: boolean; onBorrar: (e: Egreso) => void
}) {
  return (
    <View style={s.fila}>
      <View style={s.filaTextos}>
        <Text style={s.filaConcepto} numberOfLines={2}>{egreso.concepto}</Text>
        <Text style={s.filaFecha}>{formatFecha(egreso.fecha)}</Text>
      </View>
      <Text style={s.filaMonto}>{formatMonto(egreso.monto)}</Text>
      {editable && (
        borrando
          ? <ActivityIndicator color={MUTED} size="small" style={s.filaAccion} />
          : (
            <TouchableOpacity
              onPress={() => onBorrar(egreso)}
              activeOpacity={0.7}
              style={s.filaAccion}
              accessibilityLabel={`Borrar egreso ${egreso.concepto}`}
            >
              <Ionicons name="trash-outline" size={18} color={MUTED} />
            </TouchableOpacity>
          )
      )}
    </View>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function EgresosScreen() {
  const {
    loading, errorCarga, recargar,
    eventos, eventoSeleccionado, seleccionarEvento, editable,
    cargandoDetalle, egresos, balance,
    form, setForm, guardando, errorGuardado, agregarEgreso,
    borrandoId, borrarEgreso,
  } = useEgresos()
  const router = useRouter()

  function confirmarBorrado(e: Egreso) {
    Alert.alert('Borrar egreso', `¿Borrar "${e.concepto}" (${formatMonto(e.monto)})?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: () => { borrarEgreso(e.id) } },
    ])
  }

  if (loading && eventos.length === 0) {
    return (
      <SafeAreaView style={s.centrado}>
        <ActivityIndicator color={ORO} size="large" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.labelHeader}>MANAGER · VIAJES Y TERCER TIEMPOS</Text>
        <Text style={s.titulo}>Egresos</Text>
      </View>
      <View style={s.separador} />

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.lista} keyboardShouldPersistTaps="handled">
          {errorCarga && (
            <TouchableOpacity style={s.bannerError} onPress={recargar} activeOpacity={0.8}>
              <Text style={s.bannerErrorTexto}>{errorCarga} Tocá para reintentar.</Text>
            </TouchableOpacity>
          )}

          {eventos.length === 0 ? (
            !errorCarga && (
              <View style={s.emptyWrap}>
                <Text style={s.emptyTexto}>Sin viajes ni tercer tiempos.</Text>
                <Text style={s.emptySubtexto}>
                  Creá un viaje o tercer tiempo para empezar a cargar sus egresos.
                </Text>
                <TouchableOpacity
                  style={s.gestionarBtn}
                  onPress={() => router.navigate('/(manager)/eventos')}
                  activeOpacity={0.8}
                >
                  <Text style={s.gestionarBtnTexto}>VIAJES Y TERCER TIEMPOS →</Text>
                </TouchableOpacity>
              </View>
            )
          ) : (
            <>
              <Text style={s.seccionLabel}>EVENTO</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.chipsRow}
              >
                {eventos.map(ev => (
                  <EventoChip
                    key={ev.id}
                    evento={ev}
                    activo={ev.id === eventoSeleccionado?.id}
                    onPress={seleccionarEvento}
                  />
                ))}
              </ScrollView>

              {eventoSeleccionado && (
                <View style={s.eventoResumen}>
                  <Text style={s.eventoNombre} numberOfLines={2}>{eventoSeleccionado.nombre}</Text>
                  <Text style={s.eventoMeta}>
                    {[
                      eventoSeleccionado.divisionNombre,
                      eventoSeleccionado.fecha ? formatFecha(eventoSeleccionado.fecha) : null,
                    ].filter(Boolean).join('  ·  ')}
                  </Text>
                </View>
              )}

              <Resumen cobrado={balance.totalCobrado} egresos={balance.totalEgresos} neto={balance.neto} />

              {/* Formulario de alta: sólo con el evento activo */}
              {editable ? (
                <View style={s.formCard}>
                  <Text style={s.seccionLabel}>NUEVO EGRESO</Text>

                  <View style={s.campo}>
                    <Text style={s.campoLabel}>CONCEPTO</Text>
                    <TextInput
                      style={s.input}
                      value={form.concepto}
                      onChangeText={v => setForm(f => ({ ...f, concepto: v }))}
                      placeholder="Micro, comida, alojamiento…"
                      placeholderTextColor={MUTED}
                      maxLength={120}
                    />
                  </View>

                  <View style={s.campo}>
                    <Text style={s.campoLabel}>MONTO</Text>
                    <View style={s.montoWrap}>
                      <Text style={s.montoSimbolo}>$</Text>
                      <TextInput
                        style={s.montoInput}
                        value={form.monto}
                        onChangeText={v => setForm(f => ({ ...f, monto: v }))}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={MUTED}
                        maxLength={14}
                      />
                    </View>
                  </View>

                  <DatePickerField
                    label="FECHA"
                    value={form.fecha}
                    onChange={v => setForm(f => ({ ...f, fecha: v }))}
                    maximumDate={new Date()}
                  />


                  {errorGuardado && (
                    <View style={s.bannerError}>
                      <Text style={s.bannerErrorTexto}>{errorGuardado}</Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={[s.botonPrincipal, guardando && s.botonPrincipalOff]}
                    onPress={() => { agregarEgreso() }}
                    disabled={guardando}
                    activeOpacity={0.85}
                  >
                    {guardando
                      ? <ActivityIndicator color={ORO} size="small" />
                      : <Text style={s.botonPrincipalTexto}>AGREGAR EGRESO</Text>
                    }
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={s.bannerInfo}>
                  <Text style={s.bannerInfoTexto}>
                    Evento cerrado: los egresos quedan sólo para consulta.
                  </Text>
                  {errorGuardado && <Text style={s.bannerErrorTexto}>{errorGuardado}</Text>}
                </View>
              )}

              <View style={s.seccionHeader}>
                <Text style={s.seccionLabel}>EGRESOS CARGADOS</Text>
                <Text style={s.seccionConteo}>{egresos.length}</Text>
              </View>

              {cargandoDetalle ? (
                <ActivityIndicator color={ORO} style={s.detalleLoader} />
              ) : egresos.length === 0 ? (
                <Text style={s.emptyTexto}>Sin egresos cargados.</Text>
              ) : (
                <View>
                  {egresos.map((e, i) => (
                    <View key={e.id}>
                      {i > 0 && <View style={s.filaDiv} />}
                      <FilaEgreso
                        egreso={e}
                        editable={editable}
                        borrando={borrandoId === e.id}
                        onBorrar={confirmarBorrado}
                      />
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: FONDO },
  centrado:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: FONDO, gap: 8 },
  flex:      { flex: 1 },

  // Header
  header:      { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  labelHeader: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: ORO, marginBottom: 4 },
  titulo:      { fontFamily: fonts.titulo, fontSize: 32, color: TEXTO, lineHeight: 38 },
  separador:   { height: 1, backgroundColor: DIVIDER, marginHorizontal: 20 },

  lista:         { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40, gap: 14 },
  seccionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  seccionLabel:  { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: ORO },
  seccionConteo: { fontFamily: fonts.cuerpo, fontSize: 15, color: MUTED, fontWeight: '600' },
  emptyWrap:     { gap: 6, marginTop: 8 },
  emptyTexto:    { fontFamily: fonts.cuerpo, color: MUTED, fontSize: 16, fontStyle: 'italic' },
  emptySubtexto: { fontFamily: fonts.cuerpo, color: MUTED, fontSize: 14, lineHeight: 18 },
  gestionarBtn:      { marginTop: 14, borderWidth: 1, borderColor: DIVIDER, borderRadius: 3, paddingVertical: 14, alignItems: 'center' },
  gestionarBtnTexto: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: ORO, fontWeight: '700' },

  // Chips de evento
  chipsRow:         { gap: 8, paddingRight: 16 },
  chip:             { borderWidth: 1, borderColor: DIVIDER, borderRadius: 3, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: CARD, maxWidth: 220 },
  chipActivo:       { backgroundColor: TEXTO, borderColor: TEXTO },
  chipNombre:       { fontFamily: fonts.cuerpo, fontSize: 15, fontWeight: '700', color: TEXTO },
  chipNombreActivo: { color: FONDO },
  chipMeta:         { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1, color: MUTED, marginTop: 2 },
  chipMetaActivo:   { color: colors.oroHondo },

  // Evento elegido
  eventoResumen: { gap: 4 },
  eventoNombre:  { fontFamily: fonts.titulo, fontSize: 21, color: TEXTO, lineHeight: 26 },
  eventoMeta:    { fontFamily: fonts.label, fontSize: 13, color: MUTED, letterSpacing: 0.5 },

  // Resumen
  resumenCard:     { flexDirection: 'row', borderWidth: 1, borderColor: DIVIDER, borderRadius: 4, backgroundColor: CARD, paddingVertical: 14, paddingHorizontal: 8 },
  resumenItem:     { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 4 },
  resumenDiv:      { width: 1, backgroundColor: DIVIDER, marginVertical: 4 },
  resumenLabel:    { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1.5, color: MUTED },
  resumenVal:      { fontFamily: fonts.cuerpo, fontSize: 17, fontWeight: '700' },
  resumenValTexto: { color: TEXTO },
  resumenValVerde: { color: VERDE },
  resumenValRojo:  { color: ROJO },

  // Formulario
  formCard:     { borderWidth: 1, borderColor: DIVIDER, borderRadius: 4, backgroundColor: CARD, padding: 16, gap: 16 },
  campo:        { gap: 8 },
  campoLabel:   { fontFamily: fonts.label, fontSize: 12, letterSpacing: 2, color: MUTED },
  input:        { fontFamily: fonts.cuerpo, fontSize: 17, color: TEXTO, borderBottomWidth: 1.5, borderBottomColor: DIVIDER, paddingVertical: 6, paddingHorizontal: 0 },
  montoWrap:    { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1.5, borderBottomColor: ORO },
  montoSimbolo: { fontFamily: fonts.label, fontSize: 17, color: MUTED, marginRight: 6 },
  montoInput:   { flex: 1, fontFamily: fonts.cuerpo, fontSize: 17, fontWeight: '700', color: TEXTO, paddingVertical: 6, paddingHorizontal: 0 },

  // Lista de egresos
  detalleLoader: { marginTop: 12 },
  filaDiv:       { height: 1, backgroundColor: DIVIDER },
  fila:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10 },
  filaTextos:    { flex: 1 },
  filaConcepto:  { fontFamily: fonts.cuerpo, fontSize: 16, fontWeight: '700', color: TEXTO },
  filaFecha:     { fontFamily: fonts.label, fontSize: 12, color: MUTED, letterSpacing: 0.5, marginTop: 2 },
  filaMonto:     { fontFamily: fonts.cuerpo, fontSize: 16, fontWeight: '700', color: TEXTO },
  filaAccion:    { padding: 4, width: 28, alignItems: 'center' },

  // Banners
  bannerError:      { backgroundColor: '#2A1010', borderLeftWidth: 3, borderLeftColor: ROJO, borderRadius: 4, padding: 12 },
  bannerErrorTexto: { fontFamily: fonts.cuerpo, fontSize: 15, color: '#FFAAAA' },
  bannerInfo:       { borderWidth: 1, borderColor: DIVIDER, borderLeftWidth: 3, borderLeftColor: ORO, borderRadius: 4, padding: 12, gap: 6 },
  bannerInfoTexto:  { fontFamily: fonts.cuerpo, fontSize: 15, color: TEXTO },

  // Botón principal
  botonPrincipal:      { backgroundColor: TEXTO, paddingVertical: 15, borderRadius: 3, alignItems: 'center' },
  botonPrincipalOff:   { opacity: 0.6 },
  botonPrincipalTexto: { fontFamily: fonts.label, color: ORO, fontSize: 13, letterSpacing: 2.5, fontWeight: '700' },
})
