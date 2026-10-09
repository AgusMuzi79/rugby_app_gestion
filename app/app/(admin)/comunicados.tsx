import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  TouchableOpacity, Modal, TextInput, Alert, ScrollView, KeyboardAvoidingView, Platform,
  type ViewStyle,
} from 'react-native'
import { useState, useRef } from 'react'
import { useScrollToTop } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { Header } from '@/components/shared/Header'
import {
  useComunicadosAdmin,
  type Comunicado,
  type AudienciaComunicado,
  type AudienciaMostrada,
} from '@/hooks/useComunicadosAdmin'
import { colors, fonts } from '@/constants/theme'

// ─── Constantes ──────────────────────────────────────────────────────────────

const AUDIENCIAS: { value: AudienciaComunicado; label: string; detalle: string }[] = [
  {
    value:   'cuerpo_tecnico',
    label:   'Cuerpo técnico',
    detalle: 'Lo ven coordinadores, entrenadores y managers. La notificación les llega a ellos.',
  },
  {
    value:   'todos',
    label:   'Socios',
    detalle: 'Lo ven todos los socios y el cuerpo técnico. La notificación les llega a los socios.',
  },
]

const AUDIENCIA_LABEL: Record<AudienciaMostrada, string> = {
  cuerpo_tecnico: 'CUERPO TÉCNICO',
  todos:          'SOCIOS',
  desconocida:    'SIN DEFINIR',
}

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── Fila ────────────────────────────────────────────────────────────────────

function FilaComunicado({
  comunicado,
  onEliminar,
}: {
  comunicado: Comunicado
  onEliminar: (id: string) => void
}) {
  const confirmarEliminar = () => {
    Alert.alert('Eliminar comunicado', '¿Querés eliminar este comunicado?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => onEliminar(comunicado.id) },
    ])
  }

  return (
    <View style={s.row}>
      <View style={s.rowLeft}>
        <View style={s.badgeRow}>
          <View style={[s.badge, BADGE_AUDIENCIA[comunicado.audiencia]]}>
            <Text style={s.badgeText}>{AUDIENCIA_LABEL[comunicado.audiencia]}</Text>
          </View>
          {!comunicado.publicada && (
            <View style={[s.badge, s.badgeBorrador]}>
              <Text style={s.badgeText}>BORRADOR</Text>
            </View>
          )}
        </View>
        <Text style={s.rowTitulo} numberOfLines={2}>{comunicado.titulo}</Text>
        <Text style={s.rowCuerpo} numberOfLines={2}>{comunicado.cuerpo}</Text>
        <Text style={s.rowMeta}>{fechaCorta(comunicado.created_at)}</Text>
      </View>
      <TouchableOpacity style={s.actionBtn} onPress={confirmarEliminar} activeOpacity={0.75}>
        <Feather name="trash-2" size={14} color={colors.rojoUrgente} />
      </TouchableOpacity>
    </View>
  )
}

// ─── Modal de nuevo comunicado ───────────────────────────────────────────────

function ModalNuevoComunicado({
  visible,
  publicando,
  onClose,
  onPublicar,
}: {
  visible:    boolean
  publicando: boolean
  onClose:    () => void
  onPublicar: (titulo: string, cuerpo: string, audiencia: AudienciaComunicado) => Promise<boolean>
}) {
  const [titulo, setTitulo]       = useState('')
  const [cuerpo, setCuerpo]       = useState('')
  const [audiencia, setAudiencia] = useState<AudienciaComunicado>('cuerpo_tecnico')

  const limpiar = () => {
    setTitulo('')
    setCuerpo('')
    setAudiencia('cuerpo_tecnico')
  }

  const handleClose = () => {
    limpiar()
    onClose()
  }

  const handlePublicar = () => {
    if (!titulo.trim()) { Alert.alert('Campo requerido', 'El título es obligatorio.'); return }
    if (!cuerpo.trim()) { Alert.alert('Campo requerido', 'El contenido es obligatorio.'); return }
    const destino = audiencia === 'cuerpo_tecnico' ? 'al cuerpo técnico' : 'a los socios'
    Alert.alert('Publicar comunicado', `Se publica ahora y se envía una notificación ${destino}.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Publicar',
        onPress: async () => {
          const ok = await onPublicar(titulo, cuerpo, audiencia)
          if (ok) handleClose()
        },
      },
    ])
  }

  const detalle = AUDIENCIAS.find(a => a.value === audiencia)?.detalle ?? ''

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={s.modal}
          contentContainerStyle={s.modalContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>NUEVO COMUNICADO</Text>
            <TouchableOpacity onPress={handleClose} activeOpacity={0.75}>
              <Feather name="x" size={20} color={TEXTO} />
            </TouchableOpacity>
          </View>

          <Text style={s.inputLabel}>DESTINATARIOS</Text>
          <View style={s.chipRow}>
            {AUDIENCIAS.map(a => {
              const activo = audiencia === a.value
              return (
                <TouchableOpacity
                  key={a.value}
                  style={[s.chip, activo ? s.chipActivo : s.chipInactivo]}
                  onPress={() => setAudiencia(a.value)}
                  activeOpacity={0.75}
                >
                  <Text style={[s.chipText, activo ? s.chipTextActivo : s.chipTextInactivo]}>
                    {a.label.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
          <Text style={s.nota}>{detalle}</Text>

          <Text style={s.inputLabelMt}>TÍTULO</Text>
          <TextInput
            style={s.input}
            value={titulo}
            onChangeText={setTitulo}
            placeholder="Título del comunicado"
            placeholderTextColor={MUTED}
          />

          <Text style={s.inputLabelMt}>CONTENIDO</Text>
          <TextInput
            style={s.inputMulti}
            value={cuerpo}
            onChangeText={setCuerpo}
            placeholder="Escribí el comunicado aquí…"
            placeholderTextColor={MUTED}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={[s.publicarBtn, publicando && s.publicarBtnDisabled]}
            onPress={handlePublicar}
            disabled={publicando}
            activeOpacity={0.8}
          >
            {publicando
              ? <ActivityIndicator color={colors.oro} />
              : <Text style={s.publicarBtnText}>PUBLICAR</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ComunicadosAdminScreen() {
  const insets    = useSafeAreaInsets()
  const scrollRef = useRef<FlatList>(null)
  useScrollToTop(scrollRef)
  const { comunicados, loading, errorCarga, publicando, publicar, eliminar, refetch } = useComunicadosAdmin()
  const [modalVisible, setModalVisible] = useState(false)

  return (
    <View style={s.root}>
      <View style={{ paddingTop: insets.top }}>
        <Header />
        <View style={s.edicionBar}>
          <Text style={s.edicionLabel}>ADMIN · COMUNICADOS</Text>
          <Text style={s.edicionFecha}>{comunicados.length} RECIENTES</Text>
        </View>
        <View style={s.secRow}>
          <Text style={s.secTitle}>NOTICIAS DEL CLUB</Text>
          <View style={s.secLine} />
        </View>
      </View>

      {loading && comunicados.length === 0 ? (
        <ActivityIndicator color={colors.oro} style={s.activityIndicator} />
      ) : errorCarga ? (
        <View style={s.emptyContainer}>
          <Text style={s.emptyText}>No se pudieron cargar los comunicados.</Text>
          <TouchableOpacity style={s.reintentarBtn} onPress={refetch} activeOpacity={0.75}>
            <Text style={s.reintentarText}>REINTENTAR</Text>
          </TouchableOpacity>
        </View>
      ) : comunicados.length === 0 ? (
        <View style={s.emptyContainer}>
          <Text style={s.emptyText}>Todavía no hay comunicados.</Text>
        </View>
      ) : (
        <FlatList
          ref={scrollRef}
          data={comunicados}
          keyExtractor={c => c.id}
          contentContainerStyle={s.listContent}
          renderItem={({ item }) => <FilaComunicado comunicado={item} onEliminar={eliminar} />}
          onRefresh={refetch}
          refreshing={loading}
        />
      )}

      <TouchableOpacity style={s.fab} onPress={() => setModalVisible(true)} activeOpacity={0.85}>
        <Feather name="plus" size={22} color={FONDO} />
      </TouchableOpacity>

      <ModalNuevoComunicado
        visible={modalVisible}
        publicando={publicando}
        onClose={() => setModalVisible(false)}
        onPublicar={publicar}
      />
    </View>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const FONDO   = '#15110A'
const CARD    = '#1C1710'
const TEXTO   = '#F3EFE4'
const MUTED   = '#8E8574'
const DIVIDER = '#2C2418'

const s = StyleSheet.create({
  root:              { flex: 1, backgroundColor: FONDO },
  activityIndicator: { marginTop: 40 },
  listContent:       { paddingHorizontal: 20, paddingBottom: 100 },

  edicionBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.tinta,
  },
  edicionLabel: {
    fontFamily: fonts.label, fontSize: 12, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.oro,
  },
  edicionFecha: {
    fontFamily: fonts.label, fontSize: 12, letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.grisClaro,
  },

  secRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, gap: 10,
  },
  secTitle: {
    fontFamily: fonts.label, fontSize: 12, letterSpacing: 2.5,
    textTransform: 'uppercase', color: colors.oroHondo,
  },
  secLine: { flex: 1, height: 1, backgroundColor: DIVIDER },

  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: DIVIDER,
  },
  rowLeft:   { flex: 1, gap: 6 },
  badgeRow:  { flexDirection: 'row', gap: 6 },
  badge:     { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 2 },
  badgeStaff:    { backgroundColor: '#2563EB' },
  badgeSocios:   { backgroundColor: '#1A7A1A' },
  badgeBorrador: { backgroundColor: '#555555' },
  badgeSinDefinir: { backgroundColor: '#555555' },
  badgeText: {
    fontFamily: fonts.label, fontSize: 10, letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.blanco,
  },
  rowTitulo: { fontFamily: fonts.cuerpo, fontSize: 16, color: TEXTO },
  rowCuerpo: { fontFamily: fonts.cuerpo, fontSize: 13, color: MUTED },
  rowMeta:   { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1, color: MUTED },
  actionBtn: { borderWidth: 1, borderRadius: 4, padding: 8, borderColor: DIVIDER, marginTop: 4 },

  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.oro,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modal: {
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    maxHeight: '90%', backgroundColor: CARD,
  },
  modalContent: { padding: 24, gap: 6 },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: fonts.label, fontSize: 13, letterSpacing: 2,
    textTransform: 'uppercase', color: TEXTO,
  },

  chipRow:          { flexDirection: 'row', gap: 8, marginTop: 8 },
  chip:             { borderWidth: 1, borderRadius: 3, paddingHorizontal: 14, paddingVertical: 7 },
  chipActivo:       { backgroundColor: colors.tinta, borderColor: colors.tinta },
  chipInactivo:     { backgroundColor: 'transparent', borderColor: DIVIDER },
  chipText:         { fontFamily: fonts.label, fontSize: 12, letterSpacing: 2 },
  chipTextActivo:   { color: FONDO },
  chipTextInactivo: { color: MUTED },
  nota: {
    fontFamily: fonts.cuerpo, fontSize: 13, fontStyle: 'italic', marginTop: 8, color: MUTED,
  },

  inputLabel: {
    fontFamily: fonts.label, fontSize: 11, letterSpacing: 2,
    textTransform: 'uppercase', marginTop: 4, color: MUTED,
  },
  inputLabelMt: {
    fontFamily: fonts.label, fontSize: 11, letterSpacing: 2,
    textTransform: 'uppercase', marginTop: 16, color: MUTED,
  },
  input: {
    fontFamily: fonts.cuerpo, fontSize: 18, color: TEXTO,
    borderBottomWidth: 1, borderBottomColor: colors.oro, paddingVertical: 8, marginBottom: 4,
  },
  inputMulti: {
    fontFamily: fonts.cuerpo, fontSize: 16, color: TEXTO,
    borderWidth: 1, borderColor: DIVIDER, borderRadius: 4,
    paddingHorizontal: 12, paddingVertical: 10,
    minHeight: 120, marginTop: 6,
  },
  publicarBtn: {
    backgroundColor: colors.oro, paddingVertical: 16,
    alignItems: 'center', borderRadius: 4, marginTop: 20,
  },
  publicarBtnDisabled: { opacity: 0.5 },
  publicarBtnText: {
    fontFamily: fonts.label, fontSize: 13, letterSpacing: 2,
    textTransform: 'uppercase', color: FONDO,
  },

  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText:      { fontFamily: fonts.cuerpo, fontSize: 16, fontStyle: 'italic', color: MUTED },
  reintentarBtn: {
    marginTop: 16, borderWidth: 1, borderColor: colors.oro, borderRadius: 4,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  reintentarText: {
    fontFamily: fonts.label, fontSize: 12, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.oro,
  },
})

const BADGE_AUDIENCIA: Record<AudienciaMostrada, ViewStyle> = {
  cuerpo_tecnico: s.badgeStaff,
  todos:          s.badgeSocios,
  desconocida:    s.badgeSinDefinir,
}
