import {
  ScrollView, View, Text, TouchableOpacity,
  ActivityIndicator, StyleSheet,
} from 'react-native'
import { useRef } from 'react'
import { useScrollToTop } from '@react-navigation/native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Header } from '@/components/shared/Header'
import {
  useDiarioCoordinador,
  type EventoSemana,
  type AlertaJugador,
  type BarraAsistencia,
} from '@/hooks/useDiarioCoordinador'
import { colors, fonts } from '@/constants/theme'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DIAS_SEM = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']

function formatFecha(fecha: string): { dia: string; num: string } {
  const d = new Date(fecha + 'T12:00:00')
  return {
    dia: DIAS_SEM[d.getDay()],
    num: String(d.getDate()).padStart(2, '0'),
  }
}

function formatHora(hora: string | null): string {
  return hora ? hora.slice(0, 5) : ''
}

function nombreEvento(ev: EventoSemana): string {
  if (ev.tipo === 'partido') return `vs ${ev.rival ?? 'Rival'}`
  return ev.divisionNombre
}

function barColor(pct: number | null): string {
  if (pct === null)  return colors.grisClaro
  if (pct >= 85)     return '#4A7C59'
  if (pct >= 70)     return colors.oro
  return colors.rojoUrgente
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

function FilaEvento({ ev, onPress }: { ev: EventoSemana; onPress: () => void }) {
  const { dia, num } = formatFecha(ev.fecha)
  const hora         = formatHora(ev.hora)
  const detalle      = [hora, ev.lugar].filter(Boolean).join(' · ')

  return (
    <TouchableOpacity style={s.eventoRow} onPress={onPress} activeOpacity={0.75}>
      <View style={s.eventoFechaCol}>
        <Text style={s.eventoFechaDia}>{dia}</Text>
        <Text style={s.eventoFechaSlash}>/</Text>
        <Text style={s.eventoFechaNum}>{num}</Text>
      </View>
      <View style={s.eventoBody}>
        <Text style={s.eventoNombre} numberOfLines={1}>{nombreEvento(ev)}</Text>
        {detalle ? <Text style={s.eventoDetalle}>{detalle}</Text> : null}
        {ev.cobranzaActiva && (
          <View style={s.cobranzaBadge}>
            <Text style={s.cobranzaBadgeText}>COBRANZA ACTIVA</Text>
          </View>
        )}
      </View>
      <Text style={s.eventoArrow}>→</Text>
    </TouchableOpacity>
  )
}

function CardAlerta({ alerta }: { alerta: AlertaJugador }) {
  return (
    <View style={s.alertaCard}>
      <Text style={s.alertaLabel}>ALERTA · ASISTENCIA</Text>
      <Text style={s.alertaNombre}>{alerta.nombre}</Text>
      <Text style={s.alertaDiv}>{alerta.divisionNombre}</Text>
      <Text style={s.alertaDesc}>
        4 o más entrenamientos consecutivos con ausencia. Sugerido: contactar al manager.
      </Text>
    </View>
  )
}

function FilaBarra({ barra }: { barra: BarraAsistencia }) {
  const pct   = barra.pct ?? 0
  const color = barColor(barra.pct)

  return (
    <View style={s.barraContainer}>
      <View style={s.barraNombreRow}>
        <Text style={s.barraNombre} numberOfLines={1}>{barra.nombre}</Text>
        <Text style={[s.barraPct, { color }]}>
          {barra.pct !== null ? `${barra.pct}%` : '—'}
        </Text>
      </View>
      <View style={s.barraFondo}>
        {/* flex: pct is truly dynamic — must remain inline */}
        <View style={{ flex: pct, height: 4, backgroundColor: color, borderRadius: 2 }} />
        <View style={{ flex: Math.max(0, 100 - pct) }} />
      </View>
    </View>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function DiarioCoordinadorScreen() {
  const scrollRef = useRef<ScrollView>(null)
  useScrollToTop(scrollRef)
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { loading, data } = useDiarioCoordinador()

  if (data.sinDivisiones && !loading) {
    return (
      <View style={s.sinDivWrap}>
        <Text style={s.sinDivTitle}>Sin divisiones asignadas.</Text>
        <Text style={s.sinDivSub}>Contactá a la Subcomisión.</Text>
      </View>
    )
  }

  const primerNombre    = data.nombre.split(' ')[0] || '—'
  const divPrincipal    = data.divisiones[0]?.nombre ?? ''
  const metaDivisiones  = data.divisiones.length === 1
    ? divPrincipal
    : `${data.divisiones.length} divisiones`

  return (
    <ScrollView
      ref={scrollRef}
      style={s.root}
      contentContainerStyle={[s.scrollContent, { paddingTop: insets.top }]}
      showsVerticalScrollIndicator={false}
    >
      <Header />

      {/* Edition bar */}
      <View style={s.edicionBar}>
        <Text style={s.edicionLabel}>EDICIÓN · COORDINACIÓN</Text>
        <Text style={s.edicionMeta} numberOfLines={1}>
          {primerNombre} · {metaDivisiones}
        </Text>
      </View>

      {/* Título */}
      <View style={s.tituloContainer}>
        <Text style={s.tituloTexto}>
          Calendario{divPrincipal ? ` e ${divPrincipal}` : ''}.
        </Text>
        <View style={s.tituloDivider} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.oro} style={s.activityIndicator} />
      ) : (
        <>
          {/* ── ESTA SEMANA ── */}
          <View style={s.section}>
            <SectionHeader title="ESTA SEMANA" />
            {data.eventosSemana.length === 0 ? (
              <Text style={s.emptyText}>Sin eventos programados esta semana.</Text>
            ) : (
              <View style={s.eventosList}>
                {data.eventosSemana.map(ev => (
                  <FilaEvento
                    key={ev.id}
                    ev={ev}
                    onPress={() => router.navigate('/(coordinador)/calendario')}
                  />
                ))}
              </View>
            )}
          </View>

          {/* ── ALERTAS DE ASISTENCIA ── */}
          {data.alertas.length > 0 && (
            <View style={s.section}>
              <SectionHeader title="ALERTAS DE ASISTENCIA" />
              <View style={s.alertasList}>
                {data.alertas.slice(0, 3).map(a => (
                  <CardAlerta key={a.jugadorId} alerta={a} />
                ))}
                {data.alertas.length > 3 && (
                  <TouchableOpacity
                    onPress={() => router.navigate('/(coordinador)/asistencia')}
                    activeOpacity={0.75}
                  >
                    <Text style={s.verMasText}>
                      +{data.alertas.length - 3} más → VER ASISTENCIA
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* ── ASISTENCIA POR DIVISIÓN ── */}
          <View style={s.section}>
            <SectionHeader title="ASISTENCIA POR DIVISIÓN" />
            <View style={s.barrasList}>
              {data.asistencias.map(b => (
                <FilaBarra key={b.divisionId} barra={b} />
              ))}
            </View>
          </View>
        </>
      )}
    </ScrollView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: '#15110A' },
  scrollContent: { paddingBottom: 48 },
  activityIndicator: { marginTop: 40 },

  sinDivWrap: {
    flex: 1, backgroundColor: '#15110A',
    justifyContent: 'center', alignItems: 'center',
  },

  edicionBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.tinta,
  },
  edicionLabel: {
    fontFamily: fonts.label, fontSize: 9, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.oro,
  },
  edicionMeta: {
    fontFamily: fonts.label, fontSize: 9, letterSpacing: 1,
    textTransform: 'uppercase', color: colors.grisClaro,
    flexShrink: 1, marginLeft: 8, textAlign: 'right',
  },

  tituloContainer: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 4 },
  tituloTexto:     { fontFamily: fonts.titulo, fontSize: 28, color: colors.tinta, marginBottom: 14, lineHeight: 34 },
  tituloDivider:   { height: 1, backgroundColor: colors.grisClaro },

  section:  { paddingHorizontal: 20, paddingTop: 22 },
  secRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 },
  secTitle: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 2.5, textTransform: 'uppercase', color: colors.oroHondo },
  secLine:  { flex: 1, height: 1, backgroundColor: colors.grisClaro },

  // Eventos semana
  eventosList: { gap: 0 },
  eventoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.grisClaro,
  },
  eventoFechaCol: { width: 34, alignItems: 'center', gap: 0 },
  eventoFechaDia: {
    fontFamily: fonts.label, fontSize: 9, letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.oroHondo,
  },
  eventoFechaSlash:{ fontFamily: fonts.label, fontSize: 8, color: colors.grisClaro },
  eventoFechaNum: { fontFamily: fonts.titulo, fontSize: 18, color: colors.tinta, lineHeight: 22 },
  eventoBody:     { flex: 1, gap: 3 },
  eventoNombre:   { fontFamily: fonts.cuerpo, fontSize: 13, color: colors.tinta },
  eventoDetalle:  { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1, color: '#9B9183', textTransform: 'uppercase' },
  cobranzaBadge: {
    alignSelf: 'flex-start', marginTop: 3,
    backgroundColor: colors.oro, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2,
  },
  cobranzaBadgeText: {
    fontFamily: fonts.label, fontSize: 7, letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.tinta,
  },
  eventoArrow: { fontFamily: fonts.label, fontSize: 13, color: colors.oroHondo },

  // Alertas
  alertasList: { gap: 10 },
  alertaCard: {
    backgroundColor: '#15110A',
    borderWidth: 1, borderColor: colors.oro,
    borderRadius: 4, padding: 16, gap: 4,
  },
  alertaLabel: {
    fontFamily: fonts.label, fontSize: 8, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.oroHondo, marginBottom: 4,
  },
  alertaNombre: { fontFamily: fonts.cuerpo, fontSize: 14, color: colors.tinta, fontWeight: '600' },
  alertaDiv:    { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1, color: '#9B9183', textTransform: 'uppercase', marginBottom: 6 },
  alertaDesc:   { fontFamily: fonts.cuerpo, fontSize: 12, color: '#7C7267', fontStyle: 'italic', lineHeight: 18 },
  verMasText: {
    fontFamily: fonts.label, fontSize: 9, letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.oroHondo, paddingTop: 4,
  },

  // Barras asistencia
  barrasList:    { gap: 18 },
  barraContainer:{ gap: 7 },
  barraNombreRow:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  barraNombre:   { flex: 1, fontFamily: fonts.cuerpo, fontSize: 13, color: colors.tinta },
  barraPct:      { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1 },
  barraFondo: {
    flexDirection: 'row', height: 4,
    backgroundColor: colors.grisClaro, borderRadius: 2, overflow: 'hidden',
  },

  emptyText:  { fontFamily: fonts.cuerpo, fontSize: 13, fontStyle: 'italic', color: '#9B9183' },
  sinDivTitle:{ fontFamily: fonts.titulo, fontSize: 24, color: colors.tinta, marginBottom: 8 },
  sinDivSub:  { fontFamily: fonts.cuerpo, fontSize: 13, fontStyle: 'italic', color: '#9B9183' },
})
