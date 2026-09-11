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
  Alert,
} from 'react-native'
import { usePromosBuffet, type Promo } from '@/hooks/usePromosBuffet'
import { colors, fonts } from '@/constants/theme'

// ─── Tokens ───────────────────────────────────────────────────────────────────

const FONDO   = '#15110A'
const CARD    = '#1C1710'
const TEXTO   = '#F3EFE4'
const MUTED   = '#8E8574'
const DIVIDER = '#2C2418'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── FilaPromo ───────────────────────────────────────────────────────────────

function FilaPromo({ promo, onEliminar }: { promo: Promo; onEliminar: (p: Promo) => void }) {
  return (
    <View style={s.fila}>
      <View style={s.filaInfo}>
        <Text style={s.filaTitulo} numberOfLines={1}>{promo.titulo}</Text>
        <Text style={s.filaCuerpo} numberOfLines={2}>{promo.cuerpo}</Text>
        <Text style={s.filaFecha}>{fechaCorta(promo.created_at)}</Text>
      </View>
      <TouchableOpacity onPress={() => onEliminar(promo)} activeOpacity={0.7} style={s.eliminarBtn}>
        <Text style={s.eliminarBtnTexto}>✕</Text>
      </TouchableOpacity>
    </View>
  )
}

// ─── ModalNuevaPromo ──────────────────────────────────────────────────────────

interface ModalNuevaPromoProps {
  visible:    boolean
  onClose:    () => void
  onPublicar: (titulo: string, cuerpo: string) => Promise<boolean>
  publicando: boolean
}

function ModalNuevaPromo({ visible, onClose, onPublicar, publicando }: ModalNuevaPromoProps) {
  const [titulo, setTitulo] = useState('')
  const [cuerpo, setCuerpo] = useState('')

  const handlePublicar = async () => {
    if (!titulo.trim() || !cuerpo.trim()) return
    const ok = await onPublicar(titulo, cuerpo)
    if (ok) { setTitulo(''); setCuerpo(''); onClose() }
  }

  const handleClose = () => { setTitulo(''); setCuerpo(''); onClose() }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={s.kavFlex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitulo}>Nueva promoción</Text>
            <TouchableOpacity onPress={handleClose} activeOpacity={0.7}>
              <Text style={s.modalCerrar}>Cancelar</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={s.scrollFlex} contentContainerStyle={s.modalBody}>
            <Text style={s.inputLabel}>TÍTULO</Text>
            <TextInput
              style={s.input}
              placeholder="Ej: 2x1 en hamburguesas"
              placeholderTextColor={MUTED}
              value={titulo}
              onChangeText={setTitulo}
            />

            <Text style={s.inputLabel}>DETALLE</Text>
            <TextInput
              style={[s.input, s.inputMultiline]}
              placeholder="Contá la promo, vigencia, condiciones…"
              placeholderTextColor={MUTED}
              value={cuerpo}
              onChangeText={setCuerpo}
              multiline
              numberOfLines={4}
            />

            <Text style={s.aviso}>
              Se publica de una para todos los socios del club.
            </Text>
          </ScrollView>

          <View style={s.modalFooter}>
            <TouchableOpacity
              style={[s.botonGuardar, (!titulo.trim() || !cuerpo.trim() || publicando) && s.botonOff]}
              onPress={handlePublicar}
              disabled={!titulo.trim() || !cuerpo.trim() || publicando}
              activeOpacity={0.85}
            >
              {publicando
                ? <ActivityIndicator color={colors.oro} size="small" />
                : <Text style={s.botonGuardarTexto}>PUBLICAR PROMOCIÓN</Text>
              }
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PromosScreen() {
  const { promos, loading, publicando, publicar, eliminar, refetch } = usePromosBuffet()
  const [modalVisible, setModalVisible] = useState(false)

  const confirmarEliminar = (promo: Promo) => {
    Alert.alert('Eliminar promoción', `¿Eliminar "${promo.titulo}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => eliminar(promo.id) },
    ])
  }

  if (loading) {
    return (
      <SafeAreaView style={s.centrado}>
        <ActivityIndicator color={colors.oro} size="large" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.labelHeader}>BUFFET</Text>
        <View style={s.headerRow}>
          <Text style={s.titulo}>Promociones</Text>
          <TouchableOpacity style={s.botonNuevo} onPress={() => setModalVisible(true)} activeOpacity={0.8}>
            <Text style={s.botonNuevoTexto}>+ Nueva</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.divider} />

      <FlatList
        data={promos}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <FilaPromo promo={item} onEliminar={confirmarEliminar} />}
        ItemSeparatorComponent={() => <View style={s.divider} />}
        contentContainerStyle={promos.length === 0 ? s.listaVacia : s.listaContent}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Text style={s.mutedTexto}>Todavía no publicaste ninguna promoción.</Text>
          </View>
        }
        onRefresh={refetch}
        refreshing={loading}
      />

      <ModalNuevaPromo
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onPublicar={publicar}
        publicando={publicando}
      />
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: FONDO },
  centrado:   { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: FONDO },
  mutedTexto: { fontFamily: fonts.cuerpo, color: MUTED, fontSize: 16, fontStyle: 'italic' },

  header:      { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  labelHeader: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2.5, color: colors.oro, marginBottom: 4 },
  headerRow:   { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  titulo:      { fontFamily: fonts.titulo, fontSize: 32, color: TEXTO },
  botonNuevo:  { backgroundColor: TEXTO, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 4, marginBottom: 4 },
  botonNuevoTexto: { fontFamily: fonts.label, color: colors.oro, fontSize: 14, letterSpacing: 1.5, fontWeight: '600' },

  divider:     { height: 1, backgroundColor: DIVIDER, marginHorizontal: 20 },
  listaVacia:  { flex: 1 },
  listaContent:{ paddingBottom: 16 },
  emptyWrap:   { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },

  fila:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 12 },
  filaInfo:  { flex: 1 },
  filaTitulo:{ fontFamily: fonts.cuerpo, fontSize: 17, color: TEXTO, fontWeight: '500' },
  filaCuerpo:{ fontFamily: fonts.cuerpo, fontSize: 14, color: MUTED, marginTop: 2 },
  filaFecha: { fontFamily: fonts.label, fontSize: 12, color: colors.oro, marginTop: 4, letterSpacing: 0.5 },

  eliminarBtn:      { padding: 8 },
  eliminarBtnTexto: { fontFamily: fonts.label, fontSize: 16, color: colors.rojoUrgente, fontWeight: '700' },

  // Modal
  kavFlex:        { flex: 1 },
  scrollFlex:     { flex: 1 },
  modalContainer: { flex: 1, backgroundColor: FONDO },
  modalHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: DIVIDER },
  modalTitulo:    { fontFamily: fonts.titulo, fontSize: 19, color: TEXTO },
  modalCerrar:    { fontFamily: fonts.cuerpo, fontSize: 16, color: MUTED },
  modalBody:      { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },
  modalFooter:    { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: DIVIDER },
  inputLabel:     { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: colors.oro, marginBottom: 6 },
  input:          { borderWidth: 1.5, borderColor: DIVIDER, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 13, fontFamily: fonts.cuerpo, fontSize: 17, color: TEXTO, backgroundColor: CARD, marginBottom: 20 },
  inputMultiline: { height: 110, textAlignVertical: 'top', paddingTop: 12 },
  aviso:          { fontFamily: fonts.cuerpo, fontSize: 13, color: MUTED, marginTop: -8 },
  botonGuardar:   { backgroundColor: TEXTO, paddingVertical: 16, borderRadius: 4, alignItems: 'center' },
  botonOff:       { opacity: 0.5 },
  botonGuardarTexto: { fontFamily: fonts.label, color: colors.oro, fontSize: 14, letterSpacing: 2.5, fontWeight: '600' },
})
