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
import {
  useFichajes,
  JugadorFichado,
  DocumentoFichaje,
  TipoDocumento,
} from '@/hooks/useFichajes'
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
const VERDE     = '#4A7C59'

const TIPO_LABEL: Record<TipoDocumento, string> = {
  dni:          'DNI',
  ficha_medica: 'FICHA MÉD.',
  otro:         'OTRO',
}

const TIPO_COLOR: Record<TipoDocumento, string> = {
  dni:          ORO,
  ficha_medica: VERDE,
  otro:         MUTED,
}

function formatFecha(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

// ─── Fila de jugador en lista ─────────────────────────────────────────────────

function FilaJugador({
  jugador,
  index,
  onPress,
}: {
  jugador: JugadorFichado
  index: number
  onPress: (j: JugadorFichado) => void
}) {
  const { colors: tc } = useTheme()
  const numero = String(index + 1).padStart(2, '0')
  return (
    <TouchableOpacity style={s.fila} onPress={() => onPress(jugador)} activeOpacity={0.8}>
      <Text style={s.filaNumero}>{numero}</Text>
      <View style={s.filaInfo}>
        <Text style={[s.filaNombre, { color: tc.tinta }]} numberOfLines={1}>{jugador.nombre_completo}</Text>
        {jugador.posicion ? (
          <Text style={s.filaPosicion}>{jugador.posicion.toUpperCase()}</Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={s.filaFecha}>{formatFecha(jugador.fecha_fichaje)}</Text>
        <View style={s.okBadge}>
          <Text style={s.okBadgeTexto}>OK</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={13} color={MUTED} style={{ marginLeft: 4 }} />
    </TouchableOpacity>
  )
}

// ─── Fila de documento ────────────────────────────────────────────────────────

function DocumentoFila({
  doc,
  abriendoDoc,
  onAbrir,
}: {
  doc: DocumentoFichaje
  abriendoDoc: string | null
  onAbrir: (path: string) => void
}) {
  const { colors: tc } = useTheme()
  const tipo  = doc.tipo as TipoDocumento
  const color = TIPO_COLOR[tipo] ?? MUTED
  const abriendo = abriendoDoc === doc.storage_path
  return (
    <View style={s.docFila}>
      {/* Ícono */}
      <View style={[s.docIconWrap, { borderColor: color }]}>
        <Ionicons name="document-outline" size={16} color={color} />
      </View>
      {/* Info */}
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[s.docTipo, { color }]}>{TIPO_LABEL[tipo] ?? doc.tipo}</Text>
        </View>
        <Text style={[s.docNombre, { color: tc.tinta }]} numberOfLines={1}>
          {doc.nombre_archivo ?? 'Archivo'}
        </Text>
        <Text style={s.docFecha}>{formatFecha(doc.created_at.split('T')[0])}</Text>
      </View>
      {/* Botón abrir */}
      <TouchableOpacity
        style={s.abrirBtn}
        onPress={() => onAbrir(doc.storage_path)}
        disabled={abriendo}
        activeOpacity={0.75}
      >
        {abriendo
          ? <ActivityIndicator size="small" color={ORO} />
          : (
            <>
              <Text style={s.abrirBtnTexto}>ABRIR</Text>
              <Ionicons name="open-outline" size={11} color={ORO} />
            </>
          )
        }
      </TouchableOpacity>
    </View>
  )
}

// ─── Selector tipo documento ──────────────────────────────────────────────────

function SelectorTipo({
  seleccionado,
  onSelect,
}: {
  seleccionado: TipoDocumento | null
  onSelect: (t: TipoDocumento) => void
}) {
  const tipos: TipoDocumento[] = ['dni', 'ficha_medica', 'otro']
  return (
    <View style={s.tipoRow}>
      {tipos.map(t => {
        const activo = seleccionado === t
        return (
          <TouchableOpacity
            key={t}
            style={[s.tipoBtn, activo && s.tipoBtnActivo]}
            onPress={() => onSelect(t)}
            activeOpacity={0.75}
          >
            <Text style={[s.tipoBtnTexto, activo && s.tipoBtnTextoActivo]}>
              {TIPO_LABEL[t]}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function FichajesScreen() {
  const {
    loading, divisionNombre, sinDivision,
    jugadores, paso, jugadorDetalle, cargandoDetalle,
    seleccionarJugador, volverALista,
    modalVisible, abrirModal, cerrarModal,
    nombre, setNombre, dni, setDni,
    fechaNacimiento, setFechaNacimiento,
    posicion, setPosicion,
    guardandoFichaje, guardadoFichajeOk, errorForm, guardarFichaje,
    tipoSeleccionado, setTipoSeleccionado,
    subiendo, subiendoOk, errorUpload, subirDocumento,
    abriendoDoc, abrirDocumento,
  } = useFichajes()

  const { colors: tc } = useTheme()

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

  return (
    <SafeAreaView style={[s.container, { backgroundColor: tc.fondo }]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.labelHeader}>MANAGER · {divisionNombre.toUpperCase()}</Text>
        <View style={s.tituloRow}>
          <Text style={[s.titulo, { color: tc.tinta }]}>Fichajes</Text>
          {jugadores.length > 0 && (
            <Text style={s.tituloConteo}>{jugadores.length} fichados</Text>
          )}
        </View>
      </View>
      <View style={[s.separador, { backgroundColor: tc.grisClaro }]} />

      {/* ── Paso: Lista ── */}
      {paso === 'lista' && (
        <>
          <ScrollView contentContainerStyle={s.lista}>
            <View style={s.seccionHeader}>
              <Text style={s.seccionLabel}>JUGADORES FICHADOS</Text>
              <Text style={s.seccionConteo}>{jugadores.length}</Text>
            </View>

            {jugadores.length === 0 ? (
              <Text style={s.emptyTexto}>Sin jugadores fichados aún.</Text>
            ) : (
              <View style={{ marginTop: 8 }}>
                {jugadores.map((j, i) => (
                  <View key={j.id}>
                    {i > 0 && <View style={s.filaDiv} />}
                    <FilaJugador jugador={j} index={i} onPress={seleccionarJugador} />
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          <View style={s.fabWrap}>
            <TouchableOpacity style={s.fab} onPress={abrirModal} activeOpacity={0.85}>
              <Text style={s.fabTexto}>+ NUEVO FICHAJE</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* ── Paso: Detalle jugador ── */}
      {paso === 'detalle' && jugadorDetalle && (
        <ScrollView contentContainerStyle={s.detalleScroll}>
          {/* Volver */}
          <TouchableOpacity style={s.volverBtn} onPress={volverALista} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={16} color={ORO} />
            <Text style={s.volverTexto}>Fichajes</Text>
          </TouchableOpacity>

          {/* Nombre grande */}
          <View style={s.detalleNombreWrap}>
            <Text style={[s.detalleNombre, { color: tc.tinta }]}>{jugadorDetalle.nombre_completo}</Text>
          </View>
          <View style={[s.separador, { backgroundColor: tc.grisClaro }]} />

          {/* Info rows */}
          <View style={s.infoSection}>
            {[
              { label: 'POSICIÓN',   valor: jugadorDetalle.posicion },
              { label: 'DNI',        valor: jugadorDetalle.dni },
              { label: 'NACIMIENTO', valor: formatFecha(jugadorDetalle.fecha_nacimiento) },
              { label: 'FICHADO',    valor: formatFecha(jugadorDetalle.fecha_fichaje) },
            ].map(({ label, valor }) =>
              valor ? (
                <View key={label} style={s.infoFila}>
                  <Text style={s.infoLabel}>{label}</Text>
                  <Text style={[s.infoValor, { color: tc.tinta }]}>{valor}</Text>
                </View>
              ) : null,
            )}
          </View>
          <View style={[s.separador, { backgroundColor: tc.grisClaro }]} />

          {/* Documentación */}
          <View style={s.seccionDetalle}>
            <Text style={s.seccionLabel}>DOCUMENTACIÓN</Text>

            {cargandoDetalle ? (
              <ActivityIndicator color={ORO} style={{ marginTop: 12 }} />
            ) : jugadorDetalle.documentos.length === 0 ? (
              <Text style={s.emptyTexto}>Sin documentos cargados.</Text>
            ) : (
              <View style={{ marginTop: 4 }}>
                {jugadorDetalle.documentos.map((doc, i) => (
                  <View key={doc.id}>
                    {i > 0 && <View style={s.filaDiv} />}
                    <DocumentoFila
                      doc={doc}
                      abriendoDoc={abriendoDoc}
                      onAbrir={abrirDocumento}
                    />
                  </View>
                ))}
              </View>
            )}
          </View>
          <View style={[s.separador, { backgroundColor: tc.grisClaro }]} />

          {/* Subir documento */}
          <View style={s.seccionDetalle}>
            <Text style={s.seccionLabel}>SUBIR DOCUMENTO</Text>

            <SelectorTipo seleccionado={tipoSeleccionado} onSelect={setTipoSeleccionado} />

            {tipoSeleccionado && (
              <TouchableOpacity
                style={[s.botonSubir, subiendo && { opacity: 0.6 }]}
                onPress={() => subirDocumento(tipoSeleccionado)}
                disabled={subiendo}
                activeOpacity={0.85}
              >
                {subiendo ? (
                  <ActivityIndicator color={ORO} size="small" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={16} color={ORO} />
                    <Text style={s.botonSubirTexto}>
                      SELECCIONAR — {TIPO_LABEL[tipoSeleccionado]}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {errorUpload && (
              <View style={s.bannerError}>
                <Text style={s.bannerErrorTexto}>{errorUpload}</Text>
              </View>
            )}

            {subiendoOk && (
              <View style={s.bannerOk}>
                <Text style={s.bannerOkTexto}>DOCUMENTO SUBIDO</Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* ── Modal nuevo fichaje ── */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <SafeAreaView style={[s.modalContainer, { backgroundColor: tc.fondo }]}>
            {/* Header modal */}
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalSuper}>NUEVO</Text>
                <Text style={[s.modalTitulo, { color: tc.tinta }]}>Fichaje</Text>
              </View>
              <TouchableOpacity
                onPress={cerrarModal}
                disabled={guardandoFichaje}
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
              {/* Nombre */}
              <View style={s.campo}>
                <Text style={s.campoLabel}>NOMBRE COMPLETO</Text>
                <TextInput
                  style={[s.inputLinea, { color: tc.tinta }]}
                  value={nombre}
                  onChangeText={setNombre}
                  placeholder="Apellido y nombre"
                  placeholderTextColor={MUTED}
                  autoCapitalize="words"
                />
              </View>

              {/* DNI */}
              <View style={s.campo}>
                <Text style={s.campoLabel}>DNI</Text>
                <TextInput
                  style={[s.inputLinea, { color: tc.tinta }]}
                  value={dni}
                  onChangeText={setDni}
                  placeholder="40000001"
                  placeholderTextColor={MUTED}
                  keyboardType="number-pad"
                  maxLength={12}
                />
              </View>

              {/* Fecha nacimiento */}
              <View style={s.campo}>
                <DatePickerField
                  label="FECHA DE NACIMIENTO"
                  value={fechaNacimiento}
                  onChange={setFechaNacimiento}
                  maximumDate={new Date()}
                />
              </View>

              {/* Posición */}
              <View style={s.campo}>
                <Text style={s.campoLabel}>POSICIÓN (opcional)</Text>
                <TextInput
                  style={[s.inputLinea, { color: tc.tinta }]}
                  value={posicion}
                  onChangeText={setPosicion}
                  placeholder="Apertura, Pilar, Hooker..."
                  placeholderTextColor={MUTED}
                  autoCapitalize="sentences"
                />
              </View>

              {/* Error */}
              {errorForm && (
                <View style={s.bannerError}>
                  <Text style={s.bannerErrorTexto}>{errorForm}</Text>
                </View>
              )}

              {/* Éxito */}
              {guardadoFichajeOk && (
                <View style={s.bannerOk}>
                  <Text style={s.bannerOkTexto}>FICHAJE REGISTRADO</Text>
                  <Text style={s.bannerOkSub}>Se notificará a la Subcomisión</Text>
                </View>
              )}

              {/* Guardar */}
              {!guardadoFichajeOk && (
                <TouchableOpacity
                  style={[s.botonPrincipal, guardandoFichaje && { opacity: 0.6 }]}
                  onPress={guardarFichaje}
                  disabled={guardandoFichaje}
                  activeOpacity={0.85}
                >
                  {guardandoFichaje
                    ? <ActivityIndicator color={ORO} size="small" />
                    : <Text style={s.botonPrincipalTexto}>FICHAR JUGADOR</Text>
                  }
                </TouchableOpacity>
              )}

              {/* Cerrar post-guardado */}
              {guardadoFichajeOk && (
                <TouchableOpacity style={s.botonSecundario} onPress={cerrarModal} activeOpacity={0.85}>
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

  // Header
  header:       { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  labelHeader:  { fontSize: 10, letterSpacing: 2, color: ORO, fontFamily: fonts.label, marginBottom: 4 },
  tituloRow:    { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  titulo:       { fontSize: 32, fontStyle: 'italic', fontFamily: fonts.titulo, color: TINTA, lineHeight: 38 },
  tituloConteo: { fontSize: 13, color: MUTED, fontFamily: fonts.label, letterSpacing: 0.5 },
  separador:    { height: 1, backgroundColor: DIVIDER, marginHorizontal: 20 },

  // Lista
  lista:         { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120 },
  seccionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seccionLabel:  { fontSize: 10, letterSpacing: 2, color: ORO, fontFamily: fonts.label },
  seccionConteo: { fontSize: 13, color: MUTED, fontWeight: '600' },
  emptyTexto:    { color: MUTED, fontSize: 14, fontStyle: 'italic', fontFamily: fonts.cuerpo, marginTop: 12 },
  filaDiv:       { height: 1, backgroundColor: DIVIDER },

  // Fila de jugador
  fila:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 10 },
  filaNumero:  { fontSize: 11, color: MUTED, fontFamily: fonts.label, width: 22, textAlign: 'right' },
  filaInfo:    { flex: 1, gap: 3 },
  filaNombre:  { fontSize: 15, fontWeight: '700', color: TINTA, fontFamily: fonts.cuerpo },
  filaPosicion:{ fontSize: 10, color: MUTED, fontFamily: fonts.label, letterSpacing: 1 },
  filaFecha:   { fontSize: 10, color: MUTED, fontFamily: fonts.label, letterSpacing: 0.3 },

  // Badge OK
  okBadge:     { backgroundColor: ORO, borderRadius: 2, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-end' },
  okBadgeTexto:{ fontSize: 9, fontWeight: '700', color: TINTA, fontFamily: fonts.label, letterSpacing: 1 },

  // FAB dorado
  fabWrap: { position: 'absolute', bottom: 24, left: 16, right: 16 },
  fab:     { backgroundColor: ORO, paddingVertical: 15, borderRadius: 3, alignItems: 'center' },
  fabTexto:{ color: TINTA, fontSize: 11, letterSpacing: 2.5, fontFamily: fonts.label, fontWeight: '700' },

  // Volver
  volverBtn:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, gap: 4 },
  volverTexto:{ fontSize: 13, color: ORO, fontFamily: fonts.label, letterSpacing: 0.5 },

  // Detalle — nombre grande
  detalleScroll:     { paddingBottom: 48 },
  detalleNombreWrap: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 18 },
  detalleNombre:     { fontSize: 28, fontStyle: 'italic', fontFamily: fonts.titulo, color: TINTA, lineHeight: 34 },

  // Info rows del detalle
  infoSection:{ paddingHorizontal: 20, paddingVertical: 16, gap: 12 },
  infoFila:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoLabel:  { fontSize: 9, letterSpacing: 2, color: MUTED, fontFamily: fonts.label, width: 90 },
  infoValor:  { fontSize: 14, color: TINTA, fontFamily: fonts.cuerpo, flex: 1, textAlign: 'right' },

  // Sección detalle (documentos, upload)
  seccionDetalle: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 4, gap: 12 },

  // Fila de documento
  docFila:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  docIconWrap:{ width: 34, height: 34, borderRadius: 3, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  docTipo:    { fontSize: 9, letterSpacing: 1.5, fontWeight: '700', fontFamily: fonts.label },
  docNombre:  { fontSize: 13, color: TINTA, fontFamily: fonts.cuerpo, fontWeight: '600' },
  docFecha:   { fontSize: 10, color: MUTED, fontFamily: fonts.label },

  // Botón abrir documento
  abrirBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: ORO, borderRadius: 2, paddingHorizontal: 8, paddingVertical: 5, minWidth: 60, justifyContent: 'center' },
  abrirBtnTexto: { fontSize: 9, letterSpacing: 1.5, color: ORO, fontFamily: fonts.label, fontWeight: '700' },

  // Selector tipo
  tipoRow:            { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  tipoBtn:            { borderWidth: 1, borderColor: DIVIDER, borderRadius: 3, paddingHorizontal: 12, paddingVertical: 8 },
  tipoBtnActivo:      { borderColor: ORO, backgroundColor: '#FBF6EA' },
  tipoBtnTexto:       { fontSize: 10, letterSpacing: 1, color: MUTED, fontFamily: fonts.label, fontWeight: '700' },
  tipoBtnTextoActivo: { color: ORO_HONDO },

  // Botón subir documento (borde dorado)
  botonSubir:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: ORO, paddingVertical: 12, borderRadius: 3 },
  botonSubirTexto: { color: ORO, fontSize: 10, letterSpacing: 2, fontFamily: fonts.label, fontWeight: '700' },

  // Banners
  bannerError:      { backgroundColor: '#FEF2F2', borderLeftWidth: 3, borderLeftColor: ROJO, borderRadius: 4, padding: 12 },
  bannerErrorTexto: { fontSize: 13, color: '#991B1B', fontFamily: fonts.cuerpo },
  bannerOk:         { backgroundColor: TINTA, borderLeftWidth: 3, borderLeftColor: ORO, borderRadius: 4, padding: 14, gap: 4 },
  bannerOkTexto:    { fontSize: 11, color: ORO, fontWeight: '700', fontFamily: fonts.label, letterSpacing: 2 },
  bannerOkSub:      { fontSize: 12, color: '#9A8870', fontFamily: fonts.cuerpo },

  // Modal
  modalContainer: { flex: 1, backgroundColor: PAPEL },
  modalHeader:    { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 18 },
  modalSuper:     { fontSize: 10, letterSpacing: 2, color: ORO, fontFamily: fonts.label, marginBottom: 4 },
  modalTitulo:    { fontSize: 26, fontStyle: 'italic', fontFamily: fonts.titulo, color: TINTA },
  modalClose:     { padding: 4, marginTop: 4 },
  modalScroll:    { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48, gap: 24 },

  // Campos del modal
  campo:     { gap: 10 },
  campoLabel:{ fontSize: 10, letterSpacing: 2, color: ORO, fontFamily: fonts.label },

  // Input con borde inferior dorado
  inputLinea: {
    borderBottomWidth: 1.5,
    borderBottomColor: ORO,
    paddingVertical: 10,
    paddingHorizontal: 0,
    fontSize: 15,
    color: TINTA,
    fontFamily: fonts.cuerpo,
  },

  // Botones
  botonPrincipal:       { backgroundColor: TINTA, paddingVertical: 15, borderRadius: 3, alignItems: 'center' },
  botonPrincipalTexto:  { color: ORO, fontSize: 11, letterSpacing: 2.5, fontFamily: fonts.label, fontWeight: '700' },
  botonSecundario:      { borderWidth: 1.5, borderColor: ORO, paddingVertical: 12, borderRadius: 3, alignItems: 'center' },
  botonSecundarioTexto: { color: ORO, fontSize: 11, letterSpacing: 2.5, fontFamily: fonts.label, fontWeight: '700' },
})
