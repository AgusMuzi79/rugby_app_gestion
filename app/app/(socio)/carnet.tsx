import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, Modal, Image, Dimensions, StatusBar, RefreshControl,
} from 'react-native'
import { useRef, useState, useCallback } from 'react'
import { Feather } from '@expo/vector-icons'
import { useScrollToTop } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import QRCode from 'react-native-qrcode-svg'
import { Header } from '@/components/shared/Header'
import { useCarnet } from '@/hooks/useCarnet'
import { colors, fonts } from '@/constants/theme'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCodigo(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} · ${code.slice(3)}` : code
}

function fechaEdicion(): string {
  const d    = new Date()
  const dias = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']
  const dd   = String(d.getDate()).padStart(2, '0')
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const yy   = String(d.getFullYear()).slice(2)
  return `${dias[d.getDay()]} ${dd}.${mm}.${yy}`
}

const ESTADO_COLOR: Record<string, string> = {
  activo:   '#2ECC71',
  moroso:   colors.oro,
  pendiente: '#E67E22',
  inactivo:  colors.rojoUrgente,
}
const ESTADO_LABEL: Record<string, string> = {
  activo:   'ACTIVO',
  moroso:   'MOROSO',
  pendiente: 'PENDIENTE',
  inactivo:  'INACTIVO',
}

// ─── Tarjeta física ───────────────────────────────────────────────────────────

const CARD_WIDTH  = Dimensions.get('window').width - 48
const CARD_HEIGHT = Math.round(CARD_WIDTH * 0.63) // proporción ID card 85.6×54mm

const ESTADO_BG: Record<string, string> = {
  activo:    '#2ECC71',
  moroso:    colors.oro,
  pendiente: '#E67E22',
  inactivo:  colors.rojoUrgente,
}

function TarjetaFisicaModal({
  visible,
  data,
  onClose,
}: {
  visible: boolean
  data: import('@/hooks/useCarnet').CarnetData
  onClose: () => void
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <StatusBar backgroundColor="rgba(0,0,0,0.88)" />
      <View style={tm.overlay}>
        <TouchableOpacity style={tm.overlayBg} activeOpacity={1} onPress={onClose} />

        <View style={tm.sheet}>
          {/* Tarjeta */}
          <View style={[tm.card, { width: CARD_WIDTH, height: CARD_HEIGHT }]}>

            {/* Franja superior */}
            <View style={tm.cardHeader}>
              <Text style={tm.cardClub}>UNCAS RUGBY CLUB</Text>
              <Text style={tm.cardYear}>{new Date().getFullYear()}</Text>
            </View>

            {/* Cuerpo: foto + datos */}
            <View style={tm.cardBody}>
              {/* Foto */}
              {data.fotoUrl ? (
                <Image source={{ uri: data.fotoUrl }} style={tm.foto} />
              ) : (
                <View style={[tm.foto, tm.fotoPlaceholder]}>
                  <Feather name="user" size={28} color={colors.oroHondo} />
                </View>
              )}

              {/* Datos */}
              <View style={tm.datosCol}>
                <Text style={tm.nombre} numberOfLines={2} adjustsFontSizeToFit>
                  {data.nombre}
                </Text>
                <View style={tm.numRow}>
                  <Text style={tm.numLabel}>Nº </Text>
                  <Text style={tm.numValue}>{data.numero_socio}</Text>
                </View>
                <View style={tm.dividerLine} />
                <Text style={tm.categoriaText}>{data.categoria.toUpperCase()}</Text>
                <View style={[tm.estadoChip, { backgroundColor: ESTADO_BG[data.estado] ?? '#555' }]}>
                  <Text style={tm.estadoChipText}>
                    {ESTADO_LABEL[data.estado] ?? data.estado.toUpperCase()}
                  </Text>
                </View>
              </View>
            </View>

            {/* Franja inferior */}
            <View style={tm.cardFooter}>
              <Text style={tm.cardFooterText}>CARNET DE SOCIO</Text>
            </View>
          </View>

          <TouchableOpacity style={tm.cerrarBtn} onPress={onClose} activeOpacity={0.75}>
            <Text style={tm.cerrarText}>CERRAR</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CarnetScreen() {
  const scrollRef = useRef<ScrollView>(null)
  useScrollToTop(scrollRef)
  const insets = useSafeAreaInsets()
  const { loading, error, data, refresh } = useCarnet()
  const [verTarjeta,  setVerTarjeta]  = useState(false)
  const [refreshing,  setRefreshing]  = useState(false)

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await refresh()
    setRefreshing(false)
  }, [refresh])

  return (
    <ScrollView
      ref={scrollRef}
      style={s.root}
      contentContainerStyle={[s.scrollContent, { paddingTop: insets.top }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.oro}
          colors={[colors.oro]}
        />
      }
    >
      <Header />

      <View style={s.edicionBar}>
        <Text style={s.edicionLabel}>SECCIÓN · SOCIOS</Text>
        <Text style={s.edicionFecha}>{fechaEdicion()}</Text>
      </View>

      <View style={s.saludoContainer}>
        <Text style={s.saludoTexto}>
          Tu carnet{data ? `, ${data.nombre.split(' ')[0]}.` : '.'}
        </Text>
        <View style={s.divider} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.oro} style={s.activityIndicator} />
      ) : error ? (
        <View style={s.errorContainer}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : data ? (
        <>
          {/* ── CARNET DIGITAL ── */}
          <View style={s.section}>
            <View style={s.secRow}>
              <Text style={s.secTitle}>CARNET DIGITAL</Text>
              <View style={s.secLine} />
            </View>

            <View style={s.carnetCard}>
              {/* Número de socio */}
              <Text style={s.numLabel}>Nº DE SOCIO</Text>
              <Text style={s.numValue}>{data.numero_socio}</Text>

              {/* QR Code */}
              <View style={s.qrWrapper}>
                <QRCode
                  value={data.qrContent}
                  size={210}
                  backgroundColor="#FFFFFF"
                  color="#000000"
                />
              </View>

              {/* Countdown */}
              <View style={s.countdownRow}>
                <Text style={s.countdownLabel}>Se renueva en</Text>
                <Text style={s.countdownNum}>{data.secondsLeft}s</Text>
              </View>
              <View style={s.progressTrack}>
                {/* width is truly dynamic (secondsLeft changes every tick) — must remain inline */}
                <View
                  style={[s.progressFill, { width: `${(data.secondsLeft / 60) * 100}%` }]}
                />
              </View>

              {/* Estado */}
              <View style={[s.estadoBadge, { backgroundColor: ESTADO_COLOR[data.estado] ?? colors.grisClaro }]}>
                <Text style={s.estadoText}>
                  {ESTADO_LABEL[data.estado] ?? data.estado.toUpperCase()}
                </Text>
              </View>

              <Text style={s.categoriaText}>
                CATEGORÍA: {data.categoria.toUpperCase()}
              </Text>
            </View>
          </View>

          {/* ── VER CARNET FÍSICO ── */}
          <TouchableOpacity
            style={s.verCarnetBtn}
            onPress={() => setVerTarjeta(true)}
            activeOpacity={0.8}
          >
            <Feather name="credit-card" size={14} color={colors.oro} />
            <Text style={s.verCarnetText}>VER CARNET</Text>
          </TouchableOpacity>

          {/* ── CÓDIGO MANUAL ── */}
          <View style={s.sectionCodigo}>
            <View style={s.secRow}>
              <Text style={s.secTitle}>CÓDIGO DE HOY</Text>
              <View style={s.secLine} />
            </View>
            <Text style={s.codigoHint}>
              Si la cámara no puede leer tu QR, dictá este código.
            </Text>
            <Text style={s.codigoValue}>
              {formatCodigo(data.code)}
            </Text>
          </View>
          <TarjetaFisicaModal
            visible={verTarjeta}
            data={data}
            onClose={() => setVerTarjeta(false)}
          />
        </>
      ) : null}
    </ScrollView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: '#15110A' },
  scrollContent: { paddingBottom: 60 },
  activityIndicator: { marginTop: 60 },

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

  saludoContainer: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 4 },
  saludoTexto:     { fontFamily: fonts.titulo, fontSize: 32, color: '#F3EFE4', marginBottom: 14 },
  divider:         { height: 1, backgroundColor: '#2C2418' },

  section:      { paddingHorizontal: 20, paddingTop: 22 },
  sectionCodigo:{ paddingHorizontal: 20, paddingTop: 22, marginTop: 18 },
  secRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10 },
  secTitle: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 2.5, textTransform: 'uppercase', color: colors.oroHondo },
  secLine:  { flex: 1, height: 1, backgroundColor: '#2C2418' },

  carnetCard: {
    borderWidth: 1, borderRadius: 6, padding: 24,
    alignItems: 'center', gap: 12,
    backgroundColor: '#1C1710', borderColor: '#2C2418',
  },
  numLabel:  { fontFamily: fonts.label, fontSize: 8, letterSpacing: 2, textTransform: 'uppercase', color: '#8E8574' },
  numValue:  { fontFamily: fonts.titulo, fontSize: 42, lineHeight: 48, color: '#F3EFE4' },

  qrWrapper: {
    padding: 16, backgroundColor: colors.blanco,
    borderRadius: 6, borderWidth: 1, borderColor: colors.grisClaro,
    marginVertical: 4,
  },

  countdownRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 },
  countdownLabel: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: '#8E8574' },
  countdownNum:   { fontFamily: fonts.titulo, fontSize: 22, color: '#F3EFE4' },

  progressTrack: { width: '100%', height: 3, borderRadius: 2, overflow: 'hidden', backgroundColor: '#2C2418' },
  progressFill:  { height: '100%', backgroundColor: colors.oro, borderRadius: 2 },

  estadoBadge: {
    paddingHorizontal: 14, paddingVertical: 5, borderRadius: 3, marginTop: 6,
  },
  estadoText: {
    fontFamily: fonts.label, fontSize: 10, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.blanco,
  },
  categoriaText: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1.5, marginTop: 2, color: '#8E8574' },

  codigoHint:  { fontFamily: fonts.cuerpo, fontSize: 12, fontStyle: 'italic', marginBottom: 10, color: '#8E8574' },
  codigoValue: {
    fontFamily: fonts.titulo, fontSize: 38, letterSpacing: 4,
    textAlign: 'center', color: '#F3EFE4',
  },

  errorContainer: { padding: 40, alignItems: 'center' },
  errorText:      { fontFamily: fonts.cuerpo, fontSize: 14, textAlign: 'center', color: colors.rojoUrgente },

  verCarnetBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 8,
    borderWidth: 1, borderColor: colors.oroHondo, borderRadius: 4,
    paddingVertical: 12,
  },
  verCarnetText: {
    fontFamily: fonts.label, fontSize: 10, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.oro,
  },
})

// ─── Estilos tarjeta física ───────────────────────────────────────────────────

const tm = StyleSheet.create({
  overlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
  },
  overlayBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.88)',
  },
  sheet: {
    alignItems: 'center', gap: 20,
  },

  // Tarjeta
  card: {
    borderRadius: 10, overflow: 'hidden',
    backgroundColor: '#1C1710',
    borderWidth: 1, borderColor: '#3A2E1E',
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.tinta,
    paddingHorizontal: 14, paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: colors.oroHondo + '40',
  },
  cardClub: {
    fontFamily: fonts.label, fontSize: 8, letterSpacing: 2.5,
    textTransform: 'uppercase', color: colors.oro,
  },
  cardYear: {
    fontFamily: fonts.label, fontSize: 8, letterSpacing: 1,
    color: colors.oroHondo,
  },
  cardBody: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10, gap: 14,
  },
  foto: {
    width: 72, height: 88, borderRadius: 4,
    borderWidth: 1, borderColor: '#3A2E1E',
  },
  fotoPlaceholder: {
    backgroundColor: '#0E0B07', alignItems: 'center', justifyContent: 'center',
  },
  datosCol: {
    flex: 1, gap: 4,
  },
  nombre: {
    fontFamily: fonts.titulo, fontSize: 17, color: '#F3EFE4', lineHeight: 22,
  },
  numRow: {
    flexDirection: 'row', alignItems: 'baseline', gap: 1, marginTop: 2,
  },
  numLabel: {
    fontFamily: fonts.label, fontSize: 8, letterSpacing: 1, color: '#8E8574',
  },
  numValue: {
    fontFamily: fonts.titulo, fontSize: 18, color: colors.oro,
  },
  dividerLine: {
    height: 1, backgroundColor: '#2C2418', marginVertical: 4,
  },
  categoriaText: {
    fontFamily: fonts.label, fontSize: 8, letterSpacing: 1.5, color: '#8E8574',
  },
  estadoChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 3, marginTop: 2,
  },
  estadoChipText: {
    fontFamily: fonts.label, fontSize: 8, letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.blanco,
  },
  cardFooter: {
    alignItems: 'center', paddingVertical: 6,
    borderTopWidth: 1, borderTopColor: colors.oroHondo + '30',
    backgroundColor: colors.tinta,
  },
  cardFooterText: {
    fontFamily: fonts.label, fontSize: 7, letterSpacing: 3,
    textTransform: 'uppercase', color: colors.oroHondo,
  },

  // Botón cerrar
  cerrarBtn: {
    paddingHorizontal: 32, paddingVertical: 12,
    borderWidth: 1, borderColor: '#3A2E1E', borderRadius: 4,
  },
  cerrarText: {
    fontFamily: fonts.label, fontSize: 10, letterSpacing: 2,
    textTransform: 'uppercase', color: '#8E8574',
  },
})
