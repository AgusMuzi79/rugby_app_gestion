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
  StyleSheet,
  SafeAreaView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import {
  useNotificaciones,
  type RolDestinatario,
  type NotifForm,
} from '@/hooks/useNotificaciones'
import { useTheme } from '@/contexts/ThemeContext'

const CREAM   = '#F5F0E8'
const GOLD    = '#C9A84C'
const DARK    = '#1A1A1A'
const MUTED   = '#888888'
const DIVIDER = '#E5DDD0'
const ROJO    = '#EF4444'
const VERDE   = '#22C55E'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ROL_LABEL: Record<RolDestinatario, string> = {
  coordinador: 'Coordinador',
  entrenador:  'Entrenador',
  manager:     'Manager',
  todos:       'Todos',
}

function formatFecha(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function formatHora(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

// ─── NotifCard ───────────────────────────────────────────────────────────────

function NotifCard({ notif }: { notif: { id: string; titulo: string; mensaje: string; created_at: string; totalDestinatarios: number } }) {
  return (
    <View style={s.card}>
      <View style={s.cardFila}>
        <Text style={s.cardTitulo} numberOfLines={1}>{notif.titulo}</Text>
        <Text style={s.cardFecha}>{formatFecha(notif.created_at)} {formatHora(notif.created_at)}</Text>
      </View>
      <Text style={s.cardMensaje} numberOfLines={2}>{notif.mensaje}</Text>
      <View style={s.cardFooter}>
        <Ionicons name="people-outline" size={13} color={MUTED} style={{ marginRight: 4 }} />
        <Text style={s.cardDestinatarios}>
          {notif.totalDestinatarios} destinatario{notif.totalDestinatarios !== 1 ? 's' : ''}
        </Text>
      </View>
    </View>
  )
}

// ─── Modal nueva notificación ─────────────────────────────────────────────────

function ModalNuevoNotif({
  visible,
  onClose,
  onEnviar,
  form,
  setForm,
  enviando,
  error,
}: {
  visible:   boolean
  onClose:   () => void
  onEnviar:  () => Promise<void>
  form:      NotifForm
  setForm:   (f: NotifForm) => void
  enviando:  boolean
  error:     string | null
}) {
  const roles: RolDestinatario[] = ['todos', 'coordinador', 'entrenador', 'manager']

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitulo}>Nueva notificación</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Text style={s.modalCerrar}>Cancelar</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={s.inputLabel}>TÍTULO</Text>
            <TextInput
              style={s.input}
              placeholder="ej. Reunión de coordinación"
              placeholderTextColor={MUTED}
              value={form.titulo}
              onChangeText={v => setForm({ ...form, titulo: v })}
              returnKeyType="next"
              maxLength={80}
            />

            <Text style={s.inputLabel}>MENSAJE</Text>
            <TextInput
              style={[s.input, s.inputMultiline]}
              placeholder="Escribí el contenido de la notificación…"
              placeholderTextColor={MUTED}
              value={form.mensaje}
              onChangeText={v => setForm({ ...form, mensaje: v })}
              multiline
              numberOfLines={4}
              returnKeyType="default"
              textAlignVertical="top"
            />

            <Text style={s.inputLabel}>DESTINATARIOS</Text>
            <View style={s.rolRow}>
              {roles.map(rol => (
                <TouchableOpacity
                  key={rol}
                  style={[s.rolBtn, form.rolDestinatario === rol && s.rolBtnActivo]}
                  onPress={() => setForm({ ...form, rolDestinatario: rol })}
                  activeOpacity={0.8}
                >
                  <Text style={[s.rolBtnTexto, form.rolDestinatario === rol && s.rolBtnTextoActivo]}>
                    {ROL_LABEL[rol].toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {error && (
              <View style={s.errorBanner}>
                <Text style={s.errorTexto}>{error}</Text>
              </View>
            )}
          </ScrollView>

          <View style={s.modalFooter}>
            <TouchableOpacity
              style={[s.btnEnviar, enviando && { opacity: 0.6 }]}
              onPress={onEnviar}
              disabled={enviando}
              activeOpacity={0.85}
            >
              {enviando ? (
                <ActivityIndicator color={GOLD} size="small" />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="send-outline" size={14} color={GOLD} />
                  <Text style={s.btnEnviarTexto}>ENVIAR NOTIFICACIÓN</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function NotificacionesScreen() {
  const {
    loading,
    historial,
    modalVisible,
    abrirModal,
    cerrarModal,
    form,
    setForm,
    enviando,
    errorEnvio,
    enviarNotificacion,
  } = useNotificaciones()
  const { colors: tc } = useTheme()

  async function handleEnviar() {
    const ok = await enviarNotificacion()
    if (ok) cerrarModal()
  }

  return (
    <View style={[s.root, { backgroundColor: tc.fondo }]}>
      <View style={s.header}>
        <Text style={s.headerLabel}>SUBCOMISIÓN</Text>
        <View style={s.headerFila}>
          <Text style={s.headerTitulo}>Notificaciones</Text>
          <TouchableOpacity style={s.botonNuevo} onPress={abrirModal} activeOpacity={0.8}>
            <Text style={s.botonNuevoTexto}>+ Nueva</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.headerSub}>
          {historial.length} enviada{historial.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {loading ? (
        <View style={s.centrado}>
          <ActivityIndicator size="large" color={GOLD} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.listaContent}
          showsVerticalScrollIndicator={false}
        >
          {historial.length === 0 ? (
            <View style={s.vacio}>
              <Ionicons name="notifications-off-outline" size={40} color={MUTED} />
              <Text style={s.vacioTexto}>Sin notificaciones enviadas.</Text>
              <Text style={s.vacioSub}>Usá "+ Nueva" para enviar la primera.</Text>
            </View>
          ) : (
            <>
              <Text style={s.seccionLabel}>HISTORIAL</Text>
              {historial.map(n => (
                <NotifCard key={n.id} notif={n} />
              ))}
            </>
          )}
        </ScrollView>
      )}

      <ModalNuevoNotif
        visible={modalVisible}
        onClose={cerrarModal}
        onEnviar={handleEnviar}
        form={form}
        setForm={setForm}
        enviando={enviando}
        error={errorEnvio}
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

  vacio:     { alignItems: 'center', paddingTop: 80, gap: 12 },
  vacioTexto: { fontSize: 15, color: MUTED, fontWeight: '600' },
  vacioSub:   { fontSize: 13, color: MUTED, fontStyle: 'italic' },

  card:           { backgroundColor: '#FFF', borderRadius: 10, padding: 14, gap: 6, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4 },
  cardFila:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitulo:     { flex: 1, fontSize: 15, fontWeight: '700', color: DARK },
  cardFecha:      { fontSize: 11, color: MUTED },
  cardMensaje:    { fontSize: 13, color: MUTED, lineHeight: 18 },
  cardFooter:     { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  cardDestinatarios: { fontSize: 11, color: MUTED },

  // Modal
  modalContainer: { flex: 1, backgroundColor: CREAM },
  modalHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: DIVIDER },
  modalTitulo:    { fontSize: 18, fontStyle: 'italic', fontFamily: 'serif', color: DARK },
  modalCerrar:    { fontSize: 14, color: MUTED },
  modalBody:      { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },
  modalFooter:    { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: DIVIDER },

  inputLabel: { fontSize: 10, letterSpacing: 2, color: GOLD, marginBottom: 6 },
  input:      { borderWidth: 1.5, borderColor: DIVIDER, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: DARK, backgroundColor: '#FFF', marginBottom: 20 },
  inputMultiline: { height: 100, paddingTop: 13 },

  rolRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  rolBtn:            { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 4, borderWidth: 1.5, borderColor: DIVIDER, alignItems: 'center' },
  rolBtnActivo:      { backgroundColor: DARK, borderColor: DARK },
  rolBtnTexto:       { fontSize: 11, color: MUTED, fontWeight: '600', letterSpacing: 0.5 },
  rolBtnTextoActivo: { color: GOLD },

  errorBanner: { backgroundColor: '#FEF2F2', borderLeftWidth: 3, borderLeftColor: ROJO, borderRadius: 4, padding: 12, marginTop: 4 },
  errorTexto:  { fontSize: 13, color: '#991B1B' },

  btnEnviar:      { backgroundColor: DARK, paddingVertical: 16, borderRadius: 4, alignItems: 'center' },
  btnEnviarTexto: { color: GOLD, fontSize: 12, letterSpacing: 2.5, fontWeight: '600' },
})
