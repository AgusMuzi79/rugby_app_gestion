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
import { useProtocolos, type Protocolo, type FormProtocolo } from '@/hooks/useProtocolos'

const CREAM   = '#F5F0E8'
const GOLD    = '#C9A84C'
const DARK    = '#1A1A1A'
const MUTED   = '#888888'
const DIVIDER = '#E5DDD0'
const ROJO    = '#EF4444'

const GRADO_COLOR: Record<number, string> = {
  1: '#22C55E',
  2: '#EAB308',
  3: '#F97316',
  4: '#EF4444',
  5: '#7F1D1D',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function gradoLabel(g: number | null): string {
  return g === null ? 'General' : `Grado ${g}`
}

function gradoColor(g: number | null): string {
  return g === null ? GOLD : (GRADO_COLOR[g] ?? MUTED)
}

function formatFecha(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function agruparPorGrado(list: Protocolo[]): Array<{ grado: number | null; items: Protocolo[] }> {
  const map = new Map<number | null, Protocolo[]>()
  for (const p of list) {
    const key = p.grado_asociado
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(p)
  }
  // null first, then 1-5
  const keys = Array.from(map.keys()).sort((a, b) => {
    if (a === null) return -1
    if (b === null) return 1
    return a - b
  })
  return keys.map(k => ({ grado: k, items: map.get(k)! }))
}

// ─── ProtocoloCard ────────────────────────────────────────────────────────────

function ProtocoloCard({
  p,
  abriendo,
  onAbrir,
  onEliminar,
}: {
  p:          Protocolo
  abriendo:   string | null
  onAbrir:    (p: Protocolo) => void
  onEliminar: (p: Protocolo) => void
}) {
  const esAbriendo = abriendo === p.id

  function confirmarEliminar() {
    Alert.alert(
      'Eliminar protocolo',
      `¿Eliminar "${p.titulo}"? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => onEliminar(p) },
      ],
    )
  }

  return (
    <View style={s.card}>
      <View style={s.cardFila}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.cardTitulo} numberOfLines={2}>{p.titulo}</Text>
          {p.nombre_archivo && (
            <Text style={s.cardArchivo} numberOfLines={1}>{p.nombre_archivo}</Text>
          )}
          <Text style={s.cardFecha}>{formatFecha(p.created_at)}</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            style={[s.btnAbrir, esAbriendo && { opacity: 0.6 }]}
            onPress={() => onAbrir(p)}
            disabled={esAbriendo}
            activeOpacity={0.75}
          >
            {esAbriendo
              ? <ActivityIndicator size="small" color={GOLD} />
              : <Ionicons name="open-outline" size={18} color={GOLD} />
            }
          </TouchableOpacity>

          <TouchableOpacity style={s.btnEliminar} onPress={confirmarEliminar} activeOpacity={0.75}>
            <Ionicons name="trash-outline" size={18} color={ROJO} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

// ─── Modal subir protocolo ────────────────────────────────────────────────────

function ModalSubirProtocolo({
  visible,
  onClose,
  onSubir,
  form,
  setForm,
  subiendo,
  error,
}: {
  visible:   boolean
  onClose:   () => void
  onSubir:   () => Promise<void>
  form:      FormProtocolo
  setForm:   (f: FormProtocolo) => void
  subiendo:  boolean
  error:     string | null
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitulo}>Subir protocolo</Text>
            <TouchableOpacity onPress={onClose} disabled={subiendo} activeOpacity={0.7}>
              <Text style={s.modalCerrar}>Cancelar</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.modalBody}>
            <Text style={s.inputLabel}>TÍTULO</Text>
            <TextInput
              style={s.input}
              placeholder="ej. Protocolo de lesión de hombro"
              placeholderTextColor={MUTED}
              value={form.titulo}
              onChangeText={v => setForm({ ...form, titulo: v })}
              returnKeyType="done"
              maxLength={100}
            />

            <Text style={s.inputLabel}>GRADO ASOCIADO (opcional)</Text>
            <Text style={s.inputSub}>Dejá vacío para un protocolo general.</Text>
            <View style={s.gradoRow}>
              <TouchableOpacity
                style={[s.gradoBtn, form.grado === null && s.gradoBtnActivo]}
                onPress={() => setForm({ ...form, grado: null })}
                activeOpacity={0.8}
              >
                <Text style={[s.gradoBtnTexto, form.grado === null && s.gradoBtnTextoActivo]}>GEN</Text>
              </TouchableOpacity>
              {[1, 2, 3, 4, 5].map(g => (
                <TouchableOpacity
                  key={g}
                  style={[
                    s.gradoBtn,
                    form.grado === g && { backgroundColor: GRADO_COLOR[g], borderColor: GRADO_COLOR[g] },
                  ]}
                  onPress={() => setForm({ ...form, grado: g })}
                  activeOpacity={0.8}
                >
                  <Text style={[s.gradoBtnTexto, form.grado === g && { color: '#FFF' }]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.archivoInfo}>
              <Ionicons name="document-attach-outline" size={18} color={MUTED} />
              <Text style={s.archivoInfoTexto}>
                Al guardar se abrirá el selector de archivos.{'\n'}PDF o imagen (máx. 50 MB).
              </Text>
            </View>

            {error && (
              <View style={s.errorBanner}>
                <Text style={s.errorTexto}>{error}</Text>
              </View>
            )}
          </ScrollView>

          <View style={s.modalFooter}>
            <TouchableOpacity
              style={[s.btnGuardar, subiendo && { opacity: 0.6 }]}
              onPress={onSubir}
              disabled={subiendo}
              activeOpacity={0.85}
            >
              {subiendo ? (
                <ActivityIndicator color={GOLD} size="small" />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="cloud-upload-outline" size={14} color={GOLD} />
                  <Text style={s.btnGuardarTexto}>SELECCIONAR ARCHIVO Y SUBIR</Text>
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

export default function ProtocolosScreen() {
  const {
    loading,
    protocolos,
    modalVisible,
    abrirModal,
    cerrarModal,
    form,
    setForm,
    subiendo,
    errorSubida,
    subirProtocolo,
    abriendo,
    abrirProtocolo,
    eliminarProtocolo,
  } = useProtocolos()

  async function handleSubir() {
    const ok = await subirProtocolo()
    if (ok) cerrarModal()
  }

  const grupos = agruparPorGrado(protocolos)

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Text style={s.headerLabel}>SUBCOMISIÓN</Text>
        <View style={s.headerFila}>
          <Text style={s.headerTitulo}>Protocolos</Text>
          <TouchableOpacity style={s.botonNuevo} onPress={abrirModal} activeOpacity={0.8}>
            <Text style={s.botonNuevoTexto}>+ Subir</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.headerSub}>
          {protocolos.length} protocolo{protocolos.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {loading ? (
        <View style={s.centrado}>
          <ActivityIndicator size="large" color={GOLD} />
        </View>
      ) : protocolos.length === 0 ? (
        <View style={s.centrado}>
          <Ionicons name="document-text-outline" size={40} color={MUTED} />
          <Text style={s.vacioTexto}>Sin protocolos cargados.</Text>
          <Text style={s.vacioSub}>Usá "+ Subir" para agregar el primero.</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.listaContent}
          showsVerticalScrollIndicator={false}
        >
          {grupos.map(({ grado, items }) => (
            <View key={String(grado)}>
              <View style={s.grupoHeader}>
                <View style={[s.gradoBadge, { borderColor: gradoColor(grado) }]}>
                  <Text style={[s.gradoBadgeTexto, { color: gradoColor(grado) }]}>
                    {gradoLabel(grado).toUpperCase()}
                  </Text>
                </View>
                <Text style={s.grupoConteo}>{items.length}</Text>
              </View>
              {items.map(p => (
                <ProtocoloCard
                  key={p.id}
                  p={p}
                  abriendo={abriendo}
                  onAbrir={abrirProtocolo}
                  onEliminar={eliminarProtocolo}
                />
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      <ModalSubirProtocolo
        visible={modalVisible}
        onClose={cerrarModal}
        onSubir={handleSubir}
        form={form}
        setForm={setForm}
        subiendo={subiendo}
        error={errorSubida}
      />
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: CREAM },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: CREAM, gap: 12 },

  header:          { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 14, backgroundColor: DARK },
  headerLabel:     { fontSize: 10, letterSpacing: 2.5, color: GOLD, marginBottom: 4 },
  headerFila:      { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  headerTitulo:    { fontSize: 28, fontStyle: 'italic', fontFamily: 'serif', color: '#FFF' },
  headerSub:       { fontSize: 12, color: '#888', marginTop: 4 },
  botonNuevo:      { backgroundColor: GOLD, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 4, marginBottom: 4 },
  botonNuevoTexto: { color: DARK, fontSize: 12, letterSpacing: 1.5, fontWeight: '700' },

  listaContent: { padding: 16, paddingBottom: 40, gap: 12 },

  vacioTexto: { fontSize: 15, color: MUTED, fontWeight: '600' },
  vacioSub:   { fontSize: 13, color: MUTED, fontStyle: 'italic' },

  grupoHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  gradoBadge:     { borderWidth: 1.5, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 3 },
  gradoBadgeTexto:{ fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  grupoConteo:    { fontSize: 12, color: MUTED },

  card:     { backgroundColor: '#FFF', borderRadius: 10, padding: 14, marginBottom: 8, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4 },
  cardFila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTitulo:  { fontSize: 14, fontWeight: '700', color: DARK },
  cardArchivo: { fontSize: 12, color: MUTED },
  cardFecha:   { fontSize: 11, color: MUTED, marginTop: 2 },

  btnAbrir:    { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', borderRadius: 6, backgroundColor: '#FBF6EA' },
  btnEliminar: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', borderRadius: 6, backgroundColor: '#FEF2F2' },

  // Modal
  modalContainer: { flex: 1, backgroundColor: CREAM },
  modalHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: DIVIDER },
  modalTitulo:    { fontSize: 18, fontStyle: 'italic', fontFamily: 'serif', color: DARK },
  modalCerrar:    { fontSize: 14, color: MUTED },
  modalBody:      { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },
  modalFooter:    { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: DIVIDER },

  inputLabel: { fontSize: 10, letterSpacing: 2, color: GOLD, marginBottom: 6 },
  inputSub:   { fontSize: 12, color: MUTED, marginBottom: 10, marginTop: -2 },
  input:      { borderWidth: 1.5, borderColor: DIVIDER, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: DARK, backgroundColor: '#FFF', marginBottom: 20 },

  gradoRow:            { flexDirection: 'row', gap: 8, marginBottom: 24 },
  gradoBtn:            { flex: 1, paddingVertical: 10, borderRadius: 4, borderWidth: 1.5, borderColor: DIVIDER, alignItems: 'center' },
  gradoBtnActivo:      { backgroundColor: DARK, borderColor: DARK },
  gradoBtnTexto:       { fontSize: 12, color: MUTED, fontWeight: '700' },
  gradoBtnTextoActivo: { color: GOLD },

  archivoInfo:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#F9F6EF', borderRadius: 8, padding: 14, marginBottom: 20 },
  archivoInfoTexto: { flex: 1, fontSize: 13, color: MUTED, lineHeight: 20 },

  errorBanner: { backgroundColor: '#FEF2F2', borderLeftWidth: 3, borderLeftColor: ROJO, borderRadius: 4, padding: 12 },
  errorTexto:  { fontSize: 13, color: '#991B1B' },

  btnGuardar:      { backgroundColor: DARK, paddingVertical: 16, borderRadius: 4, alignItems: 'center' },
  btnGuardarTexto: { color: GOLD, fontSize: 12, letterSpacing: 2, fontWeight: '600' },
})
