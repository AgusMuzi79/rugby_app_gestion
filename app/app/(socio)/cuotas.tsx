import {
  View, Text, FlatList, TouchableOpacity, Modal,
  StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native'
import { useRef, useState } from 'react'
import { useScrollToTop } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { Header } from '@/components/shared/Header'
import { useCuotas, type Cuota, type ServicioActivo } from '@/hooks/useCuotas'
import { colors, fonts } from '@/constants/theme'

// ─── Config club ──────────────────────────────────────────────────────────────
// TODO: mover a tabla config en Supabase cuando se implemente
const ALIAS_CLUB = 'cuenta.uncas.rugby'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function periodoLabel(periodo: string): string {
  const [anio, mes] = periodo.split('-')
  const meses = [
    '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ]
  return `${meses[Number(mes)]} ${anio}`
}

function fechaCorta(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function montoStr(monto: number): string {
  return `$ ${monto.toLocaleString('es-AR', { minimumFractionDigits: 0 })}`
}

function fechaEdicion(): string {
  const d    = new Date()
  const dias = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']
  const dd   = String(d.getDate()).padStart(2, '0')
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const yy   = String(d.getFullYear()).slice(2)
  return `${dias[d.getDay()]} ${dd}.${mm}.${yy}`
}

// ─── Modal de pago ────────────────────────────────────────────────────────────

function PagoModal({
  cuota,
  subiendo,
  onSubir,
  onClose,
  categoriaLabel,
  montoCategoria,
  serviciosActivos,
}: {
  cuota:             Cuota
  subiendo:          boolean
  onSubir:           () => void
  onClose:           () => void
  categoriaLabel:    string
  montoCategoria:    number
  serviciosActivos:  ServicioActivo[]
}) {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={m.overlay}>
        <TouchableOpacity style={m.overlayBg} activeOpacity={1} onPress={onClose} />
        <View style={m.sheet}>
          {/* Handle */}
          <View style={m.handle} />

          <Text style={m.sheetTitle}>{periodoLabel(cuota.periodo).toUpperCase()}</Text>

          {/* Desglose */}
          <View style={m.breakdown}>
            <View style={m.bRow}>
              <Text style={m.bLabel}>{categoriaLabel || 'Cuota base'}</Text>
              <Text style={m.bMonto}>${montoCategoria.toLocaleString('es-AR')}</Text>
            </View>
            {serviciosActivos.map(srv => (
              <View key={srv.id} style={m.bRow}>
                <Text style={m.bLabel}>{srv.nombre}</Text>
                <Text style={m.bMonto}>${srv.monto_mensual.toLocaleString('es-AR')}</Text>
              </View>
            ))}
            <View style={m.bSep} />
            <View style={m.bRow}>
              <Text style={m.bTotalLabel}>TOTAL A TRANSFERIR</Text>
              <Text style={m.bTotal}>{montoStr(cuota.monto)}</Text>
            </View>
          </View>

          {/* Alias */}
          <View style={m.aliasBox}>
            <Text style={m.aliasEtiqueta}>ALIAS</Text>
            <Text style={m.aliasValor}>{ALIAS_CLUB}</Text>
            <Text style={m.aliasSub}>Transferí desde tu app bancaria o billetera virtual</Text>
          </View>

          {/* Acción */}
          <TouchableOpacity
            style={[m.subirBtn, subiendo && m.subirBtnDisabled]}
            onPress={onSubir}
            disabled={subiendo}
            activeOpacity={0.8}
          >
            {subiendo ? (
              <ActivityIndicator color={colors.oro} size="small" />
            ) : (
              <>
                <Feather name="upload" size={14} color={colors.oro} />
                <Text style={m.subirBtnText}>SUBIR COMPROBANTE</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={m.subirHint}>
            Tomá una foto o seleccioná la captura de pantalla del comprobante. Secretaría lo revisará y registrará el pago.
          </Text>

          <TouchableOpacity style={m.cerrarBtn} onPress={onClose} activeOpacity={0.75}>
            <Text style={m.cerrarText}>CERRAR</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

// ─── Card cuota ───────────────────────────────────────────────────────────────

function CuotaCard({
  cuota,
  onVerPago,
  categoriaLabel,
  montoCategoria,
  serviciosActivos,
}: {
  cuota:            Cuota
  onVerPago:        (c: Cuota) => void
  categoriaLabel:   string
  montoCategoria:   number
  serviciosActivos: ServicioActivo[]
}) {
  const [expandida, setExpandida] = useState(false)

  const pagada      = cuota.estado === 'pagado'
  const enRevision  = cuota.estado === 'en_revision'
  const pendiente   = cuota.estado === 'pendiente'

  const borderColor = pagada ? '#1A7A1A' : enRevision ? colors.oroHondo : '#2C2418'
  const badgeBg     = pagada ? '#1A7A1A' : enRevision ? colors.oroHondo : '#3A2800'
  const badgeLabel  = pagada ? 'PAGADA' : enRevision ? 'EN REVISIÓN' : 'PENDIENTE'

  return (
    <TouchableOpacity
      style={[s.card, { borderLeftColor: borderColor }]}
      onPress={() => setExpandida(v => !v)}
      activeOpacity={0.85}
    >
      {/* Fila principal */}
      <View style={s.cardRow}>
        <View style={s.cardLeft}>
          <Text style={s.cardPeriodo}>{periodoLabel(cuota.periodo).toUpperCase()}</Text>
          <Text style={s.cardMonto}>{montoStr(cuota.monto)}</Text>
        </View>
        <View style={s.cardRight}>
          <View style={[s.estadoBadge, { backgroundColor: badgeBg }]}>
            <Text style={s.estadoText}>{badgeLabel}</Text>
          </View>
          <Feather
            name={expandida ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.oroHondo}
            style={{ marginTop: 8 }}
          />
        </View>
      </View>

      {/* Expansión */}
      {expandida && (
        <View style={s.detalle}>
          {/* Desglose */}
          {!!categoriaLabel && (
            <View style={s.desgloseBox}>
              <View style={s.desgloseRow}>
                <Text style={s.desgloseItem}>{categoriaLabel}</Text>
                <Text style={s.desgloseMonto}>${montoCategoria.toLocaleString('es-AR')}</Text>
              </View>
              {serviciosActivos.map(srv => (
                <View key={srv.id} style={s.desgloseRow}>
                  <Text style={s.desgloseItem}>{srv.nombre}</Text>
                  <Text style={s.desgloseMonto}>${srv.monto_mensual.toLocaleString('es-AR')}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Estado detallado */}
          {pagada && cuota.fecha_pago && (
            <View style={s.infoRow}>
              <Feather name="check-circle" size={12} color="#1A7A1A" />
              <Text style={s.infoText}>Pagado el {fechaCorta(cuota.fecha_pago)}</Text>
            </View>
          )}
          {enRevision && (
            <View style={s.infoRow}>
              <Feather name="clock" size={12} color={colors.oroHondo} />
              <Text style={s.infoText}>Comprobante recibido · aguardando confirmación de Secretaría</Text>
            </View>
          )}
          {pendiente && (
            <TouchableOpacity
              style={s.pagarBtn}
              onPress={() => onVerPago(cuota)}
              activeOpacity={0.8}
            >
              <Feather name="arrow-right-circle" size={14} color={colors.tinta} />
              <Text style={s.pagarBtnText}>VER CÓMO PAGAR</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CuotasScreen() {
  const scrollRef = useRef<FlatList>(null)
  useScrollToTop(scrollRef)
  const insets = useSafeAreaInsets()
  const {
    cuotas, loading, subiendo, subirComprobante, refetch,
    serviciosActivos, totalMensual, categoriaLabel, montoCategoria,
  } = useCuotas()

  const [cuotaModal, setCuotaModal] = useState<Cuota | null>(null)

  const pendientes   = cuotas.filter(c => c.estado === 'pendiente').length
  const enRevision   = cuotas.filter(c => c.estado === 'en_revision').length

  return (
    <View style={s.root}>
      <View style={{ paddingTop: insets.top }}>
        <Header />
        <View style={s.edicionBar}>
          <Text style={s.edicionLabel}>SECCIÓN · SOCIOS</Text>
          <Text style={s.edicionFecha}>{fechaEdicion()}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.oro} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          ref={scrollRef}
          data={cuotas}
          keyExtractor={c => c.id}
          contentContainerStyle={s.listContent}
          onRefresh={refetch}
          refreshing={loading}
          ListHeaderComponent={
            <View>
              {/* Resumen mensual */}
              {!!categoriaLabel && (
                <View style={s.resumenCard}>
                  <View style={s.secRow}>
                    <Text style={s.secTitle}>LO QUE PAGÁS POR MES</Text>
                    <View style={s.secLine} />
                  </View>
                  <View style={s.serviciosGrid}>
                    <View style={s.servicioChip}>
                      <Text style={s.servicioNombre}>{categoriaLabel}</Text>
                      <Text style={s.servicioMonto}>${montoCategoria.toLocaleString('es-AR')}</Text>
                    </View>
                    {serviciosActivos.map(srv => (
                      <View key={srv.id} style={s.servicioChip}>
                        <Text style={s.servicioNombre}>{srv.nombre}</Text>
                        <Text style={s.servicioMonto}>${srv.monto_mensual.toLocaleString('es-AR')}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={s.totalRow}>
                    <Text style={s.totalLabel}>TOTAL</Text>
                    <Text style={s.totalMonto}>${totalMensual.toLocaleString('es-AR', { minimumFractionDigits: 0 })}/mes</Text>
                  </View>
                </View>
              )}

              {/* Banners de alerta */}
              {pendientes > 0 && (
                <View style={[s.banner, s.bannerPendiente]}>
                  <Feather name="alert-circle" size={14} color="#F3EFE4" />
                  <Text style={s.bannerText}>
                    {pendientes === 1
                      ? 'Tenés 1 cuota pendiente de pago.'
                      : `Tenés ${pendientes} cuotas pendientes de pago.`}
                  </Text>
                </View>
              )}
              {enRevision > 0 && (
                <View style={[s.banner, s.bannerRevision]}>
                  <Feather name="clock" size={14} color={colors.tinta} />
                  <Text style={[s.bannerText, { color: colors.tinta }]}>
                    {enRevision === 1
                      ? '1 comprobante en revisión por Secretaría.'
                      : `${enRevision} comprobantes en revisión por Secretaría.`}
                  </Text>
                </View>
              )}

              {/* Historial header */}
              <View style={[s.secRow, { marginTop: 20 }]}>
                <Text style={s.secTitle}>HISTORIAL DE CUOTAS</Text>
                <View style={s.secLine} />
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <CuotaCard
              cuota={item}
              onVerPago={c => setCuotaModal(c)}
              categoriaLabel={categoriaLabel}
              montoCategoria={montoCategoria}
              serviciosActivos={serviciosActivos}
            />
          )}
          ListEmptyComponent={
            <View style={s.emptyContainer}>
              <Text style={s.emptyText}>No hay cuotas registradas aún.</Text>
            </View>
          }
        />
      )}

      {cuotaModal && (
        <PagoModal
          cuota={cuotaModal}
          subiendo={subiendo === cuotaModal.id}
          onSubir={() => {
            subirComprobante(cuotaModal.id)
            setCuotaModal(null)
          }}
          onClose={() => setCuotaModal(null)}
          categoriaLabel={categoriaLabel}
          montoCategoria={montoCategoria}
          serviciosActivos={serviciosActivos}
        />
      )}
    </View>
  )
}

// ─── Styles pantalla ─────────────────────────────────────────────────────────

const FONDO   = '#15110A'
const CARD    = '#1C1710'
const DIVIDER = '#2C2418'
const TEXTO   = '#F3EFE4'
const MUTED   = '#8E8574'

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: FONDO },
  listContent:  { paddingHorizontal: 20, paddingBottom: 60, gap: 10 },

  edicionBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.tinta,
  },
  edicionLabel: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: colors.oro },
  edicionFecha: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: colors.grisClaro },

  secRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  secTitle:{ fontFamily: fonts.label, fontSize: 9, letterSpacing: 2.5, textTransform: 'uppercase', color: colors.oroHondo },
  secLine: { flex: 1, height: 1, backgroundColor: DIVIDER },

  resumenCard: {
    backgroundColor: CARD, borderRadius: 6, borderWidth: 1, borderColor: DIVIDER,
    padding: 16, gap: 12, marginBottom: 4,
  },
  serviciosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  servicioChip: {
    borderWidth: 1, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 8,
    borderColor: DIVIDER, gap: 2,
  },
  servicioNombre: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1, color: TEXTO },
  servicioMonto:  { fontFamily: fonts.cuerpo, fontSize: 13, color: MUTED },
  totalRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 10, borderTopWidth: 1, borderTopColor: DIVIDER },
  totalLabel:{ fontFamily: fonts.label, fontSize: 8, letterSpacing: 2, color: MUTED },
  totalMonto:{ fontFamily: fonts.titulo, fontSize: 22, color: TEXTO },

  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 4, marginBottom: 4,
  },
  bannerPendiente: { backgroundColor: colors.oroHondo },
  bannerRevision:  { backgroundColor: colors.oro },
  bannerText: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 1, flex: 1, color: '#F3EFE4' },

  // Cards de cuota
  card: {
    backgroundColor: CARD, borderRadius: 4, borderWidth: 1,
    borderColor: DIVIDER, borderLeftWidth: 3, padding: 16,
  },
  cardRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardLeft:   { gap: 4, flex: 1 },
  cardRight:  { alignItems: 'flex-end' },
  cardPeriodo:{ fontFamily: fonts.label, fontSize: 10, letterSpacing: 2, color: MUTED },
  cardMonto:  { fontFamily: fonts.titulo, fontSize: 28, color: TEXTO },
  estadoBadge:{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 2 },
  estadoText: { fontFamily: fonts.label, fontSize: 7, letterSpacing: 1.5, textTransform: 'uppercase', color: TEXTO },

  detalle:  { marginTop: 14, gap: 10, borderTopWidth: 1, borderTopColor: DIVIDER, paddingTop: 14 },
  desgloseBox: { gap: 6 },
  desgloseRow: { flexDirection: 'row', justifyContent: 'space-between' },
  desgloseItem:{ fontFamily: fonts.cuerpo, fontSize: 13, color: MUTED, flex: 1 },
  desgloseMonto:{ fontFamily: fonts.cuerpo, fontSize: 13, color: TEXTO },

  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  infoText:{ fontFamily: fonts.cuerpo, fontSize: 12, color: MUTED, flex: 1, fontStyle: 'italic' },

  pagarBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.oro, paddingVertical: 12, borderRadius: 4,
  },
  pagarBtnText: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 2, color: colors.tinta },

  emptyContainer: { paddingTop: 60, alignItems: 'center' },
  emptyText:      { fontFamily: fonts.cuerpo, fontSize: 14, fontStyle: 'italic', color: MUTED },
})

// ─── Styles modal de pago ─────────────────────────────────────────────────────

const m = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  overlayBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  sheet: {
    backgroundColor: '#1C1710', borderTopLeftRadius: 16, borderTopRightRadius: 16,
    padding: 24, paddingBottom: 36, gap: 16,
    borderTopWidth: 1, borderColor: '#2C2418',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#3A2E1E',
    alignSelf: 'center', marginBottom: 4,
  },
  sheetTitle: {
    fontFamily: fonts.titulo, fontSize: 26, color: '#F3EFE4',
  },

  breakdown: { gap: 8 },
  bRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  bLabel:    { fontFamily: fonts.cuerpo, fontSize: 14, color: '#8E8574', flex: 1 },
  bMonto:    { fontFamily: fonts.cuerpo, fontSize: 14, color: '#F3EFE4' },
  bSep:      { height: 1, backgroundColor: '#2C2418', marginVertical: 4 },
  bTotalLabel:{ fontFamily: fonts.label, fontSize: 8, letterSpacing: 2, color: '#8E8574', flex: 1 },
  bTotal:    { fontFamily: fonts.titulo, fontSize: 26, color: '#F3EFE4' },

  aliasBox: {
    backgroundColor: '#15110A', borderRadius: 6, borderWidth: 1, borderColor: '#2C2418',
    padding: 16, gap: 4, alignItems: 'center',
  },
  aliasEtiqueta: { fontFamily: fonts.label, fontSize: 8, letterSpacing: 3, color: '#8E8574' },
  aliasValor:    { fontFamily: fonts.titulo, fontSize: 24, color: colors.oro, letterSpacing: 1 },
  aliasSub:      { fontFamily: fonts.cuerpo, fontSize: 11, color: '#8E8574', fontStyle: 'italic', textAlign: 'center' },

  subirBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 1, borderColor: colors.oroHondo, borderRadius: 4, paddingVertical: 14,
  },
  subirBtnDisabled: { opacity: 0.5 },
  subirBtnText: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 2, color: colors.oro },

  subirHint: {
    fontFamily: fonts.cuerpo, fontSize: 11, color: '#8E8574',
    fontStyle: 'italic', textAlign: 'center', lineHeight: 17,
  },

  cerrarBtn: { alignItems: 'center', paddingVertical: 8 },
  cerrarText: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 2, color: '#8E8574' },
})
