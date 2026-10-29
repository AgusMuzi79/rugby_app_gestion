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
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useProtocolos, type Protocolo, type FormProtocolo } from '@/hooks/useProtocolos'
import { colors, fonts } from '@/constants/theme'
import { FEATURES } from '@/constants/features'
import { ErrorCarga } from '@/components/shared/ErrorCarga'
import { Redirect } from 'expo-router'

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
  return g === null ? colors.oro : (GRADO_COLOR[g] ?? colors.muted)
}

// Grado 5 (#7F1D1D) no se lee como texto sobre fondo oscuro (1.78:1) ni con
// sobreOro encima: su texto usa rojoTexto / blanco.
function gradoTextoColor(g: number | null): string {
  return g === 5 ? colors.rojoTexto : gradoColor(g)
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
        <View style={s.cardInfoCol}>
          <Text style={s.cardTitulo} numberOfLines={2}>{p.titulo}</Text>
          {p.nombre_archivo && (
            <Text style={s.cardArchivo} numberOfLines={1}>{p.nombre_archivo}</Text>
          )}
          <Text style={s.cardFecha}>{formatFecha(p.created_at)}</Text>
        </View>

        <View style={s.cardBtns}>
          <TouchableOpacity
            style={[s.btnAbrir, esAbriendo && s.btnAbrindo]}
            onPress={() => onAbrir(p)}
            disabled={esAbriendo}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={`Abrir ${p.titulo}`}
            accessibilityState={{ disabled: esAbriendo, busy: esAbriendo }}
          >
            {esAbriendo
              ? <ActivityIndicator size="small" color={colors.oro} />
              : <Ionicons name="open-outline" size={18} color={colors.oro} />
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={s.btnEliminar}
            onPress={confirmarEliminar}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={`Eliminar ${p.titulo}`}
          >
            <Ionicons name="trash-outline" size={18} color={colors.rojoUrgente} />
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
      <KeyboardAvoidingView style={s.modalKav} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitulo}>Subir protocolo</Text>
            <TouchableOpacity
              onPress={onClose}
              disabled={subiendo}
              activeOpacity={0.7}
              style={s.cancelarBtn}
              accessibilityRole="button"
              accessibilityLabel="Cancelar"
            >
              <Text style={s.modalCerrar}>Cancelar</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={s.modalScroll} contentContainerStyle={s.modalBody}>
            <Text style={s.inputLabel}>TÍTULO</Text>
            <TextInput
              style={s.input}
              placeholder="ej. Protocolo de lesión de hombro"
              placeholderTextColor={colors.muted}
              value={form.titulo}
              onChangeText={v => setForm({ ...form, titulo: v })}
              returnKeyType="done"
              maxLength={100}
            />

            <Text style={s.inputLabel}>GRADO ASOCIADO (opcional)</Text>
            <Text style={s.inputSub}>Dejá vacío para un protocolo general.</Text>
            <View style={s.gradoRow} accessibilityRole="radiogroup" accessibilityLabel="Grado asociado">
              <TouchableOpacity
                style={[s.gradoBtn, form.grado === null && s.gradoBtnActivo]}
                onPress={() => setForm({ ...form, grado: null })}
                activeOpacity={0.8}
                accessibilityRole="radio"
                accessibilityState={{ selected: form.grado === null }}
                accessibilityLabel="General"
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
                  accessibilityRole="radio"
                  accessibilityState={{ selected: form.grado === g }}
                  accessibilityLabel={`Grado ${g}`}
                >
                  <Text style={[s.gradoBtnTexto, form.grado === g && (g === 5 ? s.gradoBtnTextoClaro : s.gradoBtnTextoActivo)]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.archivoInfo}>
              <Ionicons name="document-attach-outline" size={18} color={colors.muted} />
              <Text style={s.archivoInfoTexto}>
                Al guardar se abrirá el selector de archivos.{'\n'}PDF o imagen (máx. 50 MB).
              </Text>
            </View>

            {error && (
              <View style={s.errorBanner} accessibilityRole="alert" accessibilityLiveRegion="polite">
                <Text style={s.errorTexto}>{error}</Text>
              </View>
            )}
          </ScrollView>

          <View style={s.modalFooter}>
            <TouchableOpacity
              style={[s.btnGuardar, subiendo && s.btnGuardarDisabled]}
              onPress={onSubir}
              disabled={subiendo}
              activeOpacity={0.85}
            >
              {subiendo ? (
                <ActivityIndicator color={colors.sobreOro} size="small" />
              ) : (
                <View style={s.btnGuardarInner}>
                  <Ionicons name="cloud-upload-outline" size={14} color={colors.sobreOro} />
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

// Módulo oculto (FEATURES.lesiones): un deep link vuelve al Inicio. La
// pantalla y el contenido de los protocolos quedan para cuando se reactive.
export default function ProtocolosRoute() {
  if (!FEATURES.lesiones) return <Redirect href="/(subcomision)/diario" />
  return <ProtocolosScreen />
}

function ProtocolosScreen() {
  const insets = useSafeAreaInsets()
  const {
    loading,
    errorCarga,
    recargar,
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
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
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
          <ActivityIndicator size="large" color={colors.oro} />
        </View>
      ) : errorCarga ? (
        <ErrorCarga mensaje={errorCarga} onReintentar={recargar} />
      ) : protocolos.length === 0 ? (
        <View style={s.centrado}>
          <Ionicons name="document-text-outline" size={40} color={colors.muted} />
          <Text style={s.vacioTexto}>Sin protocolos cargados.</Text>
          <Text style={s.vacioSub}>Usá "+ Subir" para agregar el primero.</Text>
        </View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.listaContent}
          showsVerticalScrollIndicator={false}
        >
          {grupos.map(({ grado, items }) => (
            <View key={String(grado)}>
              <View style={s.grupoHeader}>
                <View style={[s.gradoBadge, { borderColor: gradoColor(grado) }]}>
                  <Text style={[s.gradoBadgeTexto, { color: gradoTextoColor(grado) }]}>
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
  root:    { flex: 1, backgroundColor: colors.fondo },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  scroll:   { flex: 1 },

  header:          { paddingHorizontal: 20, paddingBottom: 14, backgroundColor: colors.tinta },
  headerLabel:     { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2.5, color: colors.oroSobreClaro, marginBottom: 4 },
  headerFila:      { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  headerTitulo:    { fontFamily: fonts.titulo, fontSize: 28, color: colors.sobreOro },
  headerSub:       { fontFamily: fonts.cuerpo, fontSize: 14, color: colors.sobreOro, marginTop: 4 },
  botonNuevo:      { minHeight: 44, justifyContent: 'center', backgroundColor: colors.oro, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 4, marginBottom: 4 },
  botonNuevoTexto: { fontFamily: fonts.label, color: colors.sobreOro, fontSize: 14, letterSpacing: 1.5, fontWeight: '700' },

  listaContent: { padding: 16, paddingBottom: 40, gap: 12 },

  vacioTexto: { fontFamily: fonts.cuerpo, fontSize: 17, color: colors.muted, fontWeight: '600' },
  vacioSub:   { fontFamily: fonts.cuerpo, fontSize: 15, color: colors.muted, fontStyle: 'italic' },

  grupoHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  gradoBadge:     { borderWidth: 1.5, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 3 },
  gradoBadgeTexto:{ fontFamily: fonts.label, fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  grupoConteo:    { fontFamily: fonts.cuerpo, fontSize: 14, color: colors.muted },

  card:     { backgroundColor: colors.card, borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.borde },
  cardFila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardInfoCol: { flex: 1, gap: 2 },
  cardTitulo:  { fontFamily: fonts.cuerpo, fontSize: 16, fontWeight: '700', color: colors.texto },
  cardArchivo: { fontFamily: fonts.cuerpo, fontSize: 14, color: colors.muted },
  cardFecha:   { fontFamily: fonts.cuerpo, fontSize: 13, color: colors.muted, marginTop: 2 },
  cardBtns:    { flexDirection: 'row', alignItems: 'center', gap: 8 },

  btnAbrir:    { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 6, backgroundColor: colors.borde },
  btnAbrindo:  { opacity: 0.6 },
  btnEliminar: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 6, backgroundColor: '#2C1010' },

  // Modal
  modalKav:       { flex: 1 },
  modalContainer: { flex: 1, backgroundColor: colors.fondo },
  modalHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.borde },
  modalTitulo:    { fontFamily: fonts.titulo, fontSize: 19, color: colors.texto },
  modalCerrar:    { fontFamily: fonts.cuerpo, fontSize: 16, color: colors.muted },
  cancelarBtn:    { minHeight: 44, justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 8, marginRight: -8 },
  modalScroll:    { flex: 1 },
  modalBody:      { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },
  modalFooter:    { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.borde },

  inputLabel: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: colors.oro, marginBottom: 6 },
  inputSub:   { fontFamily: fonts.cuerpo, fontSize: 14, color: colors.muted, marginBottom: 10, marginTop: -2 },
  input:      { borderWidth: 1.5, borderColor: colors.borde, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 13, fontFamily: fonts.cuerpo, fontSize: 17, color: colors.texto, backgroundColor: colors.card, marginBottom: 20 },

  gradoRow:            { flexDirection: 'row', gap: 8, marginBottom: 24 },
  gradoBtn:            { flex: 1, minHeight: 44, justifyContent: 'center', paddingVertical: 10, borderRadius: 4, borderWidth: 1.5, borderColor: colors.borde, alignItems: 'center' },
  gradoBtnActivo:      { backgroundColor: colors.oro, borderColor: colors.oro },
  gradoBtnTexto:       { fontFamily: fonts.label, fontSize: 14, color: colors.muted, fontWeight: '700' },
  gradoBtnTextoActivo: { color: colors.sobreOro },
  gradoBtnTextoClaro:  { color: colors.blanco },

  archivoInfo:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: colors.card, borderRadius: 8, padding: 14, marginBottom: 20 },
  archivoInfoTexto: { flex: 1, fontFamily: fonts.cuerpo, fontSize: 15, color: colors.muted, lineHeight: 20 },

  errorBanner: { backgroundColor: '#3A1010', borderLeftWidth: 3, borderLeftColor: colors.rojoUrgente, borderRadius: 4, padding: 12 },
  errorTexto:  { fontFamily: fonts.cuerpo, fontSize: 15, color: '#FFAAAA' },

  btnGuardar:        { backgroundColor: colors.oro, paddingVertical: 16, borderRadius: 4, alignItems: 'center' },
  btnGuardarDisabled:{ opacity: 0.6 },
  btnGuardarInner:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnGuardarTexto:   { fontFamily: fonts.label, color: colors.sobreOro, fontSize: 14, letterSpacing: 2, fontWeight: '600' },
})
