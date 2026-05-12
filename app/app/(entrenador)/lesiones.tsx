import { useState } from 'react'
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
import { Ionicons } from '@expo/vector-icons'
import { useLesiones, LesionItem, JugadorOpcion, JugadorHistorial } from '@/hooks/useLesiones'
import { useProtocolos, type Protocolo } from '@/hooks/useProtocolos'
import { DatePickerField } from '@/components/ui/DatePickerField'

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

function FilaLesion({ lesion, onPress }: { lesion: LesionItem; onPress?: () => void }) {
  return (
    <TouchableOpacity
      style={styles.lesionCard}
      onPress={onPress}
      activeOpacity={onPress ? 0.75 : 1}
      disabled={!onPress}
    >
      <View style={styles.lesionCabeza}>
        <Text style={styles.lesionNombre} numberOfLines={1}>{lesion.jugadorNombre}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <GradoBadge grado={lesion.grado} />
          {onPress && <Ionicons name="chevron-forward" size={14} color={MUTED} />}
        </View>
      </View>
      <Text style={styles.lesionFecha}>{formatFecha(lesion.fecha)}</Text>
      <Text style={styles.lesionDesc} numberOfLines={2}>{lesion.descripcion}</Text>
    </TouchableOpacity>
  )
}

// ─── Vista historial por jugador ──────────────────────────────────────────────

function HistorialView({
  jugador,
  lesiones,
  cargando,
  onVolver,
}: {
  jugador: JugadorHistorial
  lesiones: LesionItem[]
  cargando: boolean
  onVolver: () => void
}) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.detalleHeader}>
        <TouchableOpacity onPress={onVolver} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={GOLD} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.detalleSub}>HISTORIAL DE LESIONES</Text>
          <Text style={styles.detalleTitulo} numberOfLines={1}>{jugador.nombre_completo}</Text>
        </View>
      </View>
      <View style={styles.separador} />

      {cargando ? (
        <View style={styles.centrado}>
          <ActivityIndicator color={GOLD} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.lista}>
          <View style={styles.seccionHeader}>
            <Text style={styles.seccionLabel}>REGISTRADAS</Text>
            <Text style={styles.seccionConteo}>{lesiones.length}</Text>
          </View>
          {lesiones.length === 0 ? (
            <Text style={styles.emptyTexto}>Sin lesiones registradas para este jugador.</Text>
          ) : (
            lesiones.map(l => <FilaLesion key={l.id} lesion={l} />)
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

// ─── Tab switcher ─────────────────────────────────────────────────────────────

type Tab = 'lesiones' | 'protocolos'

function TabSwitcher({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <View style={styles.tabSwitcher}>
      {(['lesiones', 'protocolos'] as Tab[]).map(t => (
        <TouchableOpacity
          key={t}
          style={[styles.tabBtn, tab === t && styles.tabBtnActivo]}
          onPress={() => onChange(t)}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabBtnTexto, tab === t && styles.tabBtnTextoActivo]}>
            {t === 'lesiones' ? 'LESIONES' : 'PROTOCOLOS'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

// ─── Vista protocolos (entrenador, solo lectura) ──────────────────────────────

const GRADO_COLOR_P: Record<number, string> = {
  1: '#22C55E', 2: '#EAB308', 3: '#F97316', 4: '#EF4444', 5: '#7F1D1D',
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

function ProtocolosEntrenador({
  protocolos,
  loadingP,
  abriendo,
  onAbrir,
}: {
  protocolos: Protocolo[]
  loadingP:   boolean
  abriendo:   string | null
  onAbrir:    (p: Protocolo) => void
}) {
  if (loadingP) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator color={GOLD} size="large" />
      </View>
    )
  }
  if (protocolos.length === 0) {
    return (
      <View style={styles.centrado}>
        <Text style={styles.emptyTexto}>Sin protocolos cargados.</Text>
        <Text style={[styles.mutedTexto, { marginTop: 4 }]}>La Subcomisión los publica aquí.</Text>
      </View>
    )
  }
  const grupos = agruparPorGrado(protocolos)
  return (
    <ScrollView contentContainerStyle={[styles.lista, { paddingBottom: 40 }]}>
      {grupos.map(({ grado, items }) => {
        const color = grado === null ? GOLD : (GRADO_COLOR_P[grado] ?? MUTED)
        const label = grado === null ? 'GENERAL' : `GRADO ${grado}`
        return (
          <View key={String(grado)}>
            <View style={[styles.seccionHeader, { marginTop: 8 }]}>
              <Text style={[styles.seccionLabel, { color }]}>{label}</Text>
              <Text style={styles.seccionConteo}>{items.length}</Text>
            </View>
            {items.map(p => {
              const esAbriendo = abriendo === p.id
              return (
                <TouchableOpacity
                  key={p.id}
                  style={styles.lesionCard}
                  onPress={() => onAbrir(p)}
                  activeOpacity={0.75}
                  disabled={esAbriendo}
                >
                  <View style={styles.lesionCabeza}>
                    <Text style={styles.lesionNombre} numberOfLines={1}>{p.titulo}</Text>
                    {esAbriendo
                      ? <ActivityIndicator size="small" color={GOLD} />
                      : <Ionicons name="open-outline" size={16} color={GOLD} />
                    }
                  </View>
                  {p.nombre_archivo && (
                    <Text style={styles.lesionFecha} numberOfLines={1}>{p.nombre_archivo}</Text>
                  )}
                </TouchableOpacity>
              )
            })}
          </View>
        )
      })}
    </ScrollView>
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
    paso, jugadorHistorial, historialLesiones, cargandoHistorial,
    verHistorial, cerrarHistorial,
    modalVisible, guardando, guardadoOk, error,
    jugadorSeleccionado, setJugadorSeleccionado,
    grado, setGrado,
    descripcion, setDescripcion,
    fecha, setFecha,
    abrirModal, cerrarModal, guardarLesion,
  } = useLesiones()

  const {
    loading: loadingP,
    protocolos,
    abriendo,
    abrirProtocolo,
  } = useProtocolos()

  const [tabActivo, setTabActivo] = useState<Tab>('lesiones')

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

  if (paso === 'historial' && jugadorHistorial) {
    return (
      <HistorialView
        jugador={jugadorHistorial}
        lesiones={historialLesiones}
        cargando={cargandoHistorial}
        onVolver={cerrarHistorial}
      />
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.labelHeader}>ENTRENADOR · {divisionNombre.toUpperCase()}</Text>
        <Text style={styles.titulo}>Lesiones</Text>
      </View>

      {/* Tab switcher */}
      <TabSwitcher tab={tabActivo} onChange={setTabActivo} />
      <View style={styles.separador} />

      {/* Protocolos (solo lectura) */}
      {tabActivo === 'protocolos' && (
        <ProtocolosEntrenador
          protocolos={protocolos}
          loadingP={loadingP}
          abriendo={abriendo}
          onAbrir={abrirProtocolo}
        />
      )}

      {/* Lesiones */}
      {tabActivo === 'lesiones' && (
        <>
          <ScrollView contentContainerStyle={styles.lista}>
            <View style={styles.seccionHeader}>
              <Text style={styles.seccionLabel}>REGISTRADAS</Text>
              <Text style={styles.seccionConteo}>{lesiones.length}</Text>
            </View>

            {lesiones.length === 0 ? (
              <Text style={styles.emptyTexto}>Sin lesiones registradas.</Text>
            ) : (
              lesiones.map(l => (
                <FilaLesion
                  key={l.id}
                  lesion={l}
                  onPress={() => verHistorial({ id: l.jugador_id, nombre_completo: l.jugadorNombre })}
                />
              ))
            )}
          </ScrollView>

          {/* FAB */}
          <View style={styles.fabWrap}>
            <TouchableOpacity style={styles.fab} onPress={abrirModal} activeOpacity={0.85}>
              <Text style={styles.fabTexto}>+ REGISTRAR LESIÓN</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

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
                <DatePickerField
                  label="FECHA"
                  value={fecha}
                  onChange={setFecha}
                  maximumDate={new Date()}
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

  // Tab switcher
  tabSwitcher:        { flexDirection: 'row', backgroundColor: DARK, paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  tabBtn:             { flex: 1, paddingVertical: 9, borderRadius: 4, borderWidth: 1.5, borderColor: '#333', alignItems: 'center' },
  tabBtnActivo:       { backgroundColor: GOLD, borderColor: GOLD },
  tabBtnTexto:        { fontSize: 10, letterSpacing: 1.5, color: '#666', fontWeight: '700' },
  tabBtnTextoActivo:  { color: DARK },

  // Historial header
  detalleHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16, gap: 8 },
  backBtn:       { padding: 4 },
  detalleSub:    { fontSize: 10, letterSpacing: 2, color: GOLD, marginBottom: 2 },
  detalleTitulo: { fontSize: 20, fontStyle: 'italic', fontFamily: 'serif', color: DARK },

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
