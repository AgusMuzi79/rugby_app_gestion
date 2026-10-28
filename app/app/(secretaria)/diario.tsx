import {
  ScrollView, View, Text, StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native'
import { useRef } from 'react'
import { useScrollToTop } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Header } from '@/components/shared/Header'
import { ErrorCarga } from '@/components/shared/ErrorCarga'
import { useDiarioSecretaria } from '@/hooks/useDiarioSecretaria'
import { textoUltimoReporte } from '@/lib/secretariaNuvix'
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
  const { loading, refrescando, data, cargado, error, refetch } = useDiarioSecretaria()

  return (
    <ScrollView
      ref={scrollRef}
      style={s.root}
      contentContainerStyle={[s.scrollContent, { paddingTop: insets.top }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refetch} tintColor={colors.oro} />}
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

      {error ? <ErrorCarga mensaje={error} onReintentar={() => { void refetch() }} /> : null}

      {loading ? (
        <ActivityIndicator color={colors.oro} style={s.activityIndicator} />
      ) : !cargado ? null : (
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
                label="EN ROJO"
                value={String(data.estados.enRojo)}
                sub="2+ meses impagos (NUVIX)"
                accent={data.estados.enRojo > 0 ? colors.rojoUrgente : undefined}
              />
            </View>
            <View style={s.gridRowMt}>
              <StatCard
                label="PENDIENTES"
                value={String(data.estados.pendientes)}
                sub="sin foto validada"
                accent={data.estados.pendientes > 0 ? colors.estadoPendiente : undefined}
              />
              <StatCard
                label="INACTIVOS"
                value={String(data.estados.inactivos)}
                accent={undefined}
              />
            </View>
          </View>

          {/* ── ÚLTIMO REPORTE DE DEUDA (NUVIX) ── */}
          <View style={s.sectionReporte}>
            <SectionHeader title="ÚLTIMO REPORTE DE DEUDA" />
            <Text style={data.ultimoReporte ? s.reporteTexto : s.emptyText}>
              {textoUltimoReporte(data.ultimoReporte)}
            </Text>
            <Text style={s.reporteNota}>
              Los pagos se registran en NUVIX; el semáforo se actualiza al importar el reporte desde el panel web.
            </Text>
          </View>
        </>
      )}
    </ScrollView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: colors.fondo },
  scrollContent: { paddingBottom: 60 },
  activityIndicator: { marginTop: 60 },

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

  saludoContainer: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 4 },
  saludoTexto:     { fontFamily: fonts.titulo, fontSize: 34, color: colors.texto, marginBottom: 14 },
  divider:         { height: 1, backgroundColor: colors.borde },

  section:      { paddingHorizontal: 20, paddingTop: 22 },
  sectionReporte: { paddingHorizontal: 20, paddingTop: 22, marginTop: 22 },
  secRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 },
  secTitle: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 2.5, textTransform: 'uppercase', color: colors.oroHondo },
  secLine:  { flex: 1, height: 1, backgroundColor: colors.borde },

  gridRow:   { flexDirection: 'row', gap: 10 },
  gridRowMt: { flexDirection: 'row', gap: 10, marginTop: 10 },
  statCard: {
    flex: 1, borderWidth: 1, borderRadius: 4, padding: 14, minHeight: 90,
    borderLeftWidth: 3,
    backgroundColor: colors.card, borderColor: colors.borde, borderLeftColor: colors.borde,
  },
  statCardDefaultAccent: { borderLeftColor: colors.borde },
  statLabel: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6, color: colors.muted },
  statValue: { fontFamily: fonts.titulo, fontSize: 32, lineHeight: 36, color: colors.texto },
  statSub:   { fontFamily: fonts.cuerpo, fontSize: 13, fontStyle: 'italic', color: colors.muted, marginTop: 2 },

  reporteTexto: { fontFamily: fonts.cuerpo, fontSize: 16, color: colors.texto },
  reporteNota:  { fontFamily: fonts.cuerpo, fontSize: 13, fontStyle: 'italic', color: colors.muted, marginTop: 6 },

  emptyText: { fontFamily: fonts.cuerpo, fontSize: 15, fontStyle: 'italic', color: colors.muted },
})
