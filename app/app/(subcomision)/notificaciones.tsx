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
  type AudienciaNoticia,
  type NotifForm,
} from '@/hooks/useNotificaciones'
import { colors, fonts } from '@/constants/theme'

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
        <Ionicons name="people-outline" size={13} color={'#8E8574'} style={s.cardFooterIcon} />
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
  const audiencias: { value: AudienciaNoticia; label: string }[] = [
    { value: 'todos',          label: 'TODOS' },
    { value: 'cuerpo_tecnico', label: 'CUERPO TÉCNICO' },
  ]

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.modalKav} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitulo}>Nueva notificación</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Text style={s.modalCerrar}>Cancelar</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={s.modalScroll} contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={s.inputLabel}>TÍTULO</Text>
            <TextInput
              style={s.input}
              placeholder="ej. Reunión de coordinación"
              placeholderTextColor={'#8E8574'}
              value={form.titulo}
              onChangeText={v => setForm({ ...form, titulo: v })}
              returnKeyType="next"
              maxLength={80}
            />

            <Text style={s.inputLabel}>MENSAJE</Text>
            <TextInput
              style={[s.input, s.inputMultiline]}
              placeholder="Escribí el contenido de la notificación…"
              placeholderTextColor={'#8E8574'}
              value={form.mensaje}
              onChangeText={v => setForm({ ...form, mensaje: v })}
              multiline
              numberOfLines={4}
              returnKeyType="default"
              textAlignVertical="top"
            />

            <Text style={s.inputLabel}>DESTINATARIOS (PUSH)</Text>
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

            <Text style={s.inputLabel}>VISIBILIDAD EN EL FEED</Text>
            <View style={s.rolRow}>
              {audiencias.map(a => (
                <TouchableOpacity
                  key={a.value}
                  style={[s.rolBtn, form.audiencia === a.value && s.rolBtnActivo]}
                  onPress={() => setForm({ ...form, audiencia: a.value })}
                  activeOpacity={0.8}
                >
                  <Text style={[s.rolBtnTexto, form.audiencia === a.value && s.rolBtnTextoActivo]}>
                    {a.label}
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
              style={[s.btnEnviar, enviando && s.btnEnviarDisabled]}
              onPress={onEnviar}
              disabled={enviando}
              activeOpacity={0.85}
            >
              {enviando ? (
                <ActivityIndicator color={colors.oro} size="small" />
              ) : (
                <View style={s.btnEnviarInner}>
                  <Ionicons name="send-outline" size={14} color={colors.oro} />
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

  async function handleEnviar() {
    const ok = await enviarNotificacion()
    if (ok) cerrarModal()
  }

  return (
    <View style={s.root}>
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
          <ActivityIndicator size="large" color={colors.oro} />
        </View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.listaContent}
          showsVerticalScrollIndicator={false}
        >
          {historial.length === 0 ? (
            <View style={s.vacio}>
              <Ionicons name="notifications-off-outline" size={40} color={'#8E8574'} />
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
  root:    { flex: 1, backgroundColor: '#15110A' },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll:   { flex: 1 },

  header:          { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 14, backgroundColor: colors.tinta },
  headerLabel:     { fontFamily: fonts.label, fontSize: 10, letterSpacing: 2.5, color: colors.oro, marginBottom: 4 },
  headerFila:      { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  headerTitulo:    { fontFamily: fonts.titulo, fontSize: 28, color: colors.blanco },
  headerSub:       { fontFamily: fonts.cuerpo, fontSize: 12, color: '#8E8574', marginTop: 4 },
  botonNuevo:      { backgroundColor: colors.oro, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 4, marginBottom: 4 },
  botonNuevoTexto: { fontFamily: fonts.label, color: colors.tinta, fontSize: 12, letterSpacing: 1.5, fontWeight: '700' },

  listaContent: { padding: 16, paddingBottom: 40, gap: 10 },
  seccionLabel: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 2, color: colors.oro, textTransform: 'uppercase', marginBottom: 4 },

  vacio:     { alignItems: 'center', paddingTop: 80, gap: 12 },
  vacioTexto: { fontFamily: fonts.cuerpo, fontSize: 15, color: '#8E8574', fontWeight: '600' },
  vacioSub:   { fontFamily: fonts.cuerpo, fontSize: 13, color: '#8E8574', fontStyle: 'italic' },

  card:           { backgroundColor: '#1C1710', borderRadius: 10, padding: 14, gap: 6, borderWidth: 1, borderColor: '#2C2418' },
  cardFila:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitulo:     { flex: 1, fontFamily: fonts.cuerpo, fontSize: 15, fontWeight: '700', color: colors.tinta },
  cardFecha:      { fontFamily: fonts.cuerpo, fontSize: 11, color: '#8E8574' },
  cardMensaje:    { fontFamily: fonts.cuerpo, fontSize: 13, color: '#8E8574', lineHeight: 18 },
  cardFooter:     { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  cardFooterIcon: { marginRight: 4 },
  cardDestinatarios: { fontFamily: fonts.cuerpo, fontSize: 11, color: '#8E8574' },

  // Modal
  modalKav:       { flex: 1 },
  modalContainer: { flex: 1, backgroundColor: '#15110A' },
  modalHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#2C2418' },
  modalTitulo:    { fontFamily: fonts.titulo, fontSize: 18, color: colors.tinta },
  modalCerrar:    { fontFamily: fonts.cuerpo, fontSize: 14, color: '#8E8574' },
  modalScroll:    { flex: 1 },
  modalBody:      { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },
  modalFooter:    { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#2C2418' },

  inputLabel: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 2, color: colors.oro, marginBottom: 6 },
  input:      { borderWidth: 1.5, borderColor: '#2C2418', borderRadius: 6, paddingHorizontal: 14, paddingVertical: 13, fontFamily: fonts.cuerpo, fontSize: 15, color: colors.tinta, backgroundColor: '#1C1710', marginBottom: 20 },
  inputMultiline: { height: 100, paddingTop: 13 },

  rolRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  rolBtn:            { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 4, borderWidth: 1.5, borderColor: '#2C2418', alignItems: 'center' },
  rolBtnActivo:      { backgroundColor: colors.tinta, borderColor: colors.tinta },
  rolBtnTexto:       { fontFamily: fonts.label, fontSize: 11, color: '#8E8574', fontWeight: '600', letterSpacing: 0.5 },
  rolBtnTextoActivo: { color: colors.oro },

  errorBanner: { backgroundColor: '#3A1010', borderLeftWidth: 3, borderLeftColor: colors.rojoUrgente, borderRadius: 4, padding: 12, marginTop: 4 },
  errorTexto:  { fontFamily: fonts.cuerpo, fontSize: 13, color: '#FFAAAA' },

  btnEnviar:         { backgroundColor: colors.tinta, paddingVertical: 16, borderRadius: 4, alignItems: 'center' },
  btnEnviarDisabled: { opacity: 0.6 },
  btnEnviarInner:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnEnviarTexto:    { fontFamily: fonts.label, color: colors.oro, fontSize: 12, letterSpacing: 2.5, fontWeight: '600' },
})
