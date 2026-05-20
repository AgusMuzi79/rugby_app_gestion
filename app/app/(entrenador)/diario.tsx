import {
  ScrollView, View, Text, TouchableOpacity,
  ActivityIndicator, StyleSheet,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Header } from '@/components/shared/Header'
import { useDiarioEntrenador, type TareaPendiente, type ProximoEvento } from '@/hooks/useDiarioEntrenador'
import { colors, fonts } from '@/constants/theme'
import { useTheme } from '@/contexts/ThemeContext'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function esHoy(fecha: string): boolean {
  return fecha === new Date().toISOString().split('T')[0]
}

function formatBadgeEvento(ev: ProximoEvento): string {
  const base = '● PRÓXIMO'
  const hora = ev.hora ? ` · ${ev.hora.slice(0, 5)}` : ''
  if (esHoy(ev.fecha)) return `${base} · HOY${hora}`
  const d     = new Date(ev.fecha + 'T12:00:00')
  const dias  = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']
  const meses = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']
  return `${base} · ${dias[d.getDay()]} ${d.getDate()} ${meses[d.getMonth()]}${hora}`
}

function nombreEvento(ev: ProximoEvento, divisionNombre: string): string {
  return ev.tipo === 'partido' ? `vs ${ev.rival ?? 'Rival'}` : divisionNombre
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

function CardEvento({
  ev, divisionNombre, onAsistencia,
}: { ev: ProximoEvento | null; divisionNombre: string; onAsistencia: () => void }) {
  return (
    <View style={s.eventoCard}>
      {ev ? (
        <>
          <Text style={s.eventoBadge}>{formatBadgeEvento(ev)}</Text>
          <Text style={s.eventoNombre} numberOfLines={2}>
            {nombreEvento(ev, divisionNombre)}
          </Text>
          {ev.lugar ? (
            <Text style={s.eventoLugar}>{ev.lugar}</Text>
          ) : null}
          <TouchableOpacity style={s.asistenciaBtn} onPress={onAsistencia} activeOpacity={0.85}>
            <Text style={s.asistenciaBtnText}>TOMAR ASISTENCIA →</Text>
          </TouchableOpacity>
        </>
      ) : (
        <Text style={s.sinEventoText}>Sin eventos programados hoy.</Text>
      )}
    </View>
  )
}

const TAREA_COLORS: Record<TareaPendiente['tipo'], string> = {
  RESULTADO: colors.oroHondo,
  MESA:      colors.tinta,
  LESIÓN:    colors.rojoUrgente,
}

function FilaTarea({ tarea, onPress }: { tarea: TareaPendiente; onPress: () => void }) {
  const { colors: tc } = useTheme()
  const badgeColor = TAREA_COLORS[tarea.tipo]
  return (
    <TouchableOpacity style={[s.tareaRow, { borderBottomColor: tc.grisClaro }]} onPress={onPress} activeOpacity={0.75}>
      <View style={[s.tareaBadge, { backgroundColor: badgeColor }]}>
        <Text style={s.tareaBadgeText}>{tarea.tipo}</Text>
      </View>
      <Text style={[s.tareaDesc, { color: tc.texto }]} numberOfLines={1}>{tarea.desc}</Text>
      <Text style={s.tareaArrow}>→</Text>
    </TouchableOpacity>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function DiarioEntrenadorScreen() {
  const router  = useRouter()
  const insets  = useSafeAreaInsets()
  const { loading, data } = useDiarioEntrenador()
  const { colors: tc } = useTheme()

  if (data.sinDivision && !loading) {
    return (
      <View style={[s.root, s.centered, { backgroundColor: tc.fondo }]}>
        <Text style={[s.sinDivTitle, { color: tc.texto }]}>Sin división asignada.</Text>
        <Text style={s.sinDivSub}>Contactá a la Subcomisión.</Text>
      </View>
    )
  }

  return (
    <ScrollView
      style={[s.root, { backgroundColor: tc.fondo }]}
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 48 }}
      showsVerticalScrollIndicator={false}
    >
      <Header />

      {/* Edition bar */}
      <View style={s.edicionBar}>
        <Text style={s.edicionLabel}>EDICIÓN · CANCHA</Text>
        <Text style={s.edicionMeta} numberOfLines={1}>
          {data.divisionNombre}{data.totalJugadores > 0 ? ` · ${data.totalJugadores} JUG.` : ''}
        </Text>
      </View>

      {/* Greeting */}
      <View style={s.saludoContainer}>
        <Text style={[s.saludoTexto, { color: tc.texto }]}>{data.nombre || '—'}.</Text>
        <View style={[s.saludoDivider, { backgroundColor: tc.grisClaro }]} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.oro} style={{ marginTop: 40 }} />
      ) : (
        <>
          {/* ── PRÓXIMO EVENTO ── */}
          <View style={s.section}>
            <SectionHeader title="PRÓXIMO EVENTO" />
            <CardEvento
              ev={data.proximoEvento}
              divisionNombre={data.divisionNombre}
              onAsistencia={() => router.navigate('/(entrenador)/asistencia')}
            />
          </View>

          {/* ── TAREAS PENDIENTES ── */}
          <View style={s.section}>
            <SectionHeader title="TAREAS PENDIENTES" />
            {data.tareas.length === 0 ? (
              <Text style={s.emptyText}>Sin tareas pendientes.</Text>
            ) : (
              <View style={s.tareasList}>
                {data.tareas.map(t => (
                  <FilaTarea
                    key={t.tipo}
                    tarea={t}
                    onPress={() => router.navigate(t.route)}
                  />
                ))}
              </View>
            )}
          </View>

          {/* ── ATAJOS RÁPIDOS ── */}
          <View style={s.section}>
            <SectionHeader title="ATAJOS RÁPIDOS" />
            <View style={s.grid}>
              <View style={s.gridRow}>
                <TouchableOpacity
                  style={[s.atajoCard, s.atajoCardGold]}
                  onPress={() => router.navigate('/(entrenador)/lesiones')}
                  activeOpacity={0.8}
                >
                  <Text style={[s.atajoText, s.atajoTextDark]}>+ LESIÓN</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.atajoCard, { backgroundColor: tc.fondo, borderColor: tc.texto }]}
                  onPress={() => router.navigate('/(entrenador)/partido')}
                  activeOpacity={0.8}
                >
                  <Text style={[s.atajoText, { color: tc.texto }]}>MESA PARTIDO</Text>
                </TouchableOpacity>
              </View>
              <View style={s.gridRow}>
                <TouchableOpacity
                  style={[s.atajoCard, { backgroundColor: tc.fondo, borderColor: tc.texto }]}
                  onPress={() => router.navigate('/(entrenador)/partido')}
                  activeOpacity={0.8}
                >
                  <Text style={[s.atajoText, { color: tc.texto }]}>RESULTADO</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.atajoCard, { backgroundColor: tc.fondo, borderColor: tc.texto }]}
                  onPress={() => router.navigate('/(entrenador)/lesiones')}
                  activeOpacity={0.8}
                >
                  <Text style={[s.atajoText, { color: tc.texto }]}>PROTOCOLOS</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.papel },
  centered:{ justifyContent: 'center', alignItems: 'center' },

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

  saludoContainer: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 4 },
  saludoTexto:     { fontFamily: fonts.titulo, fontSize: 32, color: colors.tinta, marginBottom: 14 },
  saludoDivider:   { height: 1, backgroundColor: colors.grisClaro },

  section:  { paddingHorizontal: 20, paddingTop: 22 },
  secRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 },
  secTitle: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 2.5, textTransform: 'uppercase', color: colors.oroHondo },
  secLine:  { flex: 1, height: 1, backgroundColor: colors.grisClaro },

  // Evento card
  eventoCard: {
    backgroundColor: colors.tinta, borderRadius: 4, padding: 22, gap: 0,
  },
  eventoBadge: {
    fontFamily: fonts.label, fontSize: 9, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.oro, marginBottom: 14,
  },
  eventoNombre: {
    fontFamily: fonts.titulo, fontSize: 30, color: colors.oro,
    lineHeight: 34, marginBottom: 10,
  },
  eventoLugar: {
    fontFamily: fonts.label, fontSize: 10, letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.grisClaro, marginBottom: 22,
  },
  sinEventoText: {
    fontFamily: fonts.cuerpo, fontSize: 14, fontStyle: 'italic',
    color: colors.grisClaro, marginBottom: 8,
  },
  asistenciaBtn: {
    backgroundColor: colors.oro, borderRadius: 4,
    paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  asistenciaBtnText: {
    fontFamily: fonts.label, fontSize: 11, letterSpacing: 2.5,
    textTransform: 'uppercase', color: colors.tinta, fontWeight: '700',
  },

  // Tareas
  tareasList: { gap: 2 },
  tareaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.grisClaro,
  },
  tareaBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 2, minWidth: 72, alignItems: 'center',
  },
  tareaBadgeText: {
    fontFamily: fonts.label, fontSize: 8, letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.blanco,
  },
  tareaDesc:  { flex: 1, fontFamily: fonts.cuerpo, fontSize: 12, color: colors.tinta },
  tareaArrow: { fontFamily: fonts.label, fontSize: 13, color: colors.oroHondo },

  // Atajos
  grid:    { gap: 10 },
  gridRow: { flexDirection: 'row', gap: 10 },
  atajoCard: {
    flex: 1, borderWidth: 1, borderColor: colors.tinta,
    paddingVertical: 26, alignItems: 'center', borderRadius: 4,
    backgroundColor: colors.papel,
  },
  atajoCardGold: { backgroundColor: colors.oro, borderColor: colors.oro },
  atajoText:     { fontFamily: fonts.label, fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: colors.tinta },
  atajoTextDark: { color: colors.tinta },

  emptyText:  { fontFamily: fonts.cuerpo, fontSize: 13, fontStyle: 'italic', color: '#9B9183' },
  sinDivTitle:{ fontFamily: fonts.titulo, fontSize: 24, color: colors.tinta, marginBottom: 8 },
  sinDivSub:  { fontFamily: fonts.cuerpo, fontSize: 13, fontStyle: 'italic', color: '#9B9183' },
})
