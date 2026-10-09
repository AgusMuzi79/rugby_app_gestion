import { useState } from 'react'
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { useNoticiasSubcomision, type NoticiaSubco } from '@/hooks/useNoticiasSubcomision'
import { fonts } from '@/constants/theme'
import { useTheme } from '@/contexts/ThemeContext'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── FilaNoticia ─────────────────────────────────────────────────────────────

function FilaNoticia({ noticia, onEliminar }: { noticia: NoticiaSubco; onEliminar: (n: NoticiaSubco) => void }) {
  const { colors: tc } = useTheme()
  return (
    <View style={s.fila}>
      {noticia.imagenUrl && (
        <Image source={{ uri: noticia.imagenUrl }} style={[s.filaThumb, { backgroundColor: tc.grisClaro }]} />
      )}
      <View style={s.filaInfo}>
        <Text style={[s.filaTitulo, { color: tc.texto }]} numberOfLines={2}>{noticia.titulo}</Text>
        {noticia.cuerpo ? (
          <Text style={[s.filaCuerpo, { color: tc.muted }]} numberOfLines={2}>{noticia.cuerpo}</Text>
        ) : null}
        <Text style={[s.filaFecha, { color: tc.oro }]}>
          {fechaCorta(noticia.created_at)}
          {noticia.etiquetas.length > 0 ? ` · ${noticia.etiquetas.join(', ').toUpperCase()}` : ''}
        </Text>
      </View>
      <TouchableOpacity onPress={() => onEliminar(noticia)} activeOpacity={0.7} style={s.eliminarBtn}>
        <Text style={[s.eliminarBtnTexto, { color: tc.rojoUrgente }]}>✕</Text>
      </TouchableOpacity>
    </View>
  )
}

// ─── ModalNuevaNoticia ───────────────────────────────────────────────────────

interface ModalNuevaNoticiaProps {
  visible:    boolean
  deporte:    string | null
  onClose:    () => void
  onPublicar: (titulo: string, descripcion: string, imagenUri?: string | null) => Promise<boolean>
  publicando: boolean
}

function ModalNuevaNoticia({ visible, deporte, onClose, onPublicar, publicando }: ModalNuevaNoticiaProps) {
  const { colors: tc } = useTheme()
  const insets = useSafeAreaInsets()
  const [titulo, setTitulo]           = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [imagenUri, setImagenUri]     = useState<string | null>(null)

  const puedePublicar = !!titulo.trim() && !publicando

  const elegirImagen = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitás permitir acceso a la galería.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [4, 3] as [number, number],
      quality: 0.8,
    })
    if (result.canceled || !result.assets[0]) return
    setImagenUri(result.assets[0].uri)
  }

  const limpiar = () => { setTitulo(''); setDescripcion(''); setImagenUri(null) }

  const handlePublicar = async () => {
    if (!puedePublicar) return
    const ok = await onPublicar(titulo, descripcion, imagenUri)
    if (ok) { limpiar(); onClose() }
  }

  const handleClose = () => { limpiar(); onClose() }

  const inputStyle = [s.input, { borderColor: tc.grisClaro, color: tc.texto, backgroundColor: tc.card }]

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={[s.flex, { backgroundColor: tc.fondo }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[s.modalHeader, { borderBottomColor: tc.grisClaro, paddingTop: Platform.OS === 'ios' ? 16 : insets.top + 16 }]}>
          <Text style={[s.modalTitulo, { color: tc.texto }]}>Nueva noticia</Text>
          <TouchableOpacity onPress={handleClose} activeOpacity={0.7}>
            <Text style={[s.modalCerrar, { color: tc.muted }]}>Cancelar</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={s.flex} contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
          <Text style={[s.inputLabel, { color: tc.oro }]}>TÍTULO</Text>
          <TextInput
            style={inputStyle}
            placeholder="Ej: Se suspende el entrenamiento del sábado"
            placeholderTextColor={tc.muted}
            value={titulo}
            onChangeText={setTitulo}
            maxLength={120}
          />

          <Text style={[s.inputLabel, { color: tc.oro }]}>DESCRIPCIÓN (OPCIONAL)</Text>
          <TextInput
            style={[inputStyle, s.inputMultiline]}
            placeholder="Contá los detalles…"
            placeholderTextColor={tc.muted}
            value={descripcion}
            onChangeText={setDescripcion}
            multiline
            numberOfLines={5}
          />

          <Text style={[s.inputLabel, { color: tc.oro }]}>IMAGEN (OPCIONAL)</Text>
          {imagenUri ? (
            <View style={s.previewWrap}>
              <Image source={{ uri: imagenUri }} style={[s.preview, { backgroundColor: tc.grisClaro }]} />
              <TouchableOpacity onPress={() => setImagenUri(null)} activeOpacity={0.7} style={s.previewQuitar}>
                <Text style={[s.previewQuitarTexto, { color: tc.rojoUrgente }]}>QUITAR</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={elegirImagen} activeOpacity={0.8} style={[s.botonImagen, { borderColor: tc.grisClaro }]}>
              <Text style={[s.botonImagenTexto, { color: tc.oro }]}>+ AGREGAR IMAGEN</Text>
            </TouchableOpacity>
          )}

          <Text style={[s.aviso, { color: tc.muted }]}>
            Se publica en el momento para todos los socios
            {deporte ? ` (aparece en la sección ${deporte.toUpperCase()})` : ''} y les llega una
            notificación con el título. Si sólo completás el título, funciona como un aviso rápido.
          </Text>
        </ScrollView>

        <View style={[s.modalFooter, { borderTopColor: tc.grisClaro, paddingBottom: 16 + insets.bottom }]}>
          <TouchableOpacity
            style={[s.botonPublicar, { backgroundColor: tc.oro }, !puedePublicar && s.botonOff]}
            onPress={handlePublicar}
            disabled={!puedePublicar}
            activeOpacity={0.85}
          >
            {publicando
              ? <ActivityIndicator color={tc.fondo} size="small" />
              : <Text style={[s.botonPublicarTexto, { color: tc.fondo }]}>PUBLICAR</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function NoticiasSubcomisionScreen() {
  const { colors: tc } = useTheme()
  const insets = useSafeAreaInsets()
  const { noticias, deporte, loading, error, publicando, publicar, eliminar, refetch } = useNoticiasSubcomision()
  const [modalVisible, setModalVisible] = useState(false)

  const confirmarEliminar = (noticia: NoticiaSubco) => {
    Alert.alert('Eliminar noticia', `¿Eliminar "${noticia.titulo}"? Los socios dejan de verla.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => { void eliminar(noticia) } },
    ])
  }

  return (
    <View style={[s.flex, { backgroundColor: tc.fondo, paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={[s.labelHeader, { color: tc.oro }]}>SUBCOMISIÓN</Text>
        <View style={s.headerRow}>
          <Text style={[s.titulo, { color: tc.texto }]}>Noticias</Text>
          <TouchableOpacity
            style={[s.botonNuevo, { backgroundColor: tc.oro }]}
            onPress={() => setModalVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={[s.botonNuevoTexto, { color: tc.fondo }]}>+ Nueva noticia</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[s.divider, { backgroundColor: tc.grisClaro }]} />

      {loading && noticias.length === 0 ? (
        <ActivityIndicator color={tc.oro} size="large" style={s.loader} />
      ) : (
        <FlatList
          data={noticias}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <FilaNoticia noticia={item} onEliminar={confirmarEliminar} />}
          ItemSeparatorComponent={() => <View style={[s.divider, { backgroundColor: tc.grisClaro }]} />}
          contentContainerStyle={noticias.length === 0 ? s.flex : s.listaContent}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Text style={[s.mutedTexto, { color: tc.muted }]}>
                {error ? `No se pudieron cargar las noticias: ${error}` : 'Todavía no hay noticias publicadas.'}
              </Text>
            </View>
          }
          onRefresh={refetch}
          refreshing={loading}
        />
      )}

      <ModalNuevaNoticia
        visible={modalVisible}
        deporte={deporte}
        onClose={() => setModalVisible(false)}
        onPublicar={publicar}
        publicando={publicando}
      />
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  flex:       { flex: 1 },
  loader:     { marginTop: 48 },
  mutedTexto: { fontFamily: fonts.cuerpo, fontSize: 16, fontStyle: 'italic', textAlign: 'center' },

  header:      { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  labelHeader: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2.5, marginBottom: 4 },
  headerRow:   { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  titulo:      { fontFamily: fonts.titulo, fontSize: 32 },
  botonNuevo:  { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 4, marginBottom: 4 },
  botonNuevoTexto: { fontFamily: fonts.label, fontSize: 14, letterSpacing: 1.5, fontWeight: '600' },

  divider:      { height: 1, marginHorizontal: 20 },
  listaContent: { paddingBottom: 16 },
  emptyWrap:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 20 },

  fila:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 12 },
  filaThumb:  { width: 48, height: 48, borderRadius: 4 },
  filaInfo:   { flex: 1 },
  filaTitulo: { fontFamily: fonts.cuerpo, fontSize: 17, fontWeight: '500' },
  filaCuerpo: { fontFamily: fonts.cuerpo, fontSize: 14, marginTop: 2 },
  filaFecha:  { fontFamily: fonts.label, fontSize: 12, marginTop: 4, letterSpacing: 0.5 },

  eliminarBtn:      { padding: 8 },
  eliminarBtnTexto: { fontFamily: fonts.label, fontSize: 16, fontWeight: '700' },

  // Modal
  modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  modalTitulo:  { fontFamily: fonts.titulo, fontSize: 19 },
  modalCerrar:  { fontFamily: fonts.cuerpo, fontSize: 16 },
  modalBody:    { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },
  modalFooter:  { paddingHorizontal: 20, paddingTop: 8, borderTopWidth: 1 },
  inputLabel:   { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, marginBottom: 6 },
  input:        { borderWidth: 1.5, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 13, fontFamily: fonts.cuerpo, fontSize: 17, marginBottom: 20 },
  inputMultiline: { height: 130, textAlignVertical: 'top', paddingTop: 12 },
  aviso:        { fontFamily: fonts.cuerpo, fontSize: 13, marginTop: -8, lineHeight: 18 },
  botonImagen:      { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 6, paddingVertical: 18, alignItems: 'center', marginBottom: 20 },
  botonImagenTexto: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1.5, fontWeight: '600' },
  previewWrap:      { marginBottom: 20 },
  preview:          { width: '100%', aspectRatio: 4 / 3, borderRadius: 6 },
  previewQuitar:    { alignSelf: 'flex-start', marginTop: 8 },
  previewQuitarTexto: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1.5, fontWeight: '600' },
  botonPublicar:      { paddingVertical: 16, borderRadius: 4, alignItems: 'center' },
  botonOff:           { opacity: 0.5 },
  botonPublicarTexto: { fontFamily: fonts.label, fontSize: 14, letterSpacing: 2.5, fontWeight: '700' },
})
