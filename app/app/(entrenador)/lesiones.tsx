import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useLesiones, LesionItem, JugadorOpcion } from '@/hooks/useLesiones'

const CREAM   = '#F5F0E8'
const GOLD    = '#C9A84C'
const DARK    = '#1A1A1A'
const DIVIDER = '#D1C9B8'
const MUTED   = '#7C7267'
const VERDE   = '#22C55E'
const ROJO    = '#EF4444'

const GRADO_COLOR: Record<number, string> = {
  1: '#22C55E',
  2: '#EAB308',
  3: '#F97316',
  4: '#EF4444',
  5: '#7F1D1D',
}

function formatFecha(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

// ─── Componentes menores ──────────────────────────────────────────────────────

function GradoBadge({ grado }: { grado: number }) {
  return (
    <View style={[styles.gradoBadge, { backgroundColor: GRADO_COLOR[grado] ?? MUTED }]}>
      <Text style={styles.gradoBadgeTexto}>G{grado}</Text>
    </View>
  )
}

function FilaLesion({ lesion }: { lesion: LesionItem }) {
  return (
    <View style={styles.lesionCard}>
      <View style={styles.lesionCabeza}>
        <Text style={styles.lesionNombre} numberOfLines={1}>{lesion.jugadorNombre}</Text>
        <GradoBadge grado={lesion.grado} />
      </View>
      <Text style={styles.lesionFecha}>{formatFecha(lesion.fecha)}</Text>
      <Text style={styles.lesionDesc} numberOfLines={2}>{lesion.descripcion}</Text>
    </View>
  )
}

function SelectorJugador({
  jugadores,
  seleccionado,
  onSelect,
}: {
  jugadores: JugadorOpcion[]
  seleccionado: JugadorOpcion | null
  onSelect: (j: JugadorOpcion) => void
}) {
  return (
    <View style={{ gap: 4 }}>
      {jugadores.map(j => {
        const activo = seleccionado?.id === j.id
        return (
          <TouchableOpacity
            key={j.id}
            style={[styles.jugItem, activo && styles.jugItemActivo]}
            onPress={() => onSelect(j)}
            activeOpacity={0.75}
          >
            <Text style={[styles.jugItemTexto, activo && styles.jugItemTextoActivo]} numberOfLines={1}>
              {j.nombre_completo}
            </Text>
            {activo && <Text style={{ color: VERDE, fontWeight: '700', fontSize: 14 }}>✓</Text>}
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

function SelectorGrado({
  grado,
  onSelect,
}: {
  grado: number | null
  onSelect: (g: number) => void
}) {
  return (
    <View style={styles.gradoRow}>
      {[1, 2, 3, 4, 5].map(g => {
        const activo = grado === g
        const color  = GRADO_COLOR[g]
        return (
          <TouchableOpacity
            key={g}
            style={[styles.gradoBtn, { borderColor: activo ? color : DIVIDER, backgroundColor: activo ? color : 'transparent' }]}
            onPress={() => onSelect(g)}
            activeOpacity={0.75}
          >
            <Text style={[styles.gradoBtnTexto, { color: activo ? '#fff' : MUTED }]}>{g}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function LesionesScreen() {
  const {
    loading, divisionNombre, sinDivision,
    lesiones, jugadores,
    modalVisible, guardando, guardadoOk, error,
    jugadorSeleccionado, setJugadorSeleccionado,
    grado, setGrado,
    descripcion, setDescripcion,
    fecha, setFecha,
    abrirModal, cerrarModal, guardarLesion,
  } = useLesiones()

  if (loading) {
    return (
      <SafeAreaView style={styles.centrado}>
        <ActivityIndicator color={GOLD} size="large" />
      </SafeAreaView>
    )
  }

  if (sinDivision) {
    return (
      <SafeAreaView style={styles.centrado}>
        <Text style={styles.mutedTexto}>Sin división asignada.</Text>
        <Text style={styles.mutedTexto}>Contactá a la Subcomisión.</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.labelHeader}>ENTRENADOR · {divisionNombre.toUpperCase()}</Text>
        <Text style={styles.titulo}>Lesiones</Text>
      </View>
      <View style={styles.separador} />

      {/* Lista */}
      <ScrollView contentContainerStyle={styles.lista}>
        <View style={styles.seccionHeader}>
          <Text style={styles.seccionLabel}>REGISTRADAS</Text>
          <Text style={styles.seccionConteo}>{lesiones.length}</Text>
        </View>

        {lesiones.length === 0 ? (
          <Text style={styles.emptyTexto}>Sin lesiones registradas.</Text>
        ) : (
          lesiones.map(l => <FilaLesion key={l.id} lesion={l} />)
        )}
      </ScrollView>

      {/* FAB */}
      <View style={styles.fabWrap}>
        <TouchableOpacity style={styles.fab} onPress={abrirModal} activeOpacity={0.85}>
          <Text style={styles.fabTexto}>+ REGISTRAR LESIÓN</Text>
        </TouchableOpacity>
      </View>

      {/* Modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <SafeAreaView style={styles.modalContainer}>
            {/* Header del modal */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitulo}>Registrar lesión</Text>
              <TouchableOpacity onPress={cerrarModal} disabled={guardando} activeOpacity={0.7}>
                <Text style={styles.modalCerrar}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.separador} />

            <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
              {/* Jugador */}
              <View style={styles.campo}>
                <Text style={styles.campoLabel}>JUGADOR</Text>
                {jugadores.length === 0
                  ? <Text style={styles.mutedTexto}>No hay jugadores activos.</Text>
                  : <SelectorJugador
                      jugadores={jugadores}
                      seleccionado={jugadorSeleccionado}
                      onSelect={setJugadorSeleccionado}
                    />
                }
              </View>

              {/* Grado */}
              <View style={styles.campo}>
                <Text style={styles.campoLabel}>GRADO  (1 leve — 5 grave)</Text>
                <SelectorGrado grado={grado} onSelect={setGrado} />
              </View>

              {/* Descripción */}
              <View style={styles.campo}>
                <Text style={styles.campoLabel}>DESCRIPCIÓN</Text>
                <TextInput
                  style={styles.inputMultiline}
                  value={descripcion}
                  onChangeText={setDescripcion}
                  placeholder="Describí la lesión..."
                  placeholderTextColor={MUTED}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>

              {/* Fecha */}
              <View style={styles.campo}>
                <Text style={styles.campoLabel}>FECHA (AAAA-MM-DD)</Text>
                <TextInput
                  style={styles.inputTexto}
                  value={fecha}
                  onChangeText={setFecha}
                  placeholder="2026-05-07"
                  placeholderTextColor={MUTED}
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                />
              </View>

              {/* Error */}
              {error && (
                <View style={styles.bannerError}>
                  <Text style={styles.bannerErrorTexto}>{error}</Text>
                </View>
              )}

              {/* Éxito */}
              {guardadoOk && (
                <View style={styles.bannerOk}>
                  <Text style={styles.bannerOkTexto}>✓ Lesión registrada</Text>
                  <Text style={styles.bannerOkSub}>Se notificará a la Subcomisión</Text>
                </View>
              )}

              {/* Guardar */}
              {!guardadoOk && (
                <TouchableOpacity
                  style={[styles.boton, guardando && { opacity: 0.6 }]}
                  onPress={guardarLesion}
                  disabled={guardando}
                  activeOpacity={0.85}
                >
                  {guardando
                    ? <ActivityIndicator color={GOLD} size="small" />
                    : <Text style={styles.botonTexto}>GUARDAR</Text>}
                </TouchableOpacity>
              )}

              {/* Cerrar post-guardado */}
              {guardadoOk && (
                <TouchableOpacity style={styles.botonSecundario} onPress={cerrarModal} activeOpacity={0.85}>
                  <Text style={styles.botonSecundarioTexto}>CERRAR</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}

// ─── Estilos ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: CREAM },
  centrado:     { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: CREAM, gap: 8 },
  mutedTexto:   { color: MUTED, fontSize: 14, fontFamily: 'serif', fontStyle: 'italic', textAlign: 'center' },

  header:       { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  labelHeader:  { fontSize: 10, letterSpacing: 2, color: GOLD, marginBottom: 4 },
  titulo:       { fontSize: 32, fontStyle: 'italic', fontFamily: 'serif', color: DARK, lineHeight: 36 },
  separador:    { height: 1, backgroundColor: DIVIDER, marginHorizontal: 20 },

  lista:        { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120, gap: 10 },
  seccionHeader:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  seccionLabel: { fontSize: 10, letterSpacing: 2, color: GOLD },
  seccionConteo:{ fontSize: 13, color: MUTED, fontWeight: '600' },
  emptyTexto:   { color: MUTED, fontSize: 14, fontStyle: 'italic', fontFamily: 'serif' },

  // Tarjeta de lesión
  lesionCard:   { borderWidth: 1, borderColor: DIVIDER, borderRadius: 8, padding: 14, gap: 4 },
  lesionCabeza: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lesionNombre: { flex: 1, fontSize: 15, fontWeight: '700', color: DARK },
  lesionFecha:  { fontSize: 12, color: MUTED },
  lesionDesc:   { fontSize: 13, color: DARK, opacity: 0.8, lineHeight: 18 },

  // Badge de grado
  gradoBadge:     { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  gradoBadgeTexto:{ color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  // FAB
  fabWrap:  { position: 'absolute', bottom: 24, left: 16, right: 16 },
  fab:      { backgroundColor: DARK, paddingVertical: 15, borderRadius: 4, alignItems: 'center' },
  fabTexto: { color: GOLD, fontSize: 11, letterSpacing: 2.5, fontWeight: '700' },

  // Modal
  modalContainer: { flex: 1, backgroundColor: CREAM },
  modalHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 18 },
  modalTitulo:    { fontSize: 20, fontStyle: 'italic', fontFamily: 'serif', color: DARK },
  modalCerrar:    { fontSize: 18, color: MUTED, paddingHorizontal: 4 },
  modalScroll:    { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40, gap: 20 },

  // Campos del formulario
  campo:          { gap: 10 },
  campoLabel:     { fontSize: 10, letterSpacing: 2, color: GOLD },

  inputTexto:     { borderWidth: 1.5, borderColor: DIVIDER, borderRadius: 6, padding: 12, fontSize: 15, color: DARK },
  inputMultiline: { borderWidth: 1.5, borderColor: DIVIDER, borderRadius: 6, padding: 12, fontSize: 15, color: DARK, minHeight: 80 },

  // Selector jugador
  jugItem:        { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: DIVIDER, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 10 },
  jugItemActivo:  { borderColor: GOLD, backgroundColor: '#FBF6EA' },
  jugItemTexto:   { flex: 1, fontSize: 14, color: DARK },
  jugItemTextoActivo: { color: GOLD, fontWeight: '700' },

  // Selector grado
  gradoRow:     { flexDirection: 'row', gap: 10 },
  gradoBtn:     { flex: 1, aspectRatio: 1, borderRadius: 8, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  gradoBtnTexto:{ fontSize: 16, fontWeight: '700' },

  // Banners
  bannerError:      { backgroundColor: '#FEF2F2', borderLeftWidth: 3, borderLeftColor: ROJO, borderRadius: 6, padding: 12 },
  bannerErrorTexto: { fontSize: 13, color: '#991B1B' },
  bannerOk:         { backgroundColor: '#F0FDF4', borderLeftWidth: 3, borderLeftColor: VERDE, borderRadius: 6, padding: 14, gap: 4 },
  bannerOkTexto:    { fontSize: 14, color: '#166534', fontWeight: '700' },
  bannerOkSub:      { fontSize: 12, color: '#166534' },

  // Botones
  boton:              { backgroundColor: DARK, paddingVertical: 14, borderRadius: 4, alignItems: 'center' },
  botonTexto:         { color: GOLD, fontSize: 11, letterSpacing: 2.5, fontWeight: '600' },
  botonSecundario:    { borderWidth: 1.5, borderColor: GOLD, paddingVertical: 12, borderRadius: 4, alignItems: 'center' },
  botonSecundarioTexto: { color: GOLD, fontSize: 11, letterSpacing: 2.5, fontWeight: '600' },
})
