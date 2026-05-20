import {
  ScrollView, View, Text, TouchableOpacity,
  ActivityIndicator, StyleSheet,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Header } from '@/components/shared/Header'
import { useDiarioSubcomision, type CronicaItem } from '@/hooks/useDiarioSubcomision'
import { colors, fonts } from '@/constants/theme'
import { useTheme } from '@/contexts/ThemeContext'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fechaEdicion(): string {
  const d    = new Date()
  const dias  = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']
  const dd    = String(d.getDate()).padStart(2, '0')
  const mm    = String(d.getMonth() + 1).padStart(2, '0')
  const yy    = String(d.getFullYear()).slice(2)
  return `${dias[d.getDay()]} ${dd}.${mm}.${yy}`
}

function tiempoRelativo(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days  = Math.floor(hours / 24)
  if (days  > 0) return `HACE ${days}D`
  if (hours > 0) return `HACE ${hours}H`
  if (mins  > 0) return `HACE ${mins}MIN`
  return 'AHORA'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  const { colors: tc } = useTheme()
  return (
    <View style={s.secRow}>
      <Text style={s.secTitle}>{title}</Text>
      <View style={[s.secLine, { backgroundColor: tc.grisClaro }]} />
    </View>
  )
}

function StatCard({
  label, value, sub, variacion, urgente, accentOro,
}: {
  label: string; value: string; sub?: string
  variacion?: number | null; urgente?: boolean; accentOro?: boolean
}) {
  const { colors: tc } = useTheme()
  const varColor = (variacion ?? 0) >= 0 ? '#2ECC71' : colors.rojoUrgente
  const varText  = variacion === null || variacion === undefined
    ? null
    : `${variacion >= 0 ? '+' : ''}${variacion}% vs sem. ant.`

  return (
    <View style={[s.statCard, accentOro && s.statCardOro, { backgroundColor: tc.card, borderColor: tc.grisClaro }]}>
      <Text style={[s.statLabel, { color: tc.texto }]}>{label}</Text>
      <Text style={[s.statValue, { color: tc.texto }]}>{value}</Text>
      {sub      ? <Text style={s.statSub}>{sub}</Text>   : null}
      {varText  ? <Text style={[s.statVar, { color: varColor }]}>{varText}</Text> : null}
      {urgente  ? (
        <View style={s.urgenteBadge}>
          <Text style={s.urgenteText}>URGENTE</Text>
        </View>
      ) : null}
    </View>
  )
}

const BADGE_STYLE: Record<string, object> = {
  urgente: { backgroundColor: colors.rojoUrgente },
  alerta:  { backgroundColor: colors.oroHondo },
  info:    { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.grisClaro },
}
const BADGE_TEXT_COLOR: Record<string, string> = {
  urgente: colors.blanco,
  alerta:  colors.blanco,
  info:    colors.tinta,
}
const BADGE_LABEL: Record<string, string> = {
  urgente: 'URGENTE',
  alerta:  'ALERTA',
  info:    'INFO',
}

function FilaCronica({ item, onPress }: { item: CronicaItem; onPress: () => void }) {
  const { colors: tc } = useTheme()
  return (
    <TouchableOpacity style={[s.cronicaRow, { borderBottomColor: tc.grisClaro }]} onPress={onPress} activeOpacity={0.75}>
      <View style={[s.badge, BADGE_STYLE[item.tipo]]}>
        <Text style={[s.badgeText, { color: BADGE_TEXT_COLOR[item.tipo] }]}>
          {BADGE_LABEL[item.tipo]}
        </Text>
      </View>
      <View style={s.cronicaBody}>
        <Text style={[s.cronicaTitulo, { color: tc.texto }]} numberOfLines={1}>{item.titulo}</Text>
        <Text style={s.cronicaMensaje} numberOfLines={1}>
          {item.mensaje.length > 55 ? item.mensaje.slice(0, 55) + '…' : item.mensaje}
        </Text>
        <Text style={s.cronicaTiempo}>{tiempoRelativo(item.createdAt)}</Text>
      </View>
      <Text style={s.cronicaArrow}>→</Text>
    </TouchableOpacity>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function DiarioSubcomisionScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { loading, data } = useDiarioSubcomision()
  const { colors: tc } = useTheme()

  const primerNombre = data.nombre.split(' ')[0] || '—'

  return (
    <ScrollView
      style={[s.root, { backgroundColor: tc.fondo }]}
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 48 }}
      showsVerticalScrollIndicator={false}
    >
      <Header />

      {/* Edition bar */}
      <View style={s.edicionBar}>
        <Text style={s.edicionLabel}>EDICIÓN · SUBCOMISIÓN</Text>
        <Text style={s.edicionFecha}>{fechaEdicion()}</Text>
      </View>

      {/* Greeting */}
      <View style={s.saludoContainer}>
        <Text style={[s.saludoTexto, { color: tc.texto }]}>Buen día, {primerNombre}.</Text>
        <View style={[s.saludoDivider, { backgroundColor: tc.grisClaro }]} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.oro} style={{ marginTop: 40 }} />
      ) : (
        <>
          {/* ── PORTADA · HOY ── */}
          <View style={s.section}>
            <SectionHeader title="PORTADA · HOY" />
            <View style={s.grid}>
              <View style={s.gridRow}>
                <StatCard
                  label="ASISTENCIA 7D"
                  value={data.asistencia7D !== null ? `${data.asistencia7D}%` : '—'}
                  sub="últimos 7 días"
                  variacion={data.variacion7D}
                />
                <StatCard
                  label="FICHADOS"
                  value={String(data.totalFichados)}
                  sub="jugadores activos"
                />
              </View>
              <View style={s.gridRow}>
                <StatCard
                  label="LESIONES"
                  value={String(data.lesionesRecientes)}
                  sub="últimos 30 días"
                  urgente={data.tieneUrgencia}
                />
                <StatCard
                  label="COBRADO"
                  value={data.pctCobrado !== null ? `${data.pctCobrado}%` : '—'}
                  sub={data.ultimoEventoNombre ?? 'sin eventos'}
                  accentOro={data.pctCobrado !== null && data.pctCobrado >= 80}
                />
              </View>
            </View>
          </View>

          {/* ── CRÓNICA DEL DÍA ── */}
          <View style={s.section}>
            <SectionHeader title="CRÓNICA DEL DÍA" />
            {data.cronica.length === 0 ? (
              <Text style={s.emptyText}>Sin novedades recientes.</Text>
            ) : (
              <View style={s.cronicaList}>
                {data.cronica.map(item => (
                  <FilaCronica
                    key={item.id}
                    item={item}
                    onPress={() => router.navigate(item.route as never)}
                  />
                ))}
              </View>
            )}
          </View>

          {/* ── ATAJOS · SECCIÓN DIRECTIVA ── */}
          <View style={s.section}>
            <SectionHeader title="ATAJOS · SECCIÓN DIRECTIVA" />
            <View style={s.atajosCol}>
              <TouchableOpacity
                style={[s.atajoBtn, { borderColor: tc.texto }]}
                onPress={() => router.navigate('/(subcomision)/informes')}
                activeOpacity={0.75}
              >
                <Text style={[s.atajoBtnText, { color: tc.texto }]}>VER INFORMES →</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.atajoBtn, { borderColor: tc.texto }]}
                onPress={() => router.navigate('/(subcomision)/eventos')}
                activeOpacity={0.75}
              >
                <Text style={[s.atajoBtnText, { color: tc.texto }]}>NUEVO EVENTO →</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.papel },

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
  saludoTexto:     { fontFamily: fonts.titulo, fontSize: 34, color: colors.tinta, marginBottom: 14 },
  saludoDivider:   { height: 1, backgroundColor: colors.grisClaro },

  section:  { paddingHorizontal: 20, paddingTop: 22 },
  secRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 },
  secTitle: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 2.5, textTransform: 'uppercase', color: colors.oroHondo },
  secLine:  { flex: 1, height: 1, backgroundColor: colors.grisClaro },

  // Stat cards
  grid:    { gap: 10 },
  gridRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1, backgroundColor: colors.blanco, borderWidth: 1, borderColor: colors.grisClaro,
    borderRadius: 4, padding: 14, minHeight: 110,
    borderLeftWidth: 3, borderLeftColor: colors.grisClaro,
  },
  statCardOro: { borderLeftColor: colors.oro },
  statLabel: {
    fontFamily: fonts.label, fontSize: 8, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.tinta, marginBottom: 6,
  },
  statValue: {
    fontFamily: fonts.titulo, fontSize: 28, color: colors.tinta, lineHeight: 32, marginBottom: 4,
  },
  statSub: {
    fontFamily: fonts.cuerpo, fontSize: 10, fontStyle: 'italic', color: '#7C7267', lineHeight: 14,
  },
  statVar: {
    fontFamily: fonts.label, fontSize: 8, letterSpacing: 1, marginTop: 4,
  },
  urgenteBadge: {
    marginTop: 6, alignSelf: 'flex-start',
    backgroundColor: colors.tinta, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2,
  },
  urgenteText: {
    fontFamily: fonts.label, fontSize: 7, letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.oro,
  },

  // Crónica
  cronicaList: { gap: 0 },
  cronicaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.grisClaro,
  },
  badge: {
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 2,
    minWidth: 56, alignItems: 'center',
  },
  badgeText: {
    fontFamily: fonts.label, fontSize: 7, letterSpacing: 1.5, textTransform: 'uppercase',
  },
  cronicaBody:   { flex: 1 },
  cronicaTitulo: { fontFamily: fonts.cuerpo, fontSize: 12, color: colors.tinta, marginBottom: 2 },
  cronicaMensaje:{ fontFamily: fonts.label, fontSize: 9, color: '#9B9183', letterSpacing: 0.5, marginBottom: 3 },
  cronicaTiempo: { fontFamily: fonts.label, fontSize: 8, letterSpacing: 1.5, color: colors.oroHondo },
  cronicaArrow:  { fontFamily: fonts.label, fontSize: 13, color: colors.oroHondo },

  // Atajos
  atajosCol: { gap: 10 },
  atajoBtn: {
    borderWidth: 1, borderColor: colors.tinta,
    paddingVertical: 16, alignItems: 'center', borderRadius: 4,
  },
  atajoBtnText: {
    fontFamily: fonts.label, fontSize: 11, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.tinta,
  },

  emptyText: { fontFamily: fonts.cuerpo, fontSize: 13, fontStyle: 'italic', color: '#9B9183' },
})
