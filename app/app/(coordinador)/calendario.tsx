import { useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useCalendario, EventoCalendario, TipoEvento } from '@/hooks/useCalendario'
import { DatePickerField } from '@/components/ui/DatePickerField'
import { colors, fonts } from '@/constants/theme'

// ─── Tokens ───────────────────────────────────────────────────────────────────

const FONDO   = '#15110A'
const CARD    = '#1C1710'
const TEXTO   = '#F3EFE4'
const MUTED   = '#8E8574'
const DIVIDER = '#2C2418'
const ROJO    = colors.rojoUrgente
const VERDE   = '#22C55E'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fechaCorta(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

function esHoy(iso: string) {
  return iso === new Date().toISOString().split('T')[0]
}

function esPasado(iso: string) {
  return iso < new Date().toISOString().split('T')[0]
}

// ─── FilaEvento ───────────────────────────────────────────────────────────────

function FilaEvento({ evento }: { evento: EventoCalendario }) {
  const pasado    = esPasado(evento.fecha)
  const hoy       = esHoy(evento.fecha)
  const esPartido = evento.tipo === 'partido'

  return (
    <View style={[styles.fila, pasado && styles.filaPasada]}>
      <View style={[styles.tipoBadge, esPartido ? styles.badgePartido : styles.badgeEntrenamiento]}>
        <Text style={styles.tipoBadgeTexto}>{esPartido ? 'P' : 'E'}</Text>
      </View>
      <View style={styles.filaInfo}>
        <View style={styles.filaTituloRow}>
          <Text style={[styles.eventoTitulo, pasado && styles.eventoTituloPasado]} numberOfLines={1}>
            {esPartido ? `vs. ${evento.rival ?? 'Rival'}` : 'Entrenamiento'}
          </Text>
          {hoy && <View style={styles.hoyBadge}><Text style={styles.hoyTexto}>HOY</Text></View>}
        </View>
        <Text style={styles.eventoMeta}>
          {fechaCorta(evento.fecha)}
          {evento.hora ? ` · ${evento.hora}` : ''}
          {evento.lugar ? ` · ${evento.lugar}` : ''}
        </Text>
        <Text style={styles.eventoDiv}>{evento.division_nombre}</Text>
      </View>
    </View>
  )
}

// ─── ModalNuevoEvento ─────────────────────────────────────────────────────────

interface ModalNuevoEventoProps {
  visible:       boolean
  onClose:       () => void
  onGuardar:     () => Promise<void>
  divisiones:    { id: string; nombre: string }[]
  form:          ReturnType<typeof useCalendario>['form']
  setForm:       ReturnType<typeof useCalendario>['setForm']
  guardando:     boolean
  errorGuardado: string | null
}

function ModalNuevoEvento({
  visible, onClose, onGuardar, divisiones, form, setForm, guardando, errorGuardado,
}: ModalNuevoEventoProps) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.kavFlex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitulo}>Nuevo evento</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.modalCerrar}>Cancelar</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollFlex} contentContainerStyle={styles.modalBody}>
            {/* Tipo */}
            <Text style={styles.inputLabel}>TIPO</Text>
            <View style={styles.tipoRow}>
              {(['entrenamiento', 'partido'] as TipoEvento[]).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.tipoBoton, form.tipo === t && styles.tipoBotonActivo]}
                  onPress={() => setForm({ ...form, tipo: t })}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.tipoBotonTexto, form.tipo === t && styles.tipoBotonTextoActivo]}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* División (solo si tiene más de una) */}
            {divisiones.length > 1 && (
              <>
                <Text style={styles.inputLabel}>DIVISIÓN</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.divScroll}>
                  <View style={styles.divRow}>
                    {divisiones.map(d => (
                      <TouchableOpacity
                        key={d.id}
                        style={[styles.divPill, form.division_id === d.id && styles.divPillActiva]}
                        onPress={() => setForm({ ...form, division_id: d.id })}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.divPillTexto, form.division_id === d.id && styles.divPillTextoActivo]}>
                          {d.nombre}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}

            {/* Fecha */}
            <DatePickerField
              label="FECHA"
              value={form.fecha}
              onChange={v => setForm({ ...form, fecha: v })}
            />

            {/* Hora */}
            <DatePickerField
              label="HORA (opcional)"
              value={form.hora}
              onChange={v => setForm({ ...form, hora: v })}
              mode="time"
              onClear={() => setForm({ ...form, hora: '' })}
            />

            {/* Lugar */}
            <Text style={styles.inputLabel}>CANCHA / LUGAR (opcional)</Text>
            <TextInput
              style={styles.input}
              placeholder="ej. Cancha 1"
              placeholderTextColor={MUTED}
              value={form.lugar}
              onChangeText={v => setForm({ ...form, lugar: v })}
            />

            {/* Rival — solo para partido */}
            {form.tipo === 'partido' && (
              <>
                <Text style={styles.inputLabel}>RIVAL</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Nombre del equipo rival"
                  placeholderTextColor={MUTED}
                  value={form.rival}
                  onChangeText={v => setForm({ ...form, rival: v })}
                />
              </>
            )}

            {errorGuardado && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorTexto}>{errorGuardado}</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[styles.botonGuardar, guardando && styles.botonGuardandoOff]}
              onPress={onGuardar}
              disabled={guardando}
              activeOpacity={0.85}
            >
              {guardando
                ? <ActivityIndicator color={colors.oro} size="small" />
                : <Text style={styles.botonGuardarTexto}>GUARDAR EVENTO</Text>
              }
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CalendarioScreen() {
  const {
    eventos, divisiones, loading, guardando, errorGuardado,
    sinDivisiones, form, setForm, resetForm, crearEvento, recargar,
  } = useCalendario()

  const [modalVisible, setModalVisible] = useState(false)

  function abrirModal() { resetForm(); setModalVisible(true) }
  async function handleGuardar() {
    const ok = await crearEvento()
    if (ok) setModalVisible(false)
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.centrado}>
        <ActivityIndicator color={colors.oro} size="large" />
      </SafeAreaView>
    )
  }

  if (sinDivisiones) {
    return (
      <SafeAreaView style={styles.centrado}>
        <Text style={styles.mutedTexto}>Sin divisiones asignadas.</Text>
        <Text style={styles.mutedTexto}>Contactá a la Subcomisión.</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.labelHeader}>COORDINADOR</Text>
        <View style={styles.headerRow}>
          <Text style={styles.titulo}>Calendario</Text>
          <TouchableOpacity style={styles.botonNuevo} onPress={abrirModal} activeOpacity={0.8}>
            <Text style={styles.botonNuevoTexto}>+ Nuevo</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitulo}>
          {eventos.length === 0 ? 'Sin eventos próximos' : `${eventos.length} evento${eventos.length !== 1 ? 's' : ''}`}
        </Text>
      </View>

      <View style={styles.divider} />

      <FlatList
        data={eventos}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <FilaEvento evento={item} />}
        ItemSeparatorComponent={() => <View style={styles.divider} />}
        contentContainerStyle={eventos.length === 0 ? styles.listaVacia : styles.listaContent}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.mutedTexto}>No hay eventos en los próximos 60 días.</Text>
            <TouchableOpacity onPress={abrirModal} activeOpacity={0.8} style={styles.crearPrimeroBtn}>
              <Text style={styles.crearPrimeroTexto}>Crear el primero</Text>
            </TouchableOpacity>
          </View>
        }
        onRefresh={recargar}
        refreshing={loading}
      />

      <ModalNuevoEvento
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onGuardar={handleGuardar}
        divisiones={divisiones}
        form={form}
        setForm={setForm}
        guardando={guardando}
        errorGuardado={errorGuardado}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: FONDO },
  centrado:   { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: FONDO, gap: 8 },
  mutedTexto: { fontFamily: fonts.cuerpo, color: MUTED, fontSize: 14, fontStyle: 'italic' },

  header:      { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  labelHeader: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 2.5, color: colors.oro, marginBottom: 4 },
  headerRow:   { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  titulo:      { fontFamily: fonts.titulo, fontSize: 32, color: TEXTO },
  subtitulo:   { fontFamily: fonts.cuerpo, fontSize: 12, color: MUTED, marginTop: 4, letterSpacing: 0.3 },
  botonNuevo:  { backgroundColor: TEXTO, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 4, marginBottom: 4 },
  botonNuevoTexto: { fontFamily: fonts.label, color: colors.oro, fontSize: 12, letterSpacing: 1.5, fontWeight: '600' },

  divider:     { height: 1, backgroundColor: DIVIDER, marginHorizontal: 20 },
  listaVacia:  { flex: 1 },
  listaContent:{ paddingBottom: 16 },

  fila:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 12 },
  filaPasada:     { opacity: 0.5 },
  filaInfo:       { flex: 1 },
  filaTituloRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tipoBadge:      { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  badgePartido:   { backgroundColor: TEXTO },
  badgeEntrenamiento: { backgroundColor: CARD, borderWidth: 1, borderColor: DIVIDER },
  tipoBadgeTexto: { fontFamily: fonts.label, fontSize: 12, fontWeight: '700', color: colors.oro },
  eventoTitulo:   { fontFamily: fonts.cuerpo, fontSize: 15, color: TEXTO, fontWeight: '500', flex: 1 },
  eventoTituloPasado: { color: MUTED },
  eventoMeta:     { fontFamily: fonts.cuerpo, fontSize: 12, color: MUTED, marginTop: 2 },
  eventoDiv:      { fontFamily: fonts.label, fontSize: 11, color: colors.oro, marginTop: 2, letterSpacing: 0.5 },
  hoyBadge:       { backgroundColor: VERDE, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1 },
  hoyTexto:       { fontFamily: fonts.label, fontSize: 9, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },

  emptyWrap:        { alignItems: 'center', paddingVertical: 48 },
  crearPrimeroBtn:  { marginTop: 16 },
  crearPrimeroTexto:{ fontFamily: fonts.label, color: colors.oro, fontSize: 14, fontWeight: '600' },

  // Modal
  kavFlex:         { flex: 1 },
  scrollFlex:      { flex: 1 },
  divScroll:       { marginBottom: 16 },
  divRow:          { flexDirection: 'row', gap: 8 },
  modalContainer:  { flex: 1, backgroundColor: FONDO },
  modalHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: DIVIDER },
  modalTitulo:     { fontFamily: fonts.titulo, fontSize: 18, color: TEXTO },
  modalCerrar:     { fontFamily: fonts.cuerpo, fontSize: 14, color: MUTED },
  modalBody:       { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },
  modalFooter:     { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: DIVIDER },
  inputLabel:      { fontFamily: fonts.label, fontSize: 10, letterSpacing: 2, color: colors.oro, marginBottom: 6 },
  input:           { borderWidth: 1.5, borderColor: DIVIDER, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 13, fontFamily: fonts.cuerpo, fontSize: 15, color: TEXTO, backgroundColor: CARD, marginBottom: 20 },
  tipoRow:         { flexDirection: 'row', gap: 10, marginBottom: 20 },
  tipoBoton:       { flex: 1, paddingVertical: 12, borderRadius: 4, borderWidth: 1.5, borderColor: DIVIDER, alignItems: 'center' },
  tipoBotonActivo: { backgroundColor: TEXTO, borderColor: TEXTO },
  tipoBotonTexto:  { fontFamily: fonts.cuerpo, fontSize: 13, color: MUTED, fontWeight: '500' },
  tipoBotonTextoActivo: { color: colors.oro },
  divPill:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: DIVIDER },
  divPillActiva:   { backgroundColor: TEXTO, borderColor: TEXTO },
  divPillTexto:    { fontFamily: fonts.cuerpo, fontSize: 13, color: MUTED },
  divPillTextoActivo: { color: colors.oro },
  errorBanner:     { backgroundColor: '#2A1010', borderLeftWidth: 3, borderLeftColor: ROJO, borderRadius: 4, padding: 12, marginTop: 4 },
  errorTexto:      { fontFamily: fonts.cuerpo, fontSize: 13, color: '#FFAAAA' },
  botonGuardar:    { backgroundColor: TEXTO, paddingVertical: 16, borderRadius: 4, alignItems: 'center' },
  botonGuardandoOff: { opacity: 0.6 },
  botonGuardarTexto: { fontFamily: fonts.label, color: colors.oro, fontSize: 12, letterSpacing: 2.5, fontWeight: '600' },
})
