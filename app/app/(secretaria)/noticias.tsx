import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  TouchableOpacity, Modal, TextInput, Alert, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useState, useRef } from 'react'
import { useScrollToTop } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { Header } from '@/components/shared/Header'
import { useNoticias, type Noticia } from '@/hooks/useNoticias'
import { colors, fonts } from '@/constants/theme'
import { useTheme } from '@/contexts/ThemeContext'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tiempoRelativo(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime()
  const days  = Math.floor(diff / 86400000)
  const hours = Math.floor(diff / 3600000)
  if (days  > 0) return `HACE ${days}D`
  if (hours > 0) return `HACE ${hours}H`
  return 'HOY'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NoticiaRow({
  noticia,
  onToggle,
  onEliminar,
}: {
  noticia:   Noticia
  onToggle:  (id: string, val: boolean) => void
  onEliminar:(id: string) => void
}) {
  const { colors: tc } = useTheme()

  const confirmEliminar = () => {
    Alert.alert('Eliminar noticia', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => onEliminar(noticia.id) },
    ])
  }

  return (
    <View style={[s.row, { borderBottomColor: tc.grisClaro }]}>
      <View style={s.rowLeft}>
        <View style={[s.badge, { backgroundColor: noticia.publicada ? '#1A7A1A' : '#555555' }]}>
          <Text style={s.badgeText}>{noticia.publicada ? 'PUBLICADA' : 'BORRADOR'}</Text>
        </View>
        <Text style={[s.rowTitulo, { color: tc.texto }]} numberOfLines={2}>
          {noticia.titulo}
        </Text>
        <Text style={[s.rowMeta, { color: tc.muted }]}>
          {tiempoRelativo(noticia.created_at)} · {noticia.autor}
        </Text>
      </View>

      <View style={s.rowActions}>
        <TouchableOpacity
          style={[s.actionBtn, { borderColor: tc.grisClaro }]}
          onPress={() => onToggle(noticia.id, !noticia.publicada)}
          activeOpacity={0.75}
        >
          <Feather name={noticia.publicada ? 'eye-off' : 'eye'} size={14} color={noticia.publicada ? tc.muted : colors.oro} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.actionBtn, { borderColor: tc.grisClaro }]}
          onPress={confirmEliminar}
          activeOpacity={0.75}
        >
          <Feather name="trash-2" size={14} color={colors.rojoUrgente} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ─── Modal de creación ────────────────────────────────────────────────────────

const DEPORTES = ['rugby', 'hockey', 'tenis'] as const
type Deporte = typeof DEPORTES[number]

function ModalNuevaNoticia({
  visible,
  guardando,
  onClose,
  onCreate,
}: {
  visible:   boolean
  guardando: boolean
  onClose:   () => void
  onCreate:  (titulo: string, cuerpo: string, etiquetas: string[]) => void
}) {
  const { colors: tc } = useTheme()
  const [titulo, setTitulo]   = useState('')
  const [cuerpo, setCuerpo]   = useState('')
  const [deporte, setDeporte] = useState<Deporte | null>(null)

  const handleCrear = () => {
    if (!titulo.trim()) { Alert.alert('Campo requerido', 'El título es obligatorio.'); return }
    if (!cuerpo.trim()) { Alert.alert('Campo requerido', 'El contenido es obligatorio.'); return }
    onCreate(titulo.trim(), cuerpo.trim(), deporte ? [deporte] : [])
  }

  const handleClose = () => {
    setTitulo('')
    setCuerpo('')
    setDeporte(null)
    onClose()
  }

  const border = tc.grisClaro

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={s.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={[s.modal, { backgroundColor: tc.card }]}
          contentContainerStyle={s.modalContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.modalHeader}>
            <Text style={[s.modalTitle, { color: tc.texto }]}>NUEVA NOTICIA</Text>
            <TouchableOpacity onPress={handleClose} activeOpacity={0.75}>
              <Feather name="x" size={20} color={tc.texto} />
            </TouchableOpacity>
          </View>

          <Text style={[s.inputLabel, { color: tc.muted }]}>TÍTULO</Text>
          <TextInput
            style={[s.input, { color: tc.texto, borderBottomColor: colors.oro }]}
            value={titulo}
            onChangeText={setTitulo}
            placeholder="Título de la noticia"
            placeholderTextColor={tc.muted}
          />

          <Text style={[s.inputLabel, { color: tc.muted, marginTop: 16 }]}>CONTENIDO</Text>
          <TextInput
            style={[s.inputMulti, { color: tc.texto, borderColor: border }]}
            value={cuerpo}
            onChangeText={setCuerpo}
            placeholder="Escribí el contenido aquí…"
            placeholderTextColor={tc.muted}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />

          <Text style={[s.inputLabel, { color: tc.muted, marginTop: 16 }]}>DEPORTE</Text>
          <View style={s.deporteRow}>
            {DEPORTES.map(d => {
              const activo = deporte === d
              return (
                <TouchableOpacity
                  key={d}
                  style={[
                    s.deporteChip,
                    activo
                      ? { backgroundColor: colors.tinta, borderColor: colors.tinta }
                      : { backgroundColor: 'transparent', borderColor: border },
                  ]}
                  onPress={() => setDeporte(prev => prev === d ? null : d)}
                  activeOpacity={0.75}
                >
                  <Text style={[
                    s.deporteChipText,
                    { color: activo ? colors.oro : tc.muted },
                  ]}>
                    {d.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
          <Text style={[s.draftNote, { color: tc.muted }]}>
            Opcional. Permite a los socios filtrar por deporte.
          </Text>

          <Text style={[s.draftNote, { color: tc.muted, marginTop: 8 }]}>
            Se guardará como borrador. Podés publicarla luego.
          </Text>

          <TouchableOpacity
            style={[s.crearBtn, guardando && s.crearBtnDisabled]}
            onPress={handleCrear}
            disabled={guardando}
            activeOpacity={0.8}
          >
            {guardando ? (
              <ActivityIndicator color={colors.oro} />
            ) : (
              <Text style={s.crearBtnText}>GUARDAR BORRADOR</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function NoticiasSecretariaScreen() {
  const insets         = useSafeAreaInsets()
  const scrollRef = useRef<FlatList>(null)
  useScrollToTop(scrollRef)
  const { colors: tc } = useTheme()
  const { noticias, loading, guardando, crear, togglePublicar, eliminar, refetch } = useNoticias(false)
  const [modalVisible, setModalVisible] = useState(false)

  const handleCrear = async (titulo: string, cuerpo: string, etiquetas: string[]) => {
    const ok = await crear({ titulo, cuerpo, etiquetas })
    if (ok) setModalVisible(false)
  }

  return (
    <View style={[s.root, { backgroundColor: tc.fondo }]}>
      <View style={{ paddingTop: insets.top }}>
        <Header />
        <View style={s.edicionBar}>
          <Text style={s.edicionLabel}>SECRETARÍA · NOTICIAS</Text>
          <Text style={s.edicionFecha}>
            {noticias.filter(n => n.publicada).length} PUBLICADAS
          </Text>
        </View>
        <View style={s.secRow}>
          <Text style={s.secTitle}>TODAS LAS NOTICIAS</Text>
          <View style={[s.secLine, { backgroundColor: tc.grisClaro }]} />
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.oro} style={{ marginTop: 40 }} />
      ) : noticias.length === 0 ? (
        <View style={s.emptyContainer}>
          <Text style={[s.emptyText, { color: tc.muted }]}>No hay noticias creadas aún.</Text>
        </View>
      ) : (
        <FlatList
          ref={scrollRef}
          data={noticias}
          keyExtractor={n => n.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
          renderItem={({ item }) => (
            <NoticiaRow
              noticia={item}
              onToggle={togglePublicar}
              onEliminar={eliminar}
            />
          )}
          onRefresh={refetch}
          refreshing={loading}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={s.fab}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.85}
      >
        <Feather name="plus" size={22} color={colors.tinta} />
      </TouchableOpacity>

      <ModalNuevaNoticia
        visible={modalVisible}
        guardando={guardando}
        onClose={() => setModalVisible(false)}
        onCreate={handleCrear}
      />
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  edicionBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.tinta,
  },
  edicionLabel: {
    fontFamily: fonts.label, fontSize: 9, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.oro,
  },
  edicionFecha: {
    fontFamily: fonts.label, fontSize: 9, letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.grisClaro,
  },

  secRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, gap: 10,
  },
  secTitle: {
    fontFamily: fonts.label, fontSize: 9, letterSpacing: 2.5,
    textTransform: 'uppercase', color: colors.oroHondo,
  },
  secLine: { flex: 1, height: 1 },

  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingVertical: 16, borderBottomWidth: 1,
  },
  rowLeft: { flex: 1, gap: 6 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 2 },
  badgeText: {
    fontFamily: fonts.label, fontSize: 7, letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.blanco,
  },
  rowTitulo: { fontFamily: fonts.cuerpo, fontSize: 14 },
  rowMeta:   { fontFamily: fonts.label, fontSize: 8, letterSpacing: 1 },

  rowActions: { flexDirection: 'row', gap: 8, paddingTop: 4 },
  actionBtn: {
    borderWidth: 1, borderRadius: 4, padding: 8,
  },

  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.oro,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modal: {
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    maxHeight: '90%',
  },
  modalContent: { padding: 24, gap: 6 },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: fonts.label, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase',
  },

  deporteRow:      { flexDirection: 'row', gap: 8, marginTop: 8 },
  deporteChip: {
    borderWidth: 1, borderRadius: 3,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  deporteChipText: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 2 },

  inputLabel: { fontFamily: fonts.label, fontSize: 8, letterSpacing: 2, textTransform: 'uppercase', marginTop: 4 },
  input: {
    fontFamily: fonts.cuerpo, fontSize: 16,
    borderBottomWidth: 1, paddingVertical: 8, marginBottom: 4,
  },
  inputMulti: {
    fontFamily: fonts.cuerpo, fontSize: 14,
    borderWidth: 1, borderRadius: 4,
    paddingHorizontal: 12, paddingVertical: 10,
    minHeight: 120, marginTop: 6,
  },
  draftNote: {
    fontFamily: fonts.cuerpo, fontSize: 11, fontStyle: 'italic', marginTop: 8,
  },
  crearBtn: {
    backgroundColor: colors.tinta, paddingVertical: 16,
    alignItems: 'center', borderRadius: 4, marginTop: 12,
  },
  crearBtnDisabled: { opacity: 0.5 },
  crearBtnText: {
    fontFamily: fonts.label, fontSize: 11, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.oro,
  },

  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText:      { fontFamily: fonts.cuerpo, fontSize: 14, fontStyle: 'italic' },
})
