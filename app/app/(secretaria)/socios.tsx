import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  TouchableOpacity, Modal, TextInput, Alert, ScrollView, Image,
} from 'react-native'
import { useState, useCallback } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { Header } from '@/components/shared/Header'
import { useSociosSecretaria, type SocioItem, type CategoriaSocio } from '@/hooks/useSociosSecretaria'
import { colors, fonts } from '@/constants/theme'
import { useTheme } from '@/contexts/ThemeContext'

// ─── Constants ────────────────────────────────────────────────────────────────

const ESTADO_COLOR: Record<string, string> = {
  activo:    '#2ECC71',
  moroso:    colors.oro,
  pendiente: '#E67E22',
  inactivo:  '#555555',
}
const ESTADO_LABEL: Record<string, string> = {
  activo: 'ACTIVO', moroso: 'MOROSO', pendiente: 'PENDIENTE', inactivo: 'INACTIVO',
}
const FILTROS = ['todos', 'activo', 'moroso', 'pendiente', 'inactivo'] as const
type Filtro = typeof FILTROS[number]

// ─── Modal Nuevo Socio ────────────────────────────────────────────────────────

function ModalNuevoSocio({
  visible,
  categorias,
  creando,
  onClose,
  onCreate,
}: {
  visible:    boolean
  categorias: CategoriaSocio[]
  creando:    boolean
  onClose:    () => void
  onCreate:   (email: string, nombre: string, dni: string, categoria_id: string) => void
}) {
  const { colors: tc } = useTheme()
  const [email, setEmail]   = useState('')
  const [nombre, setNombre] = useState('')
  const [dni, setDni]       = useState('')
  const [catId, setCatId]   = useState('')

  const handleCrear = () => {
    if (!email.trim())  { Alert.alert('Requerido', 'Email obligatorio.'); return }
    if (!nombre.trim()) { Alert.alert('Requerido', 'Nombre obligatorio.'); return }
    if (!dni.trim())    { Alert.alert('Requerido', 'DNI obligatorio.'); return }
    if (!catId)         { Alert.alert('Requerido', 'Seleccioná una categoría.'); return }
    onCreate(email.trim().toLowerCase(), nombre.trim(), dni.trim(), catId)
  }

  const handleClose = () => {
    setEmail(''); setNombre(''); setDni(''); setCatId('')
    onClose()
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={ss.overlay}>
        <View style={[ss.modal, { backgroundColor: tc.card }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={ss.modalHeader}>
              <Text style={[ss.modalTitle, { color: tc.texto }]}>NUEVO SOCIO</Text>
              <TouchableOpacity onPress={handleClose} activeOpacity={0.75}>
                <Feather name="x" size={20} color={tc.texto} />
              </TouchableOpacity>
            </View>

            {[
              { label: 'NOMBRE COMPLETO', value: nombre, set: setNombre, placeholder: 'Juan Pérez', keyboard: 'default' as const, caps: 'words' as const },
              { label: 'EMAIL', value: email, set: setEmail, placeholder: 'juan@ejemplo.com', keyboard: 'email-address' as const, caps: 'none' as const },
              { label: 'DNI', value: dni, set: setDni, placeholder: '12345678', keyboard: 'numeric' as const, caps: 'none' as const },
            ].map(f => (
              <View key={f.label}>
                <Text style={[ss.inputLabel, { color: tc.muted }]}>{f.label}</Text>
                <TextInput
                  style={[ss.input, { color: tc.texto, borderBottomColor: colors.oro }]}
                  value={f.value}
                  onChangeText={f.set}
                  placeholder={f.placeholder}
                  placeholderTextColor={tc.muted}
                  keyboardType={f.keyboard}
                  autoCapitalize={f.caps}
                />
              </View>
            ))}

            <Text style={[ss.inputLabel, { color: tc.muted, marginTop: 14 }]}>CATEGORÍA</Text>
            <View style={ss.categoriasGrid}>
              {categorias.filter(c => c.activa).map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={[
                    ss.catBtn,
                    { borderColor: catId === c.id ? colors.oro : tc.grisClaro },
                    catId === c.id && { backgroundColor: colors.tinta },
                  ]}
                  onPress={() => setCatId(c.id)}
                  activeOpacity={0.75}
                >
                  <Text style={[ss.catBtnText, { color: catId === c.id ? colors.oro : tc.texto }]}>
                    {c.nombre}
                  </Text>
                  <Text style={[ss.catMonto, { color: catId === c.id ? colors.grisClaro : tc.muted }]}>
                    ${c.monto_mensual}/mes
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[ss.crearBtn, creando && ss.crearBtnOff]}
              onPress={handleCrear}
              disabled={creando}
              activeOpacity={0.8}
            >
              {creando
                ? <ActivityIndicator color={colors.oro} />
                : <Text style={ss.crearBtnText}>CREAR SOCIO Y ENVIAR INVITACIÓN</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

// ─── Detalle Socio ────────────────────────────────────────────────────────────

function DetalleSocio({
  socio,
  categorias,
  fotoSignedUrl,
  onDeactivate,
  onReactivate,
  onValidarFoto,
  onClose,
}: {
  socio:         SocioItem
  categorias:    CategoriaSocio[]
  fotoSignedUrl: (path: string) => Promise<string | null>
  onDeactivate:  (id: string) => void
  onReactivate:  (id: string) => void
  onValidarFoto: (id: string) => void
  onClose:       () => void
}) {
  const { colors: tc } = useTheme()
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const categoria = categorias.find(c => c.id === socio.categoria_id)

  const verFoto = async () => {
    if (!socio.foto_path) { Alert.alert('Sin foto', 'El socio no tiene foto cargada.'); return }
    const url = await fotoSignedUrl(socio.foto_path)
    if (url) setFotoUrl(url)
  }

  return (
    <View style={[ss.detalle, { backgroundColor: tc.fondo }]}>
      <View style={[ss.detalleBar, { borderBottomColor: tc.grisClaro }]}>
        <TouchableOpacity onPress={onClose} style={ss.backBtn} activeOpacity={0.75}>
          <Feather name="arrow-left" size={18} color={tc.texto} />
          <Text style={[ss.backText, { color: tc.texto }]}>SOCIOS</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} showsVerticalScrollIndicator={false}>
        {fotoUrl ? (
          <Image source={{ uri: fotoUrl }} style={ss.fotoDetalle} />
        ) : (
          <TouchableOpacity
            style={[ss.fotoDetalle, ss.fotoPlaceholder, { borderColor: tc.grisClaro }]}
            onPress={verFoto}
            activeOpacity={0.75}
          >
            <Feather name="image" size={32} color={tc.muted} />
            <Text style={[ss.verFotoText, { color: tc.muted }]}>VER FOTO</Text>
          </TouchableOpacity>
        )}

        <View>
          <Text style={[ss.detalleNombre, { color: tc.texto }]}>{socio.nombre}</Text>
          <Text style={[ss.detalleNum, { color: colors.oroHondo }]}>Nº {socio.numero_socio}</Text>
        </View>

        {[
          { label: 'DNI',       value: socio.dni },
          { label: 'CATEGORÍA', value: categoria?.nombre ?? socio.categoria },
          { label: 'ESTADO',    value: ESTADO_LABEL[socio.estado] ?? socio.estado.toUpperCase() },
          { label: 'FOTO',      value: socio.foto_validada ? 'Validada ✓' : 'Pendiente de validación' },
        ].map(row => (
          <View key={row.label} style={[ss.dataRow, { borderBottomColor: tc.grisClaro }]}>
            <Text style={[ss.dataLabel, { color: tc.muted }]}>{row.label}</Text>
            <Text style={[ss.dataValue, { color: tc.texto }]}>{row.value}</Text>
          </View>
        ))}

        <View style={ss.acciones}>
          {!socio.foto_validada && socio.foto_path && (
            <TouchableOpacity
              style={[ss.accionBtn, { borderColor: colors.oro }]}
              onPress={() => onValidarFoto(socio.id)}
              activeOpacity={0.8}
            >
              <Text style={[ss.accionBtnText, { color: colors.oro }]}>VALIDAR FOTO</Text>
            </TouchableOpacity>
          )}
          {socio.estado !== 'inactivo' ? (
            <TouchableOpacity
              style={[ss.accionBtn, { borderColor: colors.rojoUrgente }]}
              onPress={() => onDeactivate(socio.id)}
              activeOpacity={0.8}
            >
              <Text style={[ss.accionBtnText, { color: colors.rojoUrgente }]}>DESACTIVAR SOCIO</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[ss.accionBtn, { borderColor: '#2ECC71' }]}
              onPress={() => onReactivate(socio.id)}
              activeOpacity={0.8}
            >
              <Text style={[ss.accionBtnText, { color: '#2ECC71' }]}>REACTIVAR SOCIO</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  )
}

// ─── Fila lista ───────────────────────────────────────────────────────────────

function SocioRow({ socio, onPress }: { socio: SocioItem; onPress: () => void }) {
  const { colors: tc } = useTheme()
  return (
    <TouchableOpacity
      style={[ss.socioRow, { borderBottomColor: tc.grisClaro }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[ss.socioNum, { color: colors.oroHondo }]}>{socio.numero_socio}</Text>
      <View style={ss.socioInfo}>
        <Text style={[ss.socioNombre, { color: tc.texto }]} numberOfLines={1}>{socio.nombre}</Text>
        <Text style={[ss.socioCat, { color: tc.muted }]}>{socio.categoria}</Text>
      </View>
      <View style={[ss.estadoBadge, { backgroundColor: ESTADO_COLOR[socio.estado] ?? '#555' }]}>
        <Text style={ss.estadoBadgeText}>{ESTADO_LABEL[socio.estado]?.[0] ?? '?'}</Text>
      </View>
    </TouchableOpacity>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SociosScreen() {
  const insets         = useSafeAreaInsets()
  const { colors: tc } = useTheme()
  const {
    socios, categorias, loading, creando,
    filtro, setFiltro,
    crearSocio, desactivarSocio, reactivarSocio, validarFoto, fotoSignedUrl,
  } = useSociosSecretaria()

  const [modalNuevo, setModalNuevo] = useState(false)
  const [detalle, setDetalle]       = useState<SocioItem | null>(null)

  const handleCrear = async (email: string, nombre: string, dni: string, categoria_id: string) => {
    const ok = await crearSocio({ email, nombre, dni, categoria_id })
    if (ok) setModalNuevo(false)
  }

  const handleDeactivate = useCallback(async (id: string) => {
    Alert.alert('Desactivar socio', '¿Estás seguro? Se baneará el acceso.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Desactivar', style: 'destructive', onPress: async () => {
        const ok = await desactivarSocio(id)
        if (ok) setDetalle(null)
      }},
    ])
  }, [desactivarSocio])

  const handleReactivate = useCallback(async (id: string) => {
    const ok = await reactivarSocio(id)
    if (ok) setDetalle(null)
  }, [reactivarSocio])

  const handleValidarFoto = useCallback(async (id: string) => {
    const res = await validarFoto(id)
    if (res.validada) {
      Alert.alert('Foto validada ✓', `Estado actualizado a: ${res.estado?.toUpperCase() ?? '—'}.`)
    } else {
      Alert.alert('Foto no válida', res.mensaje ?? 'No se pudo validar la foto.')
    }
  }, [validarFoto])

  // ── Detalle ──────────────────────────────────────────────────────────────
  if (detalle) {
    const actualizado = socios.find(x => x.id === detalle.id) ?? detalle
    return (
      <View style={[ss.root, { paddingTop: insets.top, backgroundColor: tc.fondo }]}>
        <DetalleSocio
          socio={actualizado}
          categorias={categorias}
          fotoSignedUrl={fotoSignedUrl}
          onDeactivate={handleDeactivate}
          onReactivate={handleReactivate}
          onValidarFoto={handleValidarFoto}
          onClose={() => setDetalle(null)}
        />
      </View>
    )
  }

  // ── Lista ────────────────────────────────────────────────────────────────
  return (
    <View style={[ss.root, { backgroundColor: tc.fondo }]}>
      <View style={{ paddingTop: insets.top }}>
        <Header />
        <View style={ss.edicionBar}>
          <Text style={ss.edicionLabel}>SECRETARÍA · SOCIOS</Text>
          <Text style={ss.edicionFecha}>{socios.length} EN VISTA</Text>
        </View>

        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={ss.filtrosContent}
          style={[ss.filtrosBar, { backgroundColor: tc.card, borderBottomColor: tc.grisClaro }]}
        >
          {FILTROS.map(f => (
            <TouchableOpacity
              key={f}
              style={[ss.filtroBtn, filtro === f && ss.filtroBtnActive]}
              onPress={() => setFiltro(f as Filtro)}
              activeOpacity={0.75}
            >
              <Text style={[ss.filtroBtnText, filtro === f && ss.filtroBtnTextActive]}>
                {f === 'todos' ? 'TODOS' : ESTADO_LABEL[f] ?? f.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.oro} style={{ marginTop: 40 }} />
      ) : socios.length === 0 ? (
        <View style={ss.empty}>
          <Text style={[ss.emptyText, { color: tc.muted }]}>No hay socios en esta vista.</Text>
        </View>
      ) : (
        <FlatList
          data={socios}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
          renderItem={({ item }) => (
            <SocioRow socio={item} onPress={() => setDetalle(item)} />
          )}
        />
      )}

      <TouchableOpacity style={ss.fab} onPress={() => setModalNuevo(true)} activeOpacity={0.85}>
        <Feather name="plus" size={22} color={colors.tinta} />
      </TouchableOpacity>

      <ModalNuevoSocio
        visible={modalNuevo}
        categorias={categorias}
        creando={creando}
        onClose={() => setModalNuevo(false)}
        onCreate={handleCrear}
      />
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
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

  filtrosBar:     { borderBottomWidth: 1, maxHeight: 46 },
  filtrosContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  filtroBtn:      { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 2 },
  filtroBtnActive:{ borderBottomWidth: 2, borderBottomColor: colors.oro },
  filtroBtnText: {
    fontFamily: fonts.label, fontSize: 9, letterSpacing: 1.5,
    textTransform: 'uppercase', color: '#888',
  },
  filtroBtnTextActive: { color: colors.oro },

  socioRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14, borderBottomWidth: 1,
  },
  socioNum:    { fontFamily: fonts.titulo, fontSize: 18, width: 44, textAlign: 'right' },
  socioInfo:   { flex: 1 },
  socioNombre: { fontFamily: fonts.cuerpo, fontSize: 14 },
  socioCat:    { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1, marginTop: 2 },
  estadoBadge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  estadoBadgeText: { fontFamily: fonts.label, fontSize: 10, color: colors.blanco, fontWeight: 'bold' },

  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.oro,
    alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },

  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modal: {
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    padding: 24, maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: fonts.label, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase',
  },
  inputLabel: { fontFamily: fonts.label, fontSize: 8, letterSpacing: 2, textTransform: 'uppercase', marginTop: 12 },
  input: {
    fontFamily: fonts.cuerpo, fontSize: 16,
    borderBottomWidth: 1, paddingVertical: 8, marginBottom: 4,
  },
  categoriasGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  catBtn: {
    borderWidth: 1, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 8, gap: 2,
  },
  catBtnText: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1 },
  catMonto:   { fontFamily: fonts.cuerpo, fontSize: 11, fontStyle: 'italic' },
  crearBtn: {
    backgroundColor: colors.tinta, paddingVertical: 16,
    alignItems: 'center', borderRadius: 4, marginTop: 20, marginBottom: 8,
  },
  crearBtnOff: { opacity: 0.5 },
  crearBtnText: {
    fontFamily: fonts.label, fontSize: 11, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.oro,
  },

  // Detalle
  detalle:   { flex: 1 },
  detalleBar: {
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1,
  },
  backBtn:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backText: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 2, textTransform: 'uppercase' },

  fotoDetalle: { width: 120, height: 150, borderRadius: 6, alignSelf: 'center' },
  fotoPlaceholder: { borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  verFotoText: { fontFamily: fonts.label, fontSize: 8, letterSpacing: 1.5 },

  detalleNombre: { fontFamily: fonts.titulo, fontSize: 28, marginBottom: 2 },
  detalleNum:    { fontFamily: fonts.label, fontSize: 11, letterSpacing: 2 },

  dataRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1,
  },
  dataLabel: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase' },
  dataValue: { fontFamily: fonts.cuerpo, fontSize: 13 },

  acciones: { gap: 10, marginTop: 8 },
  accionBtn: {
    borderWidth: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 4,
  },
  accionBtnText: {
    fontFamily: fonts.label, fontSize: 10, letterSpacing: 2, textTransform: 'uppercase',
  },

  empty:     { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontFamily: fonts.cuerpo, fontSize: 14, fontStyle: 'italic' },
})
