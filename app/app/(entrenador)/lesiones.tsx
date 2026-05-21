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
import { colors, fonts } from '@/constants/theme'
import { useTheme } from '@/contexts/ThemeContext'

// ─── Design tokens ────────────────────────────────────────────────────────────

const PAPEL     = colors.papel        // '#F6F1E4'
const TINTA     = colors.tinta        // '#0E0E0E'
const ORO       = colors.oro          // '#E8B53C'
const ORO_HONDO = colors.oroHondo     // '#C9961F'
const GRIS      = colors.grisClaro    // '#E5E0D0'
const ROJO      = colors.rojoUrgente  // '#C0392B'
const MUTED     = '#7C7267'
const DIVIDER   = '#D9D3C4'

// Escala progresiva de grado 1→5
const GRADO: Record<number, { bg: string; borde?: string }> = {
  1: { bg: '#4A7C59' },
  2: { bg: '#C4960A' },
  3: { bg: '#C06008' },
  4: { bg: '#C0392B' },
  5: { bg: '#7F1D1D', borde: '#C0392B' },
}

const GRADO_COLOR_P: Record<number, string> = {
  1: '#4A7C59', 2: '#C4960A', 3: '#C06008', 4: '#C0392B', 5: '#7F1D1D',
}

function formatFecha(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

// ─── Badge de grado ───────────────────────────────────────────────────────────

function GradoBadge({ grado, small }: { grado: number; small?: boolean }) {
  const cfg = GRADO[grado] ?? { bg: MUTED }
  return (
    <View style={[
      s.gradoBadge,
      { backgroundColor: cfg.bg },
      cfg.borde ? { borderWidth: 1.5, borderColor: cfg.borde } : null,
      small ? { paddingHorizontal: 6, paddingVertical: 2 } : null,
    ]}>
      <Text style={[s.gradoBadgeTexto, small && { fontSize: 10 }]}>G{grado}</Text>
    </View>
  )
}

// ─── Tarjeta de lesión con expansión ─────────────────────────────────────────

function FilaLesion({
  lesion,
  expanded,
  onToggle,
  onVerHistorial,
}: {
  lesion: LesionItem
  expanded: boolean
  onToggle: () => void
  onVerHistorial: () => void
}) {
  const { colors: tc } = useTheme()
  const urgente = lesion.grado >= 3
  return (
    <TouchableOpacity
      style={[s.lesionCard, !urgente && { backgroundColor: tc.fondo }, urgente && s.lesionCardUrgente]}
      onPress={onToggle}
      activeOpacity={0.82}
    >
      <View style={s.lesionCabeza}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text
            style={[s.lesionNombre, !urgente && { color: tc.tinta }, urgente && s.lesionNombreUrgente]}
            numberOfLines={1}
          >
            {lesion.jugadorNombre}
          </Text>
          <Text style={[s.lesionFecha, urgente && { color: '#9A8870' }]}>
            {formatFecha(lesion.fecha)}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <GradoBadge grado={lesion.grado} />
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={13}
            color={urgente ? ORO : MUTED}
          />
        </View>
      </View>

      {expanded && (
        <View style={[s.lesionExpand, urgente && { borderTopColor: '#2A2A2A' }]}>
          <Text style={[s.expandLabel, urgente && { color: ORO }]}>DESCRIPCIÓN</Text>
          <Text style={[s.lesionDesc, urgente && { color: '#DDD5C5' }]}>
            {lesion.descripcion || '—'}
          </Text>
          <TouchableOpacity
            style={s.historialLink}
            onPress={onVerHistorial}
            activeOpacity={0.7}
          >
            <Text style={s.historialLinkTexto}>VER HISTORIAL DEL JUGADOR</Text>
            <Ionicons name="arrow-forward" size={11} color={ORO} />
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  )
}

// ─── Vista historial ──────────────────────────────────────────────────────────

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
    <SafeAreaView style={s.container}>
      <View style={s.historialHeader}>
        <TouchableOpacity onPress={onVolver} style={s.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={ORO} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.labelHeader}>HISTORIAL · LESIONES</Text>
          <Text style={s.titulo} numberOfLines={1}>{jugador.nombre_completo}</Text>
        </View>
      </View>
      <View style={s.separador} />

      {cargando ? (
        <View style={s.centrado}>
          <ActivityIndicator color={ORO} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.lista}>
          <View style={s.seccionHeader}>
            <Text style={s.seccionLabel}>REGISTRADAS</Text>
            <Text style={s.seccionConteo}>{lesiones.length}</Text>
          </View>
          {lesiones.length === 0 ? (
            <Text style={s.emptyTexto}>Sin lesiones registradas para este jugador.</Text>
          ) : (
            lesiones.map(l => {
              const urgente = l.grado >= 3
              return (
                <View
                  key={l.id}
                  style={[s.lesionCard, urgente && s.lesionCardUrgente]}
                >
                  <View style={s.lesionCabeza}>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={[s.lesionNombre, urgente && s.lesionNombreUrgente]}>
                        {formatFecha(l.fecha)}
                      </Text>
                      <Text
                        style={[s.lesionDesc, urgente && { color: '#DDD5C5' }]}
                        numberOfLines={2}
                      >
                        {l.descripcion}
                      </Text>
                    </View>
                    <GradoBadge grado={l.grado} />
                  </View>
                </View>
              )
            })
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
    <View style={s.tabSwitcher}>
      {(['lesiones', 'protocolos'] as Tab[]).map(t => {
        const activo = tab === t
        return (
          <TouchableOpacity
            key={t}
            style={[s.tabBtn, activo && s.tabBtnActivo]}
            onPress={() => onChange(t)}
            activeOpacity={0.8}
          >
            <Text style={[s.tabBtnTexto, activo && s.tabBtnTextoActivo]}>
              {t === 'lesiones' ? 'LESIONES' : 'PROTOCOLOS UAR'}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

// ─── Vista protocolos ─────────────────────────────────────────────────────────

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
  loadingP: boolean
  abriendo: string | null
  onAbrir: (p: Protocolo) => void
}) {
  if (loadingP) {
    return (
      <View style={s.centrado}>
        <ActivityIndicator color={ORO} size="large" />
      </View>
    )
  }
  if (protocolos.length === 0) {
    return (
      <View style={s.centrado}>
        <Text style={s.emptyTexto}>Sin protocolos cargados.</Text>
        <Text style={[s.mutedTexto, { marginTop: 4 }]}>La Subcomisión los publica aquí.</Text>
      </View>
    )
  }
  const grupos = agruparPorGrado(protocolos)
  return (
    <ScrollView contentContainerStyle={[s.lista, { paddingBottom: 40 }]}>
      {grupos.map(({ grado, items }) => {
        const color = grado === null ? ORO : (GRADO_COLOR_P[grado] ?? MUTED)
        const label = grado === null ? 'GENERAL' : `GRADO ${grado}`
        return (
          <View key={String(grado)}>
            <View style={[s.seccionHeader, { marginTop: 8 }]}>
              <Text style={[s.seccionLabel, { color }]}>{label}</Text>
              <Text style={s.seccionConteo}>{items.length}</Text>
            </View>
            {items.map(p => {
              const esAbriendo = abriendo === p.id
              return (
                <TouchableOpacity
                  key={p.id}
                  style={s.lesionCard}
                  onPress={() => onAbrir(p)}
                  activeOpacity={0.75}
                  disabled={esAbriendo}
                >
                  <View style={s.lesionCabeza}>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={s.lesionNombre} numberOfLines={1}>{p.titulo}</Text>
                      {p.nombre_archivo && (
                        <Text style={s.lesionFecha} numberOfLines={1}>{p.nombre_archivo}</Text>
                      )}
                    </View>
                    {esAbriendo
                      ? <ActivityIndicator size="small" color={ORO} />
                      : (
                        <View style={s.docIconWrap}>
                          <Ionicons name="document-outline" size={16} color={ORO} />
                        </View>
                      )
                    }
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>
        )
      })}
    </ScrollView>
  )
}

// ─── Selector de jugador con búsqueda ─────────────────────────────────────────

function SelectorJugador({
  jugadores,
  seleccionado,
  onSelect,
}: {
  jugadores: JugadorOpcion[]
  seleccionado: JugadorOpcion | null
  onSelect: (j: JugadorOpcion) => void
}) {
  const { colors: tc } = useTheme()
  const [busqueda, setBusqueda] = useState('')
  const filtrados = busqueda.trim()
    ? jugadores.filter(j =>
        j.nombre_completo.toLowerCase().includes(busqueda.toLowerCase())
      )
    : jugadores

  return (
    <View style={{ gap: 8 }}>
      <View style={[s.buscadorWrap, { backgroundColor: tc.card, borderColor: tc.grisClaro }]}>
        <Ionicons name="search" size={14} color={MUTED} style={{ marginRight: 8 }} />
        <TextInput
          style={[s.buscadorInput, { color: tc.tinta }]}
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Buscar jugador..."
          placeholderTextColor={MUTED}
        />
      </View>
      <View style={{ gap: 4 }}>
        {filtrados.map(j => {
          const activo = seleccionado?.id === j.id
          return (
            <TouchableOpacity
              key={j.id}
              style={[s.jugItem, { borderColor: tc.grisClaro }, activo && s.jugItemActivo]}
              onPress={() => onSelect(j)}
              activeOpacity={0.75}
            >
              <Text
                style={[s.jugItemTexto, !activo && { color: tc.tinta }, activo && s.jugItemTextoActivo]}
                numberOfLines={1}
              >
                {j.nombre_completo}
              </Text>
              {activo && <Ionicons name="checkmark" size={16} color={ORO} />}
            </TouchableOpacity>
          )
        })}
        {filtrados.length === 0 && (
          <Text style={s.emptyTexto}>Sin resultados.</Text>
        )}
      </View>
    </View>
  )
}

// ─── Selector de grado ────────────────────────────────────────────────────────

function SelectorGrado({
  grado,
  onSelect,
}: {
  grado: number | null
  onSelect: (g: number) => void
}) {
  return (
    <View style={s.gradoRow}>
      {[1, 2, 3, 4, 5].map(g => {
        const activo = grado === g
        return (
          <TouchableOpacity
            key={g}
            style={[
              s.gradoBtn,
              activo
                ? { backgroundColor: TINTA, borderColor: TINTA }
                : { backgroundColor: 'transparent', borderColor: DIVIDER },
            ]}
            onPress={() => onSelect(g)}
            activeOpacity={0.75}
          >
            <Text style={[s.gradoBtnTexto, { color: activo ? ORO : MUTED }]}>{g}</Text>
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
  const { colors: tc } = useTheme()

  const [tabActivo, setTabActivo]   = useState<Tab>('lesiones')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (loading) {
    return (
      <SafeAreaView style={[s.centrado, { backgroundColor: tc.fondo }]}>
        <ActivityIndicator color={ORO} size="large" />
      </SafeAreaView>
    )
  }

  if (sinDivision) {
    return (
      <SafeAreaView style={[s.centrado, { backgroundColor: tc.fondo }]}>
        <Text style={s.mutedTexto}>Sin división asignada.</Text>
        <Text style={s.mutedTexto}>Contactá a la Subcomisión.</Text>
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
    <SafeAreaView style={[s.container, { backgroundColor: tc.fondo }]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.labelHeader}>ENTRENADOR · {divisionNombre.toUpperCase()}</Text>
        <Text style={[s.titulo, { color: tc.tinta }]}>Lesiones</Text>
      </View>
      <View style={[s.separador, { backgroundColor: tc.grisClaro }]} />

      {/* Tab switcher */}
      <TabSwitcher tab={tabActivo} onChange={setTabActivo} />
      <View style={[s.separador, { backgroundColor: tc.grisClaro }]} />

      {/* Vista protocolos */}
      {tabActivo === 'protocolos' && (
        <ProtocolosEntrenador
          protocolos={protocolos}
          loadingP={loadingP}
          abriendo={abriendo}
          onAbrir={abrirProtocolo}
        />
      )}

      {/* Vista lesiones */}
      {tabActivo === 'lesiones' && (
        <>
          <ScrollView contentContainerStyle={s.lista}>
            <View style={s.seccionHeader}>
              <Text style={s.seccionLabel}>ACTIVAS</Text>
              <Text style={s.seccionConteo}>{lesiones.length}</Text>
            </View>

            {lesiones.length === 0 ? (
              <Text style={s.emptyTexto}>Sin lesiones registradas.</Text>
            ) : (
              lesiones.map(l => (
                <FilaLesion
                  key={l.id}
                  lesion={l}
                  expanded={expandedId === l.id}
                  onToggle={() =>
                    setExpandedId(prev => (prev === l.id ? null : l.id))
                  }
                  onVerHistorial={() =>
                    verHistorial({ id: l.jugador_id, nombre_completo: l.jugadorNombre })
                  }
                />
              ))
            )}
          </ScrollView>

          {/* FAB */}
          <View style={s.fabWrap}>
            <TouchableOpacity style={s.fab} onPress={abrirModal} activeOpacity={0.85}>
              <Text style={s.fabTexto}>+ LESIÓN</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Modal nueva lesión */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <SafeAreaView style={[s.modalContainer, { backgroundColor: tc.fondo }]}>
            {/* Header modal */}
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalSuper}>REGISTRAR</Text>
                <Text style={[s.modalTitulo, { color: tc.tinta }]}>Nueva lesión</Text>
              </View>
              <TouchableOpacity
                onPress={cerrarModal}
                disabled={guardando}
                activeOpacity={0.7}
                style={s.modalClose}
              >
                <Ionicons name="close" size={20} color={MUTED} />
              </TouchableOpacity>
            </View>
            <View style={[s.separador, { backgroundColor: tc.grisClaro }]} />

            <ScrollView
              contentContainerStyle={s.modalScroll}
              keyboardShouldPersistTaps="handled"
            >
              {/* Jugador */}
              <View style={s.campo}>
                <Text style={s.campoLabel}>JUGADOR</Text>
                {jugadores.length === 0 ? (
                  <Text style={s.mutedTexto}>No hay jugadores activos.</Text>
                ) : (
                  <SelectorJugador
                    jugadores={jugadores}
                    seleccionado={jugadorSeleccionado}
                    onSelect={setJugadorSeleccionado}
                  />
                )}
              </View>

              {/* Grado */}
              <View style={s.campo}>
                <Text style={s.campoLabel}>GRADO · 1 leve — 5 grave</Text>
                <SelectorGrado grado={grado} onSelect={setGrado} />
              </View>

              {/* Descripción */}
              <View style={s.campo}>
                <Text style={s.campoLabel}>DESCRIPCIÓN</Text>
                <TextInput
                  style={[s.inputDesc, { color: tc.tinta }]}
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
              <View style={s.campo}>
                <DatePickerField
                  label="FECHA"
                  value={fecha}
                  onChange={setFecha}
                  maximumDate={new Date()}
                />
              </View>

              {/* Error */}
              {error && (
                <View style={s.bannerError}>
                  <Text style={s.bannerErrorTexto}>{error}</Text>
                </View>
              )}

              {/* Éxito */}
              {guardadoOk && (
                <View style={s.bannerOk}>
                  <Text style={s.bannerOkTexto}>LESIÓN REGISTRADA</Text>
                  <Text style={s.bannerOkSub}>Se notificará a la Subcomisión</Text>
                </View>
              )}

              {/* Botón guardar */}
              {!guardadoOk && (
                <TouchableOpacity
                  style={[s.botonPrincipal, guardando && { opacity: 0.6 }]}
                  onPress={guardarLesion}
                  disabled={guardando}
                  activeOpacity={0.85}
                >
                  {guardando
                    ? <ActivityIndicator color={ORO} size="small" />
                    : <Text style={s.botonPrincipalTexto}>REGISTRAR LESIÓN</Text>
                  }
                </TouchableOpacity>
              )}

              {/* Cerrar post-guardado */}
              {guardadoOk && (
                <TouchableOpacity
                  style={s.botonSecundario}
                  onPress={cerrarModal}
                  activeOpacity={0.85}
                >
                  <Text style={s.botonSecundarioTexto}>CERRAR</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: PAPEL },
  centrado:   { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: PAPEL, gap: 8 },
  mutedTexto: { color: MUTED, fontSize: 13, fontFamily: fonts.cuerpo, fontStyle: 'italic', textAlign: 'center' },

  // Header principal (columna)
  header:      { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  labelHeader: { fontSize: 10, letterSpacing: 2, color: ORO, fontFamily: fonts.label, marginBottom: 4 },
  titulo:      { fontSize: 32, fontStyle: 'italic', fontFamily: fonts.titulo, color: TINTA, lineHeight: 38 },
  separador:   { height: 1, backgroundColor: DIVIDER, marginHorizontal: 20 },

  // Header historial (fila con back)
  historialHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16, gap: 8 },
  backBtn:         { padding: 4, marginRight: 2 },

  // Tabs
  tabSwitcher:       { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  tabBtn:            { flex: 1, paddingVertical: 9, borderRadius: 2, borderWidth: 1.5, borderColor: DIVIDER, alignItems: 'center' },
  tabBtnActivo:      { backgroundColor: TINTA, borderColor: TINTA },
  tabBtnTexto:       { fontSize: 10, letterSpacing: 1.5, color: MUTED, fontFamily: fonts.label, fontWeight: '700' },
  tabBtnTextoActivo: { color: ORO },

  // Lista
  lista:         { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120, gap: 10 },
  seccionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  seccionLabel:  { fontSize: 10, letterSpacing: 2, color: ORO, fontFamily: fonts.label },
  seccionConteo: { fontSize: 13, color: MUTED, fontWeight: '600' },
  emptyTexto:    { color: MUTED, fontSize: 14, fontStyle: 'italic', fontFamily: fonts.cuerpo },

  // Tarjeta lesión
  lesionCard:          { borderWidth: 1, borderColor: DIVIDER, borderRadius: 4, padding: 14, backgroundColor: PAPEL },
  lesionCardUrgente:   { backgroundColor: TINTA, borderColor: TINTA },
  lesionCabeza:        { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  lesionNombre:        { fontSize: 15, fontWeight: '700', color: TINTA, fontFamily: fonts.cuerpo },
  lesionNombreUrgente: { color: ORO },
  lesionFecha:         { fontSize: 11, color: MUTED, fontFamily: fonts.label, letterSpacing: 0.5 },
  lesionDesc:          { fontSize: 13, color: TINTA, lineHeight: 20, fontFamily: fonts.cuerpo },

  // Expansión
  lesionExpand:       { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: DIVIDER, gap: 6 },
  expandLabel:        { fontSize: 9, letterSpacing: 2, color: ORO_HONDO, fontFamily: fonts.label },
  historialLink:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, alignSelf: 'flex-start' },
  historialLinkTexto: { fontSize: 9, letterSpacing: 2, color: ORO, fontFamily: fonts.label },

  // Badge de grado
  gradoBadge:     { borderRadius: 3, paddingHorizontal: 8, paddingVertical: 3 },
  gradoBadgeTexto:{ color: '#FFFFFF', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, fontFamily: fonts.label },

  // FAB dorado
  fabWrap: { position: 'absolute', bottom: 24, left: 16, right: 16 },
  fab:     { backgroundColor: ORO, paddingVertical: 15, borderRadius: 3, alignItems: 'center' },
  fabTexto:{ color: TINTA, fontSize: 11, letterSpacing: 2.5, fontFamily: fonts.label, fontWeight: '700' },

  // Protocolo — ícono de documento
  docIconWrap: { width: 30, height: 30, borderRadius: 2, borderWidth: 1, borderColor: ORO, alignItems: 'center', justifyContent: 'center' },

  // Modal
  modalContainer: { flex: 1, backgroundColor: PAPEL },
  modalHeader:    { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 18 },
  modalSuper:     { fontSize: 10, letterSpacing: 2, color: ORO, fontFamily: fonts.label, marginBottom: 4 },
  modalTitulo:    { fontSize: 26, fontStyle: 'italic', fontFamily: fonts.titulo, color: TINTA },
  modalClose:     { padding: 4, marginTop: 4 },
  modalScroll:    { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40, gap: 20 },

  // Campos
  campo:     { gap: 10 },
  campoLabel:{ fontSize: 10, letterSpacing: 2, color: ORO, fontFamily: fonts.label },

  // Input descripción: borde inferior dorado únicamente
  inputDesc: {
    borderBottomWidth: 1.5,
    borderBottomColor: ORO,
    paddingVertical: 10,
    paddingHorizontal: 0,
    fontSize: 14,
    color: TINTA,
    fontFamily: fonts.cuerpo,
    minHeight: 72,
  },

  // Buscador de jugador
  buscadorWrap:  { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: DIVIDER, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 8 },
  buscadorInput: { flex: 1, fontSize: 14, color: TINTA, fontFamily: fonts.cuerpo },

  // Selector de jugador
  jugItem:            { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: DIVIDER, borderRadius: 3, paddingHorizontal: 12, paddingVertical: 10 },
  jugItemActivo:      { borderColor: ORO, backgroundColor: '#FBF6EA' },
  jugItemTexto:       { flex: 1, fontSize: 14, color: TINTA, fontFamily: fonts.cuerpo },
  jugItemTextoActivo: { color: ORO_HONDO, fontWeight: '700' },

  // Selector de grado
  gradoRow:     { flexDirection: 'row', gap: 8 },
  gradoBtn:     { flex: 1, aspectRatio: 1, borderRadius: 4, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  gradoBtnTexto:{ fontSize: 16, fontWeight: '700', fontFamily: fonts.label },

  // Banners
  bannerError:      { backgroundColor: '#FEF2F2', borderLeftWidth: 3, borderLeftColor: ROJO, borderRadius: 4, padding: 12 },
  bannerErrorTexto: { fontSize: 13, color: '#991B1B', fontFamily: fonts.cuerpo },
  bannerOk:         { backgroundColor: TINTA, borderLeftWidth: 3, borderLeftColor: ORO, borderRadius: 4, padding: 14, gap: 4 },
  bannerOkTexto:    { fontSize: 13, color: ORO, fontWeight: '700', fontFamily: fonts.label, letterSpacing: 1.5 },
  bannerOkSub:      { fontSize: 12, color: '#9A8870', fontFamily: fonts.cuerpo },

  // Botones
  botonPrincipal:       { backgroundColor: TINTA, paddingVertical: 15, borderRadius: 3, alignItems: 'center' },
  botonPrincipalTexto:  { color: ORO, fontSize: 11, letterSpacing: 2.5, fontFamily: fonts.label, fontWeight: '700' },
  botonSecundario:      { borderWidth: 1.5, borderColor: ORO, paddingVertical: 12, borderRadius: 3, alignItems: 'center' },
  botonSecundarioTexto: { color: ORO, fontSize: 11, letterSpacing: 2.5, fontFamily: fonts.label, fontWeight: '700' },
})
