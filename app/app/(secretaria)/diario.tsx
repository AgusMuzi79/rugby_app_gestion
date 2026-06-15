import {
  ScrollView, View, Text, StyleSheet, ActivityIndicator,
} from 'react-native'
import { useRef } from 'react'
import { useScrollToTop } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Header } from '@/components/shared/Header'
import { useDiarioSecretaria } from '@/hooks/useDiarioSecretaria'
import { colors, fonts } from '@/constants/theme'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fechaEdicion(): string {
  const d    = new Date()
  const dias = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']
  const dd   = String(d.getDate()).padStart(2, '0')
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const yy   = String(d.getFullYear()).slice(2)
  return `${dias[d.getDay()]} ${dd}.${mm}.${yy}`
}

function periodoLabel(periodo: string): string {
  const [anio, mes] = periodo.split('-')
  const meses = [
    '', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
  ]
  return `${meses[Number(mes)]} ${anio}`
}

function montoLabel(monto: number): string {
  return `$${monto.toLocaleString('es-AR', { minimumFractionDigits: 0 })}`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={s.secRow}>
      <Text style={s.secTitle}>{title}</Text>
      <View style={s.secLine} />
    </View>
  )
}

function StatCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: string
}) {
  return (
    <View style={[s.statCard, accent ? { borderLeftColor: accent } : s.statCardDefaultAccent]}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
      {sub ? <Text style={s.statSub}>{sub}</Text> : null}
    </View>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function DiarioSecretariaScreen() {
  const scrollRef = useRef<ScrollView>(null)
  useScrollToTop(scrollRef)
  const insets = useSafeAreaInsets()
  const { loading, data } = useDiarioSecretaria()

  return (
    <ScrollView
      ref={scrollRef}
      style={s.root}
      contentContainerStyle={[s.scrollContent, { paddingTop: insets.top }]}
      showsVerticalScrollIndicator={false}
    >
      <Header />

      <View style={s.edicionBar}>
        <Text style={s.edicionLabel}>EDICIÓN · SECRETARÍA</Text>
        <Text style={s.edicionFecha}>{fechaEdicion()}</Text>
      </View>

      <View style={s.saludoContainer}>
        <Text style={s.saludoTexto}>Buenos días.</Text>
        <View style={s.divider} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.oro} style={s.activityIndicator} />
      ) : (
        <>
          {/* ── RESUMEN DE SOCIOS ── */}
          <View style={s.section}>
            <SectionHeader title="RESUMEN DE SOCIOS" />
            <View style={s.gridRow}>
              <StatCard
                label="ACTIVOS"
                value={String(data.estados.activos)}
                sub={`de ${data.totalSocios} total`}
                accent={colors.oro}
              />
              <StatCard
                label="MOROSOS"
                value={String(data.estados.morosos)}
                sub="con cuota vencida"
                accent={data.estados.morosos > 0 ? colors.oroHondo : undefined}
              />
            </View>
            <View style={s.gridRowMt}>
              <StatCard
                label="PENDIENTES"
                value={String(data.estados.pendientes)}
                sub="sin foto validada"
                accent={data.estados.pendientes > 0 ? '#E67E22' : undefined}
              />
              <StatCard
                label="INACTIVOS"
                value={String(data.estados.inactivos)}
                accent={undefined}
              />
            </View>
          </View>

          {/* ── ÚLTIMOS PAGOS ── */}
          <View style={s.sectionUltimosPagos}>
            <SectionHeader title="ÚLTIMOS PAGOS APROBADOS" />
            {data.pagosRecientes.length === 0 ? (
              <Text style={s.emptyText}>Sin pagos recientes.</Text>
            ) : (
              <View>
                {data.pagosRecientes.map(p => (
                  <View key={p.id} style={s.pagoRow}>
                    <View style={s.pagoLeft}>
                      <Text style={s.pagoNombre} numberOfLines={1}>
                        {p.nombre}
                      </Text>
                      <Text style={s.pagoPeriodo}>
                        {periodoLabel(p.periodo)} · Nº {p.numero_socio}
                      </Text>
                    </View>
                    <View style={s.pagoRight}>
                      <Text style={s.pagoMonto}>
                        {montoLabel(p.monto)}
                      </Text>
                      <Text style={s.pagoForma}>
                        {p.forma_pago.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </>
      )}
    </ScrollView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#15110A' },
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
  saludoTexto:     { fontFamily: fonts.titulo, fontSize: 34, color: '#F3EFE4', marginBottom: 14 },
  divider:         { height: 1, backgroundColor: '#2C2418' },

  section:      { paddingHorizontal: 20, paddingTop: 22 },
  sectionUltimosPagos: { paddingHorizontal: 20, paddingTop: 22, marginTop: 22 },
  secRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 },
  secTitle: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 2.5, textTransform: 'uppercase', color: colors.oroHondo },
  secLine:  { flex: 1, height: 1, backgroundColor: '#2C2418' },

  gridRow:   { flexDirection: 'row', gap: 10 },
  gridRowMt: { flexDirection: 'row', gap: 10, marginTop: 10 },
  statCard: {
    flex: 1, borderWidth: 1, borderRadius: 4, padding: 14, minHeight: 90,
    borderLeftWidth: 3,
    backgroundColor: '#1C1710', borderColor: '#2C2418', borderLeftColor: '#2C2418',
  },
  statCardDefaultAccent: { borderLeftColor: '#2C2418' },
  statLabel: { fontFamily: fonts.label, fontSize: 8, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6, color: '#8E8574' },
  statValue: { fontFamily: fonts.titulo, fontSize: 32, lineHeight: 36, color: '#F3EFE4' },
  statSub:   { fontFamily: fonts.cuerpo, fontSize: 10, fontStyle: 'italic', color: '#7C7267', marginTop: 2 },

  pagoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2C2418',
  },
  pagoLeft:   { flex: 1 },
  pagoNombre: { fontFamily: fonts.cuerpo, fontSize: 13, color: '#F3EFE4', marginBottom: 2 },
  pagoPeriodo:{ fontFamily: fonts.label, fontSize: 9, letterSpacing: 1, color: '#8E8574' },
  pagoRight:  { alignItems: 'flex-end', gap: 2 },
  pagoMonto:  { fontFamily: fonts.titulo, fontSize: 18, color: '#F3EFE4' },
  pagoForma:  { fontFamily: fonts.label, fontSize: 8, letterSpacing: 1.5, color: '#8E8574' },

  emptyText: { fontFamily: fonts.cuerpo, fontSize: 13, fontStyle: 'italic', color: '#8E8574' },
})
