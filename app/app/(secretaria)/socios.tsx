import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  TouchableOpacity, Alert, ScrollView, Image, RefreshControl, TextInput, Platform,
} from 'react-native'
import { useState, useCallback, useRef } from 'react'
import { useScrollToTop } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { Header } from '@/components/shared/Header'
import { ErrorCarga } from '@/components/secretaria/ErrorCarga'
import { useSociosSecretaria, type SocioItem, type CategoriaSocio, type ServicioOpcional } from '@/hooks/useSociosSecretaria'
import { montoServicio, montoServiciosSocio, type VinculoServicio } from '@/lib/secretariaNuvix'
import { colors, fonts } from '@/constants/theme'

// ─── Constants ────────────────────────────────────────────────────────────────

const FONDO   = colors.fondo
const CARD    = colors.card
const TEXTO   = colors.texto
const MUTED   = colors.muted
const DIVIDER = colors.borde

// Fondo del badge de estado. Texto: sobreOro sobre verde / oro / naranja, blanco sobre gris.
const ESTADO_COLOR: Record<string, string> = {
  activo:    colors.estadoActivo,
  moroso:    colors.oro,
  pendiente: colors.estadoPendiente,
  inactivo:  '#555555',
}
const ESTADO_LABEL: Record<string, string> = {
  activo: 'ACTIVO', moroso: 'MOROSO', pendiente: 'PENDIENTE', inactivo: 'INACTIVO',
}
// Sin MOROSO: ese estado no lo setea nadie; la deuda real es el semáforo de NUVIX.
const FILTROS = ['todos', 'activo', 'pendiente', 'inactivo'] as const
type Filtro = typeof FILTROS[number]

// ─── Detalle Socio ────────────────────────────────────────────────────────────

function DetalleSocio({
  socio,
  categorias,
  servicios,
  serviciosSocio,
  fotoSignedUrl,
  onDeactivate,
  onReactivate,
  onValidarFoto,
  onToggleServicio,
  errorDetalle,
  onReintentar,
  onClose,
}: {
  socio:            SocioItem
  categorias:       CategoriaSocio[]
  servicios:        ServicioOpcional[]
  serviciosSocio:   VinculoServicio[]
  fotoSignedUrl:    (path: string) => Promise<string | null>
  onDeactivate:      (id: string) => void
  onReactivate:      (id: string) => void
  onValidarFoto:     (id: string) => void
  onToggleServicio:  (servicioId: string, agregar: boolean) => void
  errorDetalle:      string | null
  onReintentar:      () => void
  onClose:           () => void
}) {
  const [fotoUrl,              setFotoUrl]              = useState<string | null>(null)
  const categoria = categorias.find(c => c.id === socio.categoria_id)

  // Importe real del vínculo (NUVIX) o, si no lo trae, el precio de catálogo.
  const vinculoPorServicio = new Map(serviciosSocio.map(v => [v.servicio_id, v]))
  const montoServicios = montoServiciosSocio(servicios, serviciosSocio)
  const montoTotal = (categoria?.monto_mensual ?? 0) + montoServicios

  const verFoto = async () => {
    if (!socio.foto_path) { Alert.alert('Sin foto', 'El socio no tiene foto cargada.'); return }
    const url = await fotoSignedUrl(socio.foto_path)
    if (url) setFotoUrl(url)
    else Alert.alert('No se pudo abrir la foto', 'Revisá la conexión y probá de nuevo.')
  }

  return (
    <View style={ss.detalle}>
      <View style={ss.detalleBar}>
        <TouchableOpacity
          onPress={onClose}
          style={ss.backBtn}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Volver a la lista de socios"
        >
          <Feather name="arrow-left" size={18} color={TEXTO} />
          <Text style={ss.backText}>SOCIOS</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={ss.detalleScrollContent} showsVerticalScrollIndicator={false}>
        {fotoUrl ? (
          <Image source={{ uri: fotoUrl }} style={ss.fotoDetalle} />
        ) : (
          <TouchableOpacity
            style={[ss.fotoDetalle, ss.fotoPlaceholder]}
            onPress={verFoto}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Ver foto del socio"
          >
            <Feather name="image" size={32} color={MUTED} />
            <Text style={ss.verFotoText}>VER FOTO</Text>
          </TouchableOpacity>
        )}

        <View>
          <Text style={ss.detalleNombre}>{socio.nombre}</Text>
          <Text style={ss.detalleNum}>Nº {socio.numero_socio}</Text>
        </View>

        {[
          // El nombre grande es el del padrón; si el socio se puso otro en la app, se muestra aparte.
          ...(socio.nombreApp && socio.nombreApp !== socio.nombre
            ? [{ label: 'NOMBRE EN LA APP', value: socio.nombreApp }]
            : []),
          { label: 'DNI',       value: socio.dni },
          { label: 'CATEGORÍA', value: categoria?.nombre ?? socio.categoria },
          { label: 'ESTADO',    value: ESTADO_LABEL[socio.estado] ?? socio.estado.toUpperCase() },
          { label: 'FOTO',      value: socio.foto_validada ? 'Validada ✓' : 'Pendiente de validación' },
        ].map(row => (
          <View key={row.label} style={ss.dataRow}>
            <Text style={ss.dataLabel}>{row.label}</Text>
            <Text style={ss.dataValue}>{row.value}</Text>
          </View>
        ))}

        {/* ── Servicios opcionales ─────────────────────────────────── */}
        {/* Si falló la lectura, no se muestran servicios ni total (serían falsos). */}
        {errorDetalle ? (
          <ErrorCarga mensaje={errorDetalle} onReintentar={onReintentar} />
        ) : (
        <View style={ss.serviciosSection}>
          <Text style={ss.serviciosTitulo}>SERVICIOS OPCIONALES</Text>
          <View style={ss.serviciosGrid}>
            {servicios.map(srv => {
              const vinculo = vinculoPorServicio.get(srv.id)
              const activo = !!vinculo
              return (
                <TouchableOpacity
                  key={srv.id}
                  style={[ss.servicioChip, activo ? ss.servicioChipActivo : ss.servicioChipInactivo]}
                  onPress={() => onToggleServicio(srv.id, !activo)}
                  activeOpacity={0.75}
                  accessibilityRole="checkbox"
                  accessibilityLabel={`${srv.nombre}, $${montoServicio(srv, vinculo)} por mes`}
                  accessibilityState={{ checked: activo }}
                >
                  <Text style={[ss.servicioChipNombre, activo ? ss.servicioChipNombreActivo : ss.servicioChipNombreInactivo]}>
                    {srv.nombre}
                  </Text>
                  <Text style={[ss.servicioChipMonto, activo ? ss.servicioChipMontoActivo : ss.servicioChipMontoInactivo]}>
                    +${montoServicio(srv, vinculo)}/mes
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
          <View style={ss.totalRow}>
            <Text style={ss.totalLabel}>TOTAL MENSUAL</Text>
            <Text style={ss.totalMonto}>
              ${montoTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </Text>
          </View>
        </View>
        )}

        <View style={ss.acciones}>
          {!socio.foto_validada && socio.foto_path && (
            <TouchableOpacity
              style={[ss.accionBtn, ss.accionBtnOro]}
              onPress={() => onValidarFoto(socio.id)}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <Text style={[ss.accionBtnText, ss.accionBtnTextOro]}>VALIDAR FOTO</Text>
            </TouchableOpacity>
          )}
          {socio.estado !== 'inactivo' ? (
            <TouchableOpacity
              style={[ss.accionBtn, ss.accionBtnRojo]}
              onPress={() => onDeactivate(socio.id)}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <Text style={[ss.accionBtnText, ss.accionBtnTextRojo]}>DESACTIVAR SOCIO</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[ss.accionBtn, ss.accionBtnVerde]}
              onPress={() => onReactivate(socio.id)}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <Text style={[ss.accionBtnText, ss.accionBtnTextVerde]}>REACTIVAR SOCIO</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

    </View>
  )
}

// ─── Fila lista ───────────────────────────────────────────────────────────────

function SocioRow({ socio, onPress }: { socio: SocioItem; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={ss.socioRow}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      // El badge muestra sólo la inicial del estado: el lector lo dice completo.
      accessibilityLabel={`${socio.nombre}, socio Nº ${socio.numero_socio}, ${socio.categoria}, ${(ESTADO_LABEL[socio.estado] ?? socio.estado).toLowerCase()}`}
      accessibilityHint="Abre el detalle del socio"
    >
      <Text style={ss.socioNum}>{socio.numero_socio}</Text>
      <View style={ss.socioInfo}>
        <Text style={ss.socioNombre} numberOfLines={1}>{socio.nombre}</Text>
        <Text style={ss.socioCat}>{socio.categoria}</Text>
      </View>
      <View style={[ss.estadoBadge, { backgroundColor: ESTADO_COLOR[socio.estado] ?? '#555' }]}>
        <Text style={[ss.estadoBadgeText, { color: socio.estado === 'activo' || socio.estado === 'moroso' || socio.estado === 'pendiente' ? colors.sobreOro : colors.blanco }]}>{ESTADO_LABEL[socio.estado]?.[0] ?? '?'}</Text>
      </View>
    </TouchableOpacity>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SociosScreen() {
  const scrollRef = useRef<FlatList>(null)
  useScrollToTop(scrollRef)
  const insets = useSafeAreaInsets()
  const {
    socios, categorias, servicios, serviciosSocio, loading, refrescando, refetch,
    filtro, setFiltro, busqueda, setBusqueda,
    desactivarSocio, reactivarSocio, validarFoto, fotoSignedUrl,
    fetchServiciosSocio, toggleServicio,
    errorLista, errorDetalle, reintentarDetalle,
  } = useSociosSecretaria()

  const [detalle, setDetalle]       = useState<SocioItem | null>(null)

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

  const abrirDetalle = useCallback((socio: SocioItem) => {
    setDetalle(socio)
    void fetchServiciosSocio(socio.id)
  }, [fetchServiciosSocio])

  const handleToggleServicio = useCallback((servicioId: string, agregar: boolean) => {
    if (!detalle) return
    void toggleServicio(detalle.id, servicioId, agregar)
  }, [detalle, toggleServicio])

  // ── Detalle ──────────────────────────────────────────────────────────────
  if (detalle) {
    const actualizado = socios.find(x => x.id === detalle.id) ?? detalle
    return (
      <View style={[ss.root, { paddingTop: insets.top }]}>
        <DetalleSocio
          socio={actualizado}
          categorias={categorias}
          servicios={servicios}
          serviciosSocio={serviciosSocio}
          fotoSignedUrl={fotoSignedUrl}
          onDeactivate={handleDeactivate}
          onReactivate={handleReactivate}
          onValidarFoto={handleValidarFoto}
          onToggleServicio={handleToggleServicio}
          errorDetalle={errorDetalle}
          onReintentar={() => { void reintentarDetalle(actualizado.id) }}
          onClose={() => setDetalle(null)}
        />
      </View>
    )
  }

  // ── Lista ────────────────────────────────────────────────────────────────
  return (
    <View style={ss.root}>
      <View style={{ paddingTop: insets.top }}>
        <Header />
        <View style={ss.edicionBar}>
          <Text style={ss.edicionLabel}>SECRETARÍA · SOCIOS</Text>
          <Text style={ss.edicionFecha}>{socios.length} EN VISTA</Text>
        </View>

        <View style={ss.busquedaBar}>
          <Feather name="search" size={16} color={MUTED} />
          <TextInput
            style={ss.busquedaInput}
            value={busqueda}
            onChangeText={setBusqueda}
            placeholder="Nombre, DNI o Nº de socio"
            placeholderTextColor={MUTED}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="while-editing"
            accessibilityLabel="Buscar socio por nombre, DNI o número"
          />
          {busqueda && Platform.OS !== 'ios' ? (
            <TouchableOpacity
              onPress={() => setBusqueda('')}
              style={ss.busquedaLimpiar}
              accessibilityRole="button"
              accessibilityLabel="Borrar búsqueda"
            >
              <Feather name="x" size={16} color={MUTED} />
            </TouchableOpacity>
          ) : null}
        </View>

        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={ss.filtrosContent}
          style={ss.filtrosBar}
        >
          {FILTROS.map(f => (
            <TouchableOpacity
              key={f}
              style={[ss.filtroBtn, filtro === f && ss.filtroBtnActive]}
              onPress={() => setFiltro(f as Filtro)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={`Filtrar: ${f === 'todos' ? 'todos' : ESTADO_LABEL[f]?.toLowerCase() ?? f}`}
              accessibilityState={{ selected: filtro === f }}
            >
              <Text style={[ss.filtroBtnText, filtro === f && ss.filtroBtnTextActive]}>
                {f === 'todos' ? 'TODOS' : ESTADO_LABEL[f] ?? f.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {errorLista ? <ErrorCarga mensaje={errorLista} onReintentar={() => { void refetch() }} /> : null}

      {/* La lista queda montada mientras se escribe: el vacío va en ListEmptyComponent. */}
      {loading ? (
        <ActivityIndicator color={colors.oro} style={ss.activityIndicator} />
      ) : (
        <FlatList
          ref={scrollRef}
          data={socios}
          keyExtractor={item => item.id}
          contentContainerStyle={ss.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListEmptyComponent={errorLista ? null : (
            <View style={ss.empty}>
              <Text style={ss.emptyText}>
                {busqueda.trim() ? 'Ningún socio con ese nombre, DNI o Nº en esta vista.' : 'No hay socios en esta vista.'}
              </Text>
            </View>
          )}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refetch} tintColor={colors.oro} />}
          renderItem={({ item }) => (
            <SocioRow socio={item} onPress={() => abrirDetalle(item)} />
          )}
        />
      )}

    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  root:             { flex: 1, backgroundColor: FONDO },
  activityIndicator:{ marginTop: 40 },
  listContent:      { paddingHorizontal: 20, paddingBottom: 100 },

  edicionBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.tinta,
  },
  edicionLabel: {
    fontFamily: fonts.label, fontSize: 12, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.oroSobreClaro,
  },
  edicionFecha: {
    fontFamily: fonts.label, fontSize: 12, letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.grisClaro,
  },

  busquedaBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: DIVIDER,
  },
  busquedaInput:   { flex: 1, minHeight: 44, fontFamily: fonts.cuerpo, fontSize: 16, color: TEXTO },
  busquedaLimpiar: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginRight: -12 },

  filtrosBar:     { borderBottomWidth: 1, maxHeight: 48, backgroundColor: CARD, borderBottomColor: DIVIDER },
  filtrosContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  // 44 pt de alto táctil (HIG / Material); el texto queda centrado.
  filtroBtn:      { paddingHorizontal: 12, minHeight: 44, justifyContent: 'center', borderRadius: 2 },
  filtroBtnActive:{ borderBottomWidth: 2, borderBottomColor: colors.oro },
  filtroBtnText: {
    fontFamily: fonts.label, fontSize: 12, letterSpacing: 1.5,
    textTransform: 'uppercase', color: MUTED,
  },
  filtroBtnTextActive: { color: colors.oro },

  socioRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: DIVIDER,
  },
  socioNum:    { fontFamily: fonts.titulo, fontSize: 19, width: 44, textAlign: 'right', color: colors.oroHondo },
  socioInfo:   { flex: 1 },
  socioNombre: { fontFamily: fonts.cuerpo, fontSize: 16, color: TEXTO },
  socioCat:    { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1, marginTop: 2, color: MUTED },
  estadoBadge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  estadoBadgeText: { fontFamily: fonts.label, fontSize: 13, color: colors.blanco, fontWeight: 'bold' },

  // Modal overlay
  kavOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  backdrop:   { flex: 1 },

  // Modal
  modal: {
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    maxHeight: '90%', backgroundColor: CARD,
  },
  modalContent: {
    padding: 24, paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', color: TEXTO,
  },
  inputLabel: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginTop: 12, color: MUTED },
  inputLabelMt: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginTop: 14, color: MUTED },
  input: {
    fontFamily: fonts.cuerpo, fontSize: 18, color: TEXTO,
    borderBottomWidth: 1, borderBottomColor: colors.oro, paddingVertical: 8, marginBottom: 4,
  },
  categoriasGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  catBtn: {
    borderWidth: 1, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 8, gap: 2,
  },
  catBtnActivo:         { borderColor: colors.oro, backgroundColor: colors.oro },
  catBtnInactivo:       { borderColor: DIVIDER, backgroundColor: 'transparent' },
  catBtnText:           { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1 },
  catBtnTextActivo:     { color: colors.sobreOro },
  catBtnTextInactivo:   { color: TEXTO },
  catMonto:             { fontFamily: fonts.cuerpo, fontSize: 13, fontStyle: 'italic' },
  catMontoActivo:       { color: colors.grisClaro },
  catMontoInactivo:     { color: MUTED },
  catVacio:             { fontFamily: fonts.cuerpo, fontSize: 14, fontStyle: 'italic', marginTop: 8, color: MUTED },
  crearBtn: {
    backgroundColor: colors.oro, paddingVertical: 16,
    alignItems: 'center', borderRadius: 4, marginTop: 20, marginBottom: 8,
  },
  crearBtnOff: { opacity: 0.5 },
  crearBtnText: {
    fontFamily: fonts.label, fontSize: 13, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.sobreOro,
  },

  // Pago modal
  pagoSocioNombre: {
    fontFamily: fonts.cuerpo, fontSize: 15, fontStyle: 'italic', marginBottom: 4, color: MUTED,
  },
  formaPagoRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  formaPagoBtn: {
    flex: 1, borderWidth: 1, borderRadius: 4,
    paddingVertical: 10, alignItems: 'center',
  },
  formaPagoBtnActivo:       { borderColor: colors.oro, backgroundColor: colors.oro },
  formaPagoBtnInactivo:     { borderColor: DIVIDER, backgroundColor: 'transparent' },
  formaPagoBtnText:         { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' },
  formaPagoBtnTextActivo:   { color: colors.sobreOro },
  formaPagoBtnTextInactivo: { color: TEXTO },

  // Detalle
  detalle:            { flex: 1 },
  detalleBar:         { paddingHorizontal: 20, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: DIVIDER },
  backBtn:            { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, alignSelf: 'flex-start' },
  backText:           { fontFamily: fonts.label, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: TEXTO },
  detalleScrollContent: { padding: 20, gap: 16 },

  fotoDetalle:     { width: 120, height: 150, borderRadius: 6, alignSelf: 'center' },
  fotoPlaceholder: { borderWidth: 1, borderColor: DIVIDER, alignItems: 'center', justifyContent: 'center', gap: 8 },
  verFotoText:     { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.5, color: MUTED },

  detalleNombre: { fontFamily: fonts.titulo, fontSize: 28, marginBottom: 2, color: TEXTO },
  detalleNum:    { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: colors.oroHondo },

  dataRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: DIVIDER,
  },
  dataLabel: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase', color: MUTED },
  dataValue: { fontFamily: fonts.cuerpo, fontSize: 15, color: TEXTO },

  // Servicios
  serviciosSection: { gap: 10, marginTop: 4 },
  serviciosTitulo: {
    fontFamily: fonts.label, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: MUTED,
  },
  serviciosGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  servicioChip:    { borderWidth: 1, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  servicioChipActivo:   { backgroundColor: colors.oro, borderColor: colors.oro },
  servicioChipInactivo: { backgroundColor: 'transparent', borderColor: DIVIDER },
  servicioChipNombre:         { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1 },
  servicioChipNombreActivo:   { color: colors.sobreOro },
  servicioChipNombreInactivo: { color: TEXTO },
  servicioChipMonto:          { fontFamily: fonts.cuerpo, fontSize: 13, fontStyle: 'italic' },
  servicioChipMontoActivo:    { color: colors.grisClaro },
  servicioChipMontoInactivo:  { color: MUTED },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    paddingTop: 10, borderTopWidth: 1, borderTopColor: DIVIDER,
  },
  totalLabel: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 2, color: MUTED },
  totalMonto: { fontFamily: fonts.titulo, fontSize: 21, color: TEXTO },

  acciones: { gap: 10, marginTop: 8 },
  accionBtn: {
    borderWidth: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 4,
  },
  accionBtnVerde:    { borderColor: colors.estadoActivo },
  accionBtnOro:      { borderColor: colors.oro },
  accionBtnRojo:     { borderColor: colors.rojoUrgente },
  accionBtnText:     { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, textTransform: 'uppercase' },
  accionBtnTextVerde:{ color: colors.estadoActivo },
  accionBtnTextOro:  { color: colors.oro },
  accionBtnTextRojo: { color: colors.rojoTexto },

  empty:     { alignItems: 'center', paddingTop: 40 },
  emptyText: { fontFamily: fonts.cuerpo, fontSize: 16, fontStyle: 'italic', color: MUTED },
})
