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
import {
  useFichajes,
  JugadorFichado,
  JugadorDetalle,
  DocumentoFichaje,
  TipoDocumento,
} from '@/hooks/useFichajes'
import { DatePickerField } from '@/components/ui/DatePickerField'

const CREAM   = '#F5F0E8'
const GOLD    = '#C9A84C'
const DARK    = '#1A1A1A'
const DIVIDER = '#D1C9B8'
const MUTED   = '#7C7267'
const VERDE   = '#22C55E'
const ROJO    = '#EF4444'
const AZUL    = '#3B82F6'

const TIPO_LABEL: Record<TipoDocumento, string> = {
  dni:          'DNI',
  ficha_medica: 'Ficha Médica',
  otro:         'Otro',
}

const TIPO_DOC_COLOR: Record<string, string> = {
  dni:          AZUL,
  ficha_medica: VERDE,
  otro:         MUTED,
}

function formatFecha(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

// ─── Card jugador en lista ────────────────────────────────────────────────────

function JugadorCard({
  jugador,
  onPress,
}: {
  jugador: JugadorFichado
  onPress: (j: JugadorFichado) => void
}) {
  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(jugador)} activeOpacity={0.8}>
      <View style={styles.cardBody}>
        <Text style={styles.cardNombre} numberOfLines={1}>{jugador.nombre_completo}</Text>
        <View style={styles.cardRow}>
          <Text style={styles.cardMeta}>DNI {jugador.dni}</Text>
          {jugador.posicion ? (
            <Text style={styles.cardMeta}> · {jugador.posicion}</Text>
          ) : null}
        </View>
        <Text style={styles.cardSub}>Fichado el {formatFecha(jugador.fecha_fichaje)}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  )
}

// ─── Info card en detalle ─────────────────────────────────────────────────────

function InfoCard({ jugador }: { jugador: JugadorDetalle }) {
  const filas: Array<{ label: string; valor: string | null }> = [
    { label: 'DNI',         valor: jugador.dni },
    { label: 'NACIMIENTO',  valor: formatFecha(jugador.fecha_nacimiento) },
    { label: 'POSICIÓN',    valor: jugador.posicion },
    { label: 'FICHADO',     valor: formatFecha(jugador.fecha_fichaje) },
  ]
  return (
    <View style={styles.infoCard}>
      <Text style={styles.infoNombre}>{jugador.nombre_completo}</Text>
      {filas.map(({ label, valor }) =>
        valor ? (
          <View key={label} style={styles.infoFila}>
            <Text style={styles.infoLabel}>{label}</Text>
            <Text style={styles.infoValor}>{valor}</Text>
          </View>
        ) : null,
      )}
    </View>
  )
}

// ─── Fila de documento ────────────────────────────────────────────────────────

function DocumentoRow({ doc }: { doc: DocumentoFichaje }) {
  const color = TIPO_DOC_COLOR[doc.tipo] ?? MUTED
  return (
    <View style={styles.docRow}>
      <View style={[styles.docBadge, { borderColor: color }]}>
        <Text style={[styles.docBadgeTexto, { color }]}>
          {TIPO_LABEL[doc.tipo as TipoDocumento] ?? doc.tipo}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.docNombre} numberOfLines={1}>
          {doc.nombre_archivo ?? 'Archivo'}
        </Text>
        <Text style={styles.docFecha}>{formatFecha(doc.created_at.split('T')[0])}</Text>
      </View>
    </View>
  )
}

// ─── Selector de tipo de documento ───────────────────────────────────────────

function SelectorTipo({
  seleccionado,
  onSelect,
}: {
  seleccionado: TipoDocumento | null
  onSelect: (t: TipoDocumento) => void
}) {
  const tipos: TipoDocumento[] = ['dni', 'ficha_medica', 'otro']
  return (
    <View style={styles.tipoRow}>
      {tipos.map(t => {
        const activo = seleccionado === t
        return (
          <TouchableOpacity
            key={t}
            style={[styles.tipoBtn, activo && styles.tipoBtnActivo]}
            onPress={() => onSelect(t)}
            activeOpacity={0.75}
          >
            <Text style={[styles.tipoBtnTexto, activo && { color: DARK, fontWeight: '700' }]}>
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
  } = useFichajes()

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
        <Text style={styles.labelHeader}>MANAGER · {divisionNombre.toUpperCase()}</Text>
        <Text style={styles.titulo}>Fichajes</Text>
      </View>
      <View style={styles.separador} />

      {/* ── Paso: Lista ── */}
      {paso === 'lista' && (
        <>
          <ScrollView contentContainerStyle={styles.lista}>
            <View style={styles.seccionHeader}>
              <Text style={styles.seccionLabel}>JUGADORES FICHADOS</Text>
              <Text style={styles.seccionConteo}>{jugadores.length}</Text>
            </View>

            {jugadores.length === 0 ? (
              <Text style={styles.emptyTexto}>Sin jugadores fichados aún.</Text>
            ) : (
              <View style={{ gap: 10, marginTop: 8 }}>
                {jugadores.map(j => (
                  <JugadorCard key={j.id} jugador={j} onPress={seleccionarJugador} />
                ))}
              </View>
            )}
          </ScrollView>

          <View style={styles.fabWrap}>
            <TouchableOpacity style={styles.fab} onPress={abrirModal} activeOpacity={0.85}>
              <Text style={styles.fabTexto}>+ NUEVO FICHAJE</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* ── Paso: Detalle jugador ── */}
      {paso === 'detalle' && jugadorDetalle && (
        <ScrollView contentContainerStyle={styles.detalleScroll}>
          <TouchableOpacity style={styles.volverBtn} onPress={volverALista} activeOpacity={0.7}>
            <Text style={styles.volverTexto}>← Volver a lista</Text>
          </TouchableOpacity>

          <InfoCard jugador={jugadorDetalle} />

          {/* Documentos */}
          <View style={styles.seccionDetalle}>
            <Text style={styles.seccionLabel}>DOCUMENTOS</Text>

            {cargandoDetalle ? (
              <ActivityIndicator color={GOLD} style={{ marginTop: 12 }} />
            ) : jugadorDetalle.documentos.length === 0 ? (
              <Text style={styles.emptyTexto}>Sin documentos cargados.</Text>
            ) : (
              <View style={{ gap: 0 }}>
                {jugadorDetalle.documentos.map((doc, i) => (
                  <View key={doc.id}>
                    {i > 0 && <View style={styles.filaDiv} />}
                    <DocumentoRow doc={doc} />
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Subir documento */}
          <View style={styles.seccionDetalle}>
            <Text style={styles.seccionLabel}>SUBIR DOCUMENTO</Text>

            <SelectorTipo
              seleccionado={tipoSeleccionado}
              onSelect={setTipoSeleccionado}
            />

            {tipoSeleccionado && (
              <TouchableOpacity
                style={[styles.boton, subiendo && { opacity: 0.6 }]}
                onPress={() => subirDocumento(tipoSeleccionado)}
                disabled={subiendo}
                activeOpacity={0.85}
              >
                {subiendo
                  ? <ActivityIndicator color={GOLD} size="small" />
                  : <Text style={styles.botonTexto}>
                      SELECCIONAR ARCHIVO — {TIPO_LABEL[tipoSeleccionado]}
                    </Text>}
              </TouchableOpacity>
            )}

            {errorUpload && (
              <View style={styles.bannerError}>
                <Text style={styles.bannerErrorTexto}>{errorUpload}</Text>
              </View>
            )}

            {subiendoOk && (
              <View style={styles.bannerOk}>
                <Text style={styles.bannerOkTexto}>✓ Documento subido correctamente</Text>
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
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitulo}>Nuevo fichaje</Text>
              <TouchableOpacity onPress={cerrarModal} disabled={guardandoFichaje} activeOpacity={0.7}>
                <Text style={styles.modalCerrar}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.separador} />

            <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <View style={styles.campo}>
                <Text style={styles.campoLabel}>NOMBRE COMPLETO</Text>
                <TextInput
                  style={styles.inputTexto}
                  value={nombre}
                  onChangeText={setNombre}
                  placeholder="Apellido y nombre"
                  placeholderTextColor={MUTED}
                  autoCapitalize="words"
                />
              </View>

              <View style={styles.campo}>
                <Text style={styles.campoLabel}>DNI</Text>
                <TextInput
                  style={styles.inputTexto}
                  value={dni}
                  onChangeText={setDni}
                  placeholder="40000001"
                  placeholderTextColor={MUTED}
                  keyboardType="number-pad"
                  maxLength={12}
                />
              </View>

              <View style={styles.campo}>
                <DatePickerField
                  label="FECHA DE NACIMIENTO"
                  value={fechaNacimiento}
                  onChange={setFechaNacimiento}
                  maximumDate={new Date()}
                />
              </View>

              <View style={styles.campo}>
                <Text style={styles.campoLabel}>POSICIÓN (opcional)</Text>
                <TextInput
                  style={styles.inputTexto}
                  value={posicion}
                  onChangeText={setPosicion}
                  placeholder="Apertura, Pilar, Hooker..."
                  placeholderTextColor={MUTED}
                  autoCapitalize="sentences"
                />
              </View>

              {errorForm && (
                <View style={styles.bannerError}>
                  <Text style={styles.bannerErrorTexto}>{errorForm}</Text>
                </View>
              )}

              {guardadoFichajeOk && (
                <View style={styles.bannerOk}>
                  <Text style={styles.bannerOkTexto}>✓ Fichaje registrado</Text>
                  <Text style={styles.bannerOkSub}>Se notificará a la Subcomisión</Text>
                </View>
              )}

              {!guardadoFichajeOk && (
                <TouchableOpacity
                  style={[styles.boton, guardandoFichaje && { opacity: 0.6 }]}
                  onPress={guardarFichaje}
                  disabled={guardandoFichaje}
                  activeOpacity={0.85}
                >
                  {guardandoFichaje
                    ? <ActivityIndicator color={GOLD} size="small" />
                    : <Text style={styles.botonTexto}>GUARDAR FICHAJE</Text>}
                </TouchableOpacity>
              )}

              {guardadoFichajeOk && (
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

  lista:        { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120 },
  seccionHeader:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seccionLabel: { fontSize: 10, letterSpacing: 2, color: GOLD },
  seccionConteo:{ fontSize: 13, color: MUTED, fontWeight: '600' },
  emptyTexto:   { color: MUTED, fontSize: 14, fontStyle: 'italic', fontFamily: 'serif', marginTop: 12 },

  // Card jugador en lista
  card:         { borderWidth: 1, borderColor: DIVIDER, borderRadius: 8, padding: 14, flexDirection: 'row', alignItems: 'center' },
  cardBody:     { flex: 1, gap: 3 },
  cardNombre:   { fontSize: 15, fontWeight: '700', color: DARK },
  cardRow:      { flexDirection: 'row' },
  cardMeta:     { fontSize: 13, color: MUTED },
  cardSub:      { fontSize: 12, color: MUTED },
  chevron:      { fontSize: 22, color: DIVIDER, paddingLeft: 8 },

  // FAB
  fabWrap:      { position: 'absolute', bottom: 24, left: 16, right: 16 },
  fab:          { backgroundColor: DARK, paddingVertical: 15, borderRadius: 4, alignItems: 'center' },
  fabTexto:     { color: GOLD, fontSize: 11, letterSpacing: 2.5, fontWeight: '700' },

  // Volver
  volverBtn:    { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8 },
  volverTexto:  { color: GOLD, fontSize: 13, fontWeight: '600' },

  // Detalle
  detalleScroll: { paddingBottom: 40 },
  seccionDetalle:{ paddingHorizontal: 16, paddingTop: 20, gap: 12 },

  // Info card jugador
  infoCard:     { marginHorizontal: 16, marginTop: 4, borderWidth: 1, borderColor: DIVIDER, borderRadius: 8, padding: 16, gap: 10 },
  infoNombre:   { fontSize: 18, fontWeight: '700', color: DARK, marginBottom: 4 },
  infoFila:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  infoLabel:    { fontSize: 10, letterSpacing: 1.5, color: MUTED, marginTop: 2, width: 90 },
  infoValor:    { fontSize: 14, color: DARK, flex: 1, textAlign: 'right' },

  // Documentos
  filaDiv:      { height: 1, backgroundColor: DIVIDER },
  docRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  docBadge:     { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  docBadgeTexto:{ fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  docNombre:    { fontSize: 13, color: DARK, fontWeight: '600' },
  docFecha:     { fontSize: 11, color: MUTED },

  // Tipo de documento selector
  tipoRow:         { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  tipoBtn:         { borderWidth: 1, borderColor: DIVIDER, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 7 },
  tipoBtnActivo:   { borderColor: GOLD, backgroundColor: '#FBF0D0' },
  tipoBtnTexto:    { fontSize: 13, color: MUTED },

  // Modal
  modalContainer: { flex: 1, backgroundColor: CREAM },
  modalHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 18 },
  modalTitulo:    { fontSize: 20, fontStyle: 'italic', fontFamily: 'serif', color: DARK },
  modalCerrar:    { fontSize: 18, color: MUTED, paddingHorizontal: 4 },
  modalScroll:    { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40, gap: 20 },

  // Campos
  campo:          { gap: 8 },
  campoLabel:     { fontSize: 10, letterSpacing: 2, color: GOLD },
  inputTexto:     { borderWidth: 1.5, borderColor: DIVIDER, borderRadius: 6, padding: 12, fontSize: 15, color: DARK },

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
