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
import { useTheme } from '@/contexts/ThemeContext'

const CREAM  = '#F5F0E8'
const GOLD   = '#C9A84C'
const DARK   = '#1A1A1A'
const DIVIDER = '#D1C9B8'
const MUTED  = '#7C7267'
const ROJO   = '#EF4444'
const VERDE  = '#22C55E'

function fechaCorta(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function esHoy(iso: string) {
  return iso === new Date().toISOString().split('T')[0]
}

function esPasado(iso: string) {
  return iso < new Date().toISOString().split('T')[0]
}

function FilaEvento({ evento }: { evento: EventoCalendario }) {
  const { colors: tc } = useTheme()
  const pasado = esPasado(evento.fecha)
  const hoy    = esHoy(evento.fecha)
  const esPartido = evento.tipo === 'partido'

  return (
    <View style={[styles.fila, pasado && styles.filaPasada]}>
      <View style={[styles.tipoBadge, esPartido ? styles.badgePartido : styles.badgeEntrenamiento]}>
        <Text style={styles.tipoBadgeTexto}>{esPartido ? 'P' : 'E'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[styles.eventoTitulo, { color: tc.tinta }, pasado && { color: MUTED }]} numberOfLines={1}>
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

interface ModalNuevoEventoProps {
  visible: boolean
  onClose: () => void
  onGuardar: () => Promise<void>
  divisiones: { id: string; nombre: string }[]
  form: ReturnType<typeof useCalendario>['form']
  setForm: ReturnType<typeof useCalendario>['setForm']
  guardando: boolean
  errorGuardado: string | null
}

function ModalNuevoEvento({
  visible,
  onClose,
  onGuardar,
  divisiones,
  form,
  setForm,
  guardando,
  errorGuardado,
}: ModalNuevoEventoProps) {
  const { colors: tc } = useTheme()
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: tc.fondo }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitulo, { color: tc.tinta }]}>Nuevo evento</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.modalCerrar}>Cancelar</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.modalBody}>
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
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
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
              style={[styles.input, { color: tc.tinta, backgroundColor: tc.card }]}
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
                  style={[styles.input, { color: tc.tinta, backgroundColor: tc.card }]}
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
              style={[styles.botonGuardar, guardando && { opacity: 0.6 }]}
              onPress={onGuardar}
              disabled={guardando}
              activeOpacity={0.85}
            >
              {guardando
                ? <ActivityIndicator color={GOLD} size="small" />
                : <Text style={styles.botonGuardarTexto}>GUARDAR EVENTO</Text>
              }
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

export default function CalendarioScreen() {
  const {
    eventos,
    divisiones,
    loading,
    guardando,
    errorGuardado,
    sinDivisiones,
    form,
    setForm,
    resetForm,
    crearEvento,
    recargar,
  } = useCalendario()

  const [modalVisible, setModalVisible] = useState(false)
  const { colors: tc } = useTheme()

  function abrirModal() {
    resetForm()
    setModalVisible(true)
  }

  async function handleGuardar() {
    const ok = await crearEvento()
    if (ok) setModalVisible(false)
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.centrado, { backgroundColor: tc.fondo }]}>
        <ActivityIndicator color={GOLD} size="large" />
      </SafeAreaView>
    )
  }

  if (sinDivisiones) {
    return (
      <SafeAreaView style={[styles.centrado, { backgroundColor: tc.fondo }]}>
        <Text style={styles.mutedTexto}>Sin divisiones asignadas.</Text>
        <Text style={styles.mutedTexto}>Contactá a la Subcomisión.</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tc.fondo }]}>
      <View style={styles.header}>
        <Text style={styles.labelHeader}>COORDINADOR</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <Text style={[styles.titulo, { color: tc.tinta }]}>Calendario</Text>
          <TouchableOpacity style={styles.botonNuevo} onPress={abrirModal} activeOpacity={0.8}>
            <Text style={styles.botonNuevoTexto}>+ Nuevo</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitulo}>
          {eventos.length === 0 ? 'Sin eventos próximos' : `${eventos.length} evento${eventos.length !== 1 ? 's' : ''}`}
        </Text>
      </View>

      <View style={{ height: 1, backgroundColor: tc.grisClaro, marginHorizontal: 20 }} />

      <FlatList
        data={eventos}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <FilaEvento evento={item} />}
        ItemSeparatorComponent={() => (
          <View style={{ height: 1, backgroundColor: tc.grisClaro, marginHorizontal: 20 }} />
        )}
        contentContainerStyle={eventos.length === 0 ? styles.listaVacia : { paddingBottom: 16 }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingVertical: 48 }}>
            <Text style={styles.mutedTexto}>No hay eventos en los próximos 60 días.</Text>
            <TouchableOpacity onPress={abrirModal} activeOpacity={0.8} style={{ marginTop: 16 }}>
              <Text style={{ color: GOLD, fontSize: 14, fontWeight: '600' }}>Crear el primero</Text>
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
  container:            { flex: 1, backgroundColor: CREAM },
  centrado:             { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: CREAM, gap: 8 },
  mutedTexto:           { color: MUTED, fontSize: 14, fontFamily: 'serif', fontStyle: 'italic' },
  header:               { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  labelHeader:          { fontSize: 10, letterSpacing: 2.5, color: GOLD, marginBottom: 4 },
  titulo:               { fontSize: 32, fontStyle: 'italic', fontFamily: 'serif', color: DARK },
  subtitulo:            { fontSize: 12, color: MUTED, marginTop: 4, letterSpacing: 0.3 },
  botonNuevo:           { backgroundColor: DARK, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 4, marginBottom: 4 },
  botonNuevoTexto:      { color: GOLD, fontSize: 12, letterSpacing: 1.5, fontWeight: '600' },
  fila:                 { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 12 },
  filaPasada:           { opacity: 0.5 },
  tipoBadge:            { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  badgePartido:         { backgroundColor: DARK },
  badgeEntrenamiento:   { backgroundColor: '#E8E0D0', borderWidth: 1, borderColor: DIVIDER },
  tipoBadgeTexto:       { fontSize: 12, fontWeight: '700', color: GOLD },
  eventoTitulo:         { fontSize: 15, color: DARK, fontWeight: '500', flex: 1 },
  eventoMeta:           { fontSize: 12, color: MUTED, marginTop: 2 },
  eventoDiv:            { fontSize: 11, color: GOLD, marginTop: 2, letterSpacing: 0.5 },
  hoyBadge:             { backgroundColor: VERDE, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1 },
  hoyTexto:             { fontSize: 9, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  listaVacia:           { flex: 1 },
  // Modal
  modalContainer:       { flex: 1, backgroundColor: CREAM },
  modalHeader:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: DIVIDER },
  modalTitulo:          { fontSize: 18, fontStyle: 'italic', fontFamily: 'serif', color: DARK },
  modalCerrar:          { fontSize: 14, color: MUTED },
  modalBody:            { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },
  modalFooter:          { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: DIVIDER },
  inputLabel:           { fontSize: 10, letterSpacing: 2, color: GOLD, marginBottom: 6 },
  input:                { borderWidth: 1.5, borderColor: DIVIDER, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: DARK, backgroundColor: '#fff' },
  tipoRow:              { flexDirection: 'row', gap: 10, marginBottom: 20 },
  tipoBoton:            { flex: 1, paddingVertical: 12, borderRadius: 4, borderWidth: 1.5, borderColor: DIVIDER, alignItems: 'center' },
  tipoBotonActivo:      { backgroundColor: DARK, borderColor: DARK },
  tipoBotonTexto:       { fontSize: 13, color: MUTED, fontWeight: '500' },
  tipoBotonTextoActivo: { color: GOLD },
  divPill:              { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: DIVIDER },
  divPillActiva:        { backgroundColor: DARK, borderColor: DARK },
  divPillTexto:         { fontSize: 13, color: MUTED },
  divPillTextoActivo:   { color: GOLD },
  errorBanner:          { backgroundColor: '#FEF2F2', borderLeftWidth: 3, borderLeftColor: ROJO, borderRadius: 4, padding: 12, marginTop: 4 },
  errorTexto:           { fontSize: 13, color: '#991B1B' },
  botonGuardar:         { backgroundColor: DARK, paddingVertical: 16, borderRadius: 4, alignItems: 'center' },
  botonGuardarTexto:    { color: GOLD, fontSize: 12, letterSpacing: 2.5, fontWeight: '600' },
})
