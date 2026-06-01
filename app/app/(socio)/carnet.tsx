import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator, TouchableOpacity,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import QRCode from 'react-native-qrcode-svg'
import { Header } from '@/components/shared/Header'
import { useCarnet } from '@/hooks/useCarnet'
import { colors, fonts } from '@/constants/theme'
import { useTheme } from '@/contexts/ThemeContext'

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

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CarnetScreen() {
  const insets          = useSafeAreaInsets()
  const { colors: tc }  = useTheme()
  const { loading, error, data } = useCarnet()

  return (
    <ScrollView
      style={[s.root, { backgroundColor: tc.fondo }]}
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 60 }}
      showsVerticalScrollIndicator={false}
    >
      <Header />

      <View style={s.edicionBar}>
        <Text style={s.edicionLabel}>SECCIÓN · SOCIOS</Text>
        <Text style={s.edicionFecha}>{fechaEdicion()}</Text>
      </View>

      <View style={s.saludoContainer}>
        <Text style={[s.saludoTexto, { color: tc.texto }]}>
          Tu carnet{data ? `, ${data.nombre.split(' ')[0]}.` : '.'}
        </Text>
        <View style={[s.divider, { backgroundColor: tc.grisClaro }]} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.oro} style={{ marginTop: 60 }} />
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
              <View style={[s.secLine, { backgroundColor: tc.grisClaro }]} />
            </View>

            <View style={[s.carnetCard, { backgroundColor: tc.card, borderColor: tc.grisClaro }]}>
              {/* Número de socio */}
              <Text style={[s.numLabel, { color: tc.muted }]}>Nº DE SOCIO</Text>
              <Text style={[s.numValue, { color: tc.texto }]}>{data.numero_socio}</Text>

              {/* QR Code */}
              <View style={s.qrWrapper}>
                <QRCode
                  value={data.qrContent}
                  size={210}
                  backgroundColor="transparent"
                  color={colors.tinta}
                />
              </View>

              {/* Countdown */}
              <View style={s.countdownRow}>
                <Text style={[s.countdownLabel, { color: tc.muted }]}>Se renueva en</Text>
                <Text style={[s.countdownNum, { color: tc.texto }]}>{data.secondsLeft}s</Text>
              </View>
              <View style={[s.progressTrack, { backgroundColor: tc.grisClaro }]}>
                <View
                  style={[
                    s.progressFill,
                    { width: `${(data.secondsLeft / 30) * 100}%` },
                  ]}
                />
              </View>

              {/* Estado */}
              <View style={[s.estadoBadge, { backgroundColor: ESTADO_COLOR[data.estado] ?? colors.grisClaro }]}>
                <Text style={s.estadoText}>
                  {ESTADO_LABEL[data.estado] ?? data.estado.toUpperCase()}
                </Text>
              </View>

              <Text style={[s.categoriaText, { color: tc.muted }]}>
                CATEGORÍA: {data.categoria.toUpperCase()}
              </Text>
            </View>
          </View>

          {/* ── CÓDIGO MANUAL ── */}
          <View style={[s.section, { marginTop: 18 }]}>
            <View style={s.secRow}>
              <Text style={s.secTitle}>CÓDIGO DE HOY</Text>
              <View style={[s.secLine, { backgroundColor: tc.grisClaro }]} />
            </View>
            <Text style={[s.codigoHint, { color: tc.muted }]}>
              Si la cámara no puede leer tu QR, dictá este código.
            </Text>
            <Text style={[s.codigoValue, { color: tc.texto }]}>
              {formatCodigo(data.code)}
            </Text>
          </View>
        </>
      ) : null}
    </ScrollView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
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

  saludoContainer: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 4 },
  saludoTexto:     { fontFamily: fonts.titulo, fontSize: 32, marginBottom: 14 },
  divider:         { height: 1 },

  section:  { paddingHorizontal: 20, paddingTop: 22 },
  secRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10 },
  secTitle: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 2.5, textTransform: 'uppercase', color: colors.oroHondo },
  secLine:  { flex: 1, height: 1 },

  carnetCard: {
    borderWidth: 1, borderRadius: 6, padding: 24,
    alignItems: 'center', gap: 12,
  },
  numLabel:  { fontFamily: fonts.label, fontSize: 8, letterSpacing: 2, textTransform: 'uppercase' },
  numValue:  { fontFamily: fonts.titulo, fontSize: 42, lineHeight: 48 },

  qrWrapper: {
    padding: 16, backgroundColor: colors.blanco,
    borderRadius: 6, borderWidth: 1, borderColor: colors.grisClaro,
    marginVertical: 4,
  },

  countdownRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 },
  countdownLabel: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase' },
  countdownNum:   { fontFamily: fonts.titulo, fontSize: 22 },

  progressTrack: { width: '100%', height: 3, borderRadius: 2, overflow: 'hidden' },
  progressFill:  { height: '100%', backgroundColor: colors.oro, borderRadius: 2 },

  estadoBadge: {
    paddingHorizontal: 14, paddingVertical: 5, borderRadius: 3, marginTop: 6,
  },
  estadoText: {
    fontFamily: fonts.label, fontSize: 10, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.blanco,
  },
  categoriaText: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1.5, marginTop: 2 },

  codigoHint:  { fontFamily: fonts.cuerpo, fontSize: 12, fontStyle: 'italic', marginBottom: 10 },
  codigoValue: {
    fontFamily: fonts.titulo, fontSize: 38, letterSpacing: 4,
    textAlign: 'center',
  },

  errorContainer: { padding: 40, alignItems: 'center' },
  errorText:      { fontFamily: fonts.cuerpo, fontSize: 14, textAlign: 'center', color: colors.rojoUrgente },
})
