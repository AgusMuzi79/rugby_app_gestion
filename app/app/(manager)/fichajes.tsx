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

// ─── Tokens ───────────────────────────────────────────────────────────────────

const FONDO     = '#15110A'
const CARD      = '#1C1710'
const TEXTO     = '#F3EFE4'
const MUTED     = '#8E8574'
const DIVIDER   = '#2C2418'
const ORO       = colors.oro
const ORO_HONDO = colors.oroHondo
const ROJO      = colors.rojoUrgente
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

// ─── FilaJugador ─────────────────────────────────────────────────────────────

function FilaJugador({
  jugador, index, onPress,
}: {
  jugador: JugadorFichado; index: number; onPress: (j: JugadorFichado) => void
}) {
  const numero = String(index + 1).padStart(2, '0')
  return (
    <TouchableOpacity style={s.fila} onPress={() => onPress(jugador)} activeOpacity={0.8}>
      <Text style={s.filaNumero}>{numero}</Text>
      <View style={s.filaInfo}>
        <Text style={s.filaNombre} numberOfLines={1}>{jugador.nombre_completo}</Text>
        {jugador.posicion ? (
          <Text style={s.filaPosicion}>{jugador.posicion.toUpperCase()}</Text>
        ) : null}
      </View>
      <View style={s.filaRight}>
        <Text style={s.filaFecha}>{formatFecha(jugador.fecha_fichaje)}</Text>
        <View style={s.okBadge}>
          <Text style={s.okBadgeTexto}>OK</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={13} color={MUTED} style={s.chevronMl} />
    </TouchableOpacity>
  )
}

// ─── DocumentoFila ────────────────────────────────────────────────────────────

function DocumentoFila({
  doc, abriendoDoc, onAbrir,
}: {
  doc: DocumentoFichaje; abriendoDoc: string | null; onAbrir: (path: string) => void
}) {
  const tipo  = doc.tipo as TipoDocumento
  // color is truly dynamic (per tipo from data) — keep inline
  const color = TIPO_COLOR[tipo] ?? MUTED
  const abriendo = abriendoDoc === doc.storage_path
  return (
    <View style={s.docFila}>
      <View style={[s.docIconWrap, { borderColor: color }]}>
        <Ionicons name="document-outline" size={16} color={color} />
      </View>
      <View style={s.docInfo}>
        <View style={s.docTipoRow}>
          <Text style={[s.docTipo, { color }]}>{TIPO_LABEL[tipo] ?? doc.tipo}</Text>
        </View>
        <Text style={s.docNombre} numberOfLines={1}>
          {doc.nombre_archivo ?? 'Archivo'}
        </Text>
        <Text style={s.docFecha}>{formatFecha(doc.created_at.split('T')[0])}</Text>
      </View>
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

// ─── SelectorTipo ────────────────────────────────────────────────────────────

function SelectorTipo({
  seleccionado, onSelect,
}: {
  seleccionado: TipoDocumento | null; onSelect: (t: TipoDocumento) => void
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

// ─── Screen ───────────────────────────────────────────────────────────────────

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

  if (loading) {
    return (
      <SafeAreaView style={s.centrado}>
        <ActivityIndicator color={ORO} size="large" />
      </SafeAreaView>
    )
  }

  if (sinDivision) {
    return (
      <SafeAreaView style={s.centrado}>
        <Text style={s.mutedTexto}>Sin división asignada.</Text>
        <Text style={s.mutedTexto}>Contactá a la Subcomisión.</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.labelHeader}>MANAGER · {divisionNombre.toUpperCase()}</Text>
        <View style={s.tituloRow}>
          <Text style={s.titulo}>Fichajes</Text>
          {jugadores.length > 0 && (
            <Text style={s.tituloConteo}>{jugadores.length} fichados</Text>
          )}
        </View>
      </View>
      <View style={s.separador} />

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
              <View style={s.jugadoresWrap}>
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
          <TouchableOpacity style={s.volverBtn} onPress={volverALista} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={16} color={ORO} />
            <Text style={s.volverTexto}>Fichajes</Text>
          </TouchableOpacity>

          <View style={s.detalleNombreWrap}>
            <Text style={s.detalleNombre}>{jugadorDetalle.nombre_completo}</Text>
          </View>
          <View style={s.separador} />

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
                  <Text style={s.infoValor}>{valor}</Text>
                </View>
              ) : null,
            )}
          </View>
          <View style={s.separador} />

          <View style={s.seccionDetalle}>
            <Text style={s.seccionLabel}>DOCUMENTACIÓN</Text>

            {cargandoDetalle ? (
              <ActivityIndicator color={ORO} style={s.activityMt} />
            ) : jugadorDetalle.documentos.length === 0 ? (
              <Text style={s.emptyTexto}>Sin documentos cargados.</Text>
            ) : (
              <View style={s.docsWrap}>
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
          <View style={s.separador} />

          <View style={s.seccionDetalle}>
            <Text style={s.seccionLabel}>SUBIR DOCUMENTO</Text>
            <SelectorTipo seleccionado={tipoSeleccionado} onSelect={setTipoSeleccionado} />

            {tipoSeleccionado && (
              <TouchableOpacity
                style={[s.botonSubir, subiendo && s.botonSubirOff]}
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
          style={s.kavFlex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <SafeAreaView style={s.modalContainer}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalSuper}>NUEVO</Text>
                <Text style={s.modalTitulo}>Fichaje</Text>
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
            <View style={s.separador} />

            <ScrollView
              contentContainerStyle={s.modalScroll}
              keyboardShouldPersistTaps="handled"
            >
              <View style={s.campo}>
                <Text style={s.campoLabel}>NOMBRE COMPLETO</Text>
                <TextInput
                  style={s.inputLinea}
                  value={nombre}
                  onChangeText={setNombre}
                  placeholder="Apellido y nombre"
                  placeholderTextColor={MUTED}
                  autoCapitalize="words"
                />
              </View>

              <View style={s.campo}>
                <Text style={s.campoLabel}>DNI</Text>
                <TextInput
                  style={s.inputLinea}
                  value={dni}
                  onChangeText={setDni}
                  placeholder="40000001"
                  placeholderTextColor={MUTED}
                  keyboardType="number-pad"
                  maxLength={12}
                />
              </View>

              <View style={s.campo}>
                <DatePickerField
                  label="FECHA DE NACIMIENTO"
                  value={fechaNacimiento}
                  onChange={setFechaNacimiento}
                  maximumDate={new Date()}
                />
              </View>

              <View style={s.campo}>
                <Text style={s.campoLabel}>POSICIÓN (opcional)</Text>
                <TextInput
                  style={s.inputLinea}
                  value={posicion}
                  onChangeText={setPosicion}
                  placeholder="Apertura, Pilar, Hooker..."
                  placeholderTextColor={MUTED}
                  autoCapitalize="sentences"
                />
              </View>

              {errorForm && (
                <View style={s.bannerError}>
                  <Text style={s.bannerErrorTexto}>{errorForm}</Text>
                </View>
              )}

              {guardadoFichajeOk && (
                <View style={s.bannerOk}>
                  <Text style={s.bannerOkTexto}>FICHAJE REGISTRADO</Text>
                  <Text style={s.bannerOkSub}>Se notificará a la Subcomisión</Text>
                </View>
              )}

              {!guardadoFichajeOk && (
                <TouchableOpacity
                  style={[s.botonPrincipal, guardandoFichaje && s.botonPrincipalOff]}
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
  container:  { flex: 1, backgroundColor: FONDO },
  centrado:   { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: FONDO, gap: 8 },
  mutedTexto: { fontFamily: fonts.cuerpo, color: MUTED, fontSize: 13, fontStyle: 'italic', textAlign: 'center' },

  // Header
  header:       { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  labelHeader:  { fontFamily: fonts.label, fontSize: 10, letterSpacing: 2, color: ORO, marginBottom: 4 },
  tituloRow:    { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  titulo:       { fontFamily: fonts.titulo, fontSize: 32, color: TEXTO, lineHeight: 38 },
  tituloConteo: { fontFamily: fonts.label, fontSize: 13, color: MUTED, letterSpacing: 0.5 },
  separador:    { height: 1, backgroundColor: DIVIDER, marginHorizontal: 20 },

  // Lista
  lista:         { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120 },
  seccionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seccionLabel:  { fontFamily: fonts.label, fontSize: 10, letterSpacing: 2, color: ORO },
  seccionConteo: { fontFamily: fonts.cuerpo, fontSize: 13, color: MUTED, fontWeight: '600' },
  emptyTexto:    { fontFamily: fonts.cuerpo, color: MUTED, fontSize: 14, fontStyle: 'italic', marginTop: 12 },
  filaDiv:       { height: 1, backgroundColor: DIVIDER },
  jugadoresWrap: { marginTop: 8 },

  // Fila de jugador
  fila:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 10 },
  filaNumero:  { fontFamily: fonts.label, fontSize: 11, color: MUTED, width: 22, textAlign: 'right' },
  filaInfo:    { flex: 1, gap: 3 },
  filaNombre:  { fontFamily: fonts.cuerpo, fontSize: 15, fontWeight: '700', color: TEXTO },
  filaPosicion:{ fontFamily: fonts.label, fontSize: 10, color: MUTED, letterSpacing: 1 },
  filaRight:   { alignItems: 'flex-end', gap: 4 },
  filaFecha:   { fontFamily: fonts.label, fontSize: 10, color: MUTED, letterSpacing: 0.3 },
  chevronMl:   { marginLeft: 4 },

  // Badge OK
  okBadge:     { backgroundColor: ORO, borderRadius: 2, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-end' },
  okBadgeTexto:{ fontFamily: fonts.label, fontSize: 9, fontWeight: '700', color: FONDO, letterSpacing: 1 },

  // FAB
  fabWrap: { position: 'absolute', bottom: 24, left: 16, right: 16 },
  fab:     { backgroundColor: ORO, paddingVertical: 15, borderRadius: 3, alignItems: 'center' },
  fabTexto:{ fontFamily: fonts.label, color: FONDO, fontSize: 11, letterSpacing: 2.5, fontWeight: '700' },

  // Volver
  volverBtn:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, gap: 4 },
  volverTexto:{ fontFamily: fonts.label, fontSize: 13, color: ORO, letterSpacing: 0.5 },

  // Detalle
  detalleScroll:     { paddingBottom: 48 },
  detalleNombreWrap: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 18 },
  detalleNombre:     { fontFamily: fonts.titulo, fontSize: 28, color: TEXTO, lineHeight: 34 },
  infoSection:       { paddingHorizontal: 20, paddingVertical: 16, gap: 12 },
  infoFila:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoLabel:         { fontFamily: fonts.label, fontSize: 9, letterSpacing: 2, color: MUTED, width: 90 },
  infoValor:         { fontFamily: fonts.cuerpo, fontSize: 14, color: TEXTO, flex: 1, textAlign: 'right' },
  seccionDetalle:    { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 4, gap: 12 },
  activityMt:        { marginTop: 12 },
  docsWrap:          { marginTop: 4 },

  // Documento fila
  docFila:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  docIconWrap: { width: 34, height: 34, borderRadius: 3, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  docInfo:     { flex: 1, gap: 2 },
  docTipoRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  docTipo:     { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1.5, fontWeight: '700' },
  docNombre:   { fontFamily: fonts.cuerpo, fontSize: 13, color: TEXTO, fontWeight: '600' },
  docFecha:    { fontFamily: fonts.label, fontSize: 10, color: MUTED },
  abrirBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: ORO, borderRadius: 2, paddingHorizontal: 8, paddingVertical: 5, minWidth: 60, justifyContent: 'center' },
  abrirBtnTexto: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1.5, color: ORO, fontWeight: '700' },

  // Selector tipo
  tipoRow:            { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  tipoBtn:            { borderWidth: 1, borderColor: DIVIDER, borderRadius: 3, paddingHorizontal: 12, paddingVertical: 8 },
  tipoBtnActivo:      { borderColor: ORO, backgroundColor: CARD },
  tipoBtnTexto:       { fontFamily: fonts.label, fontSize: 10, letterSpacing: 1, color: MUTED, fontWeight: '700' },
  tipoBtnTextoActivo: { color: ORO_HONDO },

  // Botón subir
  botonSubir:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: ORO, paddingVertical: 12, borderRadius: 3 },
  botonSubirOff:   { opacity: 0.6 },
  botonSubirTexto: { fontFamily: fonts.label, color: ORO, fontSize: 10, letterSpacing: 2, fontWeight: '700' },

  // Banners
  bannerError:      { backgroundColor: '#2A1010', borderLeftWidth: 3, borderLeftColor: ROJO, borderRadius: 4, padding: 12 },
  bannerErrorTexto: { fontFamily: fonts.cuerpo, fontSize: 13, color: '#FFAAAA' },
  bannerOk:         { backgroundColor: TEXTO, borderLeftWidth: 3, borderLeftColor: ORO, borderRadius: 4, padding: 14, gap: 4 },
  bannerOkTexto:    { fontFamily: fonts.label, fontSize: 11, color: ORO, fontWeight: '700', letterSpacing: 2 },
  bannerOkSub:      { fontFamily: fonts.cuerpo, fontSize: 12, color: MUTED },

  // Modal
  kavFlex:        { flex: 1 },
  modalContainer: { flex: 1, backgroundColor: FONDO },
  modalHeader:    { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 18 },
  modalSuper:     { fontFamily: fonts.label, fontSize: 10, letterSpacing: 2, color: ORO, marginBottom: 4 },
  modalTitulo:    { fontFamily: fonts.titulo, fontSize: 26, color: TEXTO },
  modalClose:     { padding: 4, marginTop: 4 },
  modalScroll:    { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48, gap: 24 },
  campo:          { gap: 10 },
  campoLabel:     { fontFamily: fonts.label, fontSize: 10, letterSpacing: 2, color: ORO },
  inputLinea:     { borderBottomWidth: 1.5, borderBottomColor: ORO, paddingVertical: 10, fontFamily: fonts.cuerpo, fontSize: 15, color: TEXTO },

  // Botones
  botonPrincipal:       { backgroundColor: TEXTO, paddingVertical: 15, borderRadius: 3, alignItems: 'center' },
  botonPrincipalOff:    { opacity: 0.6 },
  botonPrincipalTexto:  { fontFamily: fonts.label, color: ORO, fontSize: 11, letterSpacing: 2.5, fontWeight: '700' },
  botonSecundario:      { borderWidth: 1.5, borderColor: ORO, paddingVertical: 12, borderRadius: 3, alignItems: 'center' },
  botonSecundarioTexto: { fontFamily: fonts.label, color: ORO, fontSize: 11, letterSpacing: 2.5, fontWeight: '700' },
})
