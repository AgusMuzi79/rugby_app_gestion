import {
  ScrollView, View, Text, TouchableOpacity,
  ActivityIndicator, StyleSheet, RefreshControl,
} from 'react-native'
import { useRef } from 'react'
import { useScrollToTop } from '@react-navigation/native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Header } from '@/components/shared/Header'
import { useDiarioEntrenador, type TareaPendiente, type ProximoEvento } from '@/hooks/useDiarioEntrenador'
import { colors, fonts } from '@/constants/theme'
import { FEATURES } from '@/constants/features'
import { etiquetaEvento } from '@/lib/tipoEvento'
import { fechaLocal } from '@/lib/fecha'
import { accionDelEvento } from '@/lib/entrenamientoHoy'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function esHoy(fecha: string): boolean {
  return fecha === fechaLocal()
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
  if (ev.tipo === 'partido') return `vs ${ev.rival ?? 'Rival'}`
  if (ev.tipo === 'actividad') return etiquetaEvento(ev)
  return divisionNombre
}

// Atajos rápidos. Mesa y resultado se cargan los dos desde la pantalla Partido.
// Los de lesiones se ocultan con FEATURES.lesiones (no se borran).
type Atajo = {
  label:      string
  ruta:       '/(entrenador)/partido' | '/(entrenador)/lesiones'
  destacado?: boolean
  lesiones?:  boolean
}
const ATAJOS: Atajo[] = [
  { label: '+ LESIÓN',     ruta: '/(entrenador)/lesiones', destacado: true, lesiones: true },
  { label: 'MESA PARTIDO', ruta: '/(entrenador)/partido' },
  { label: 'RESULTADO',    ruta: '/(entrenador)/partido' },
  { label: 'PROTOCOLOS',   ruta: '/(entrenador)/lesiones', lesiones: true },
]

// De a dos por fila.
function filasDeAtajos(atajos: Atajo[]): Atajo[][] {
  const filas: Atajo[][] = []
  for (let i = 0; i < atajos.length; i += 2) filas.push(atajos.slice(i, i + 2))
  return filas
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

// Asistencia sólo para el entrenamiento de hoy (con su id: doble turno); un
// partido de hoy se toma en Partido. Otro día no tiene botón: antes la lista
// caía en un entrenamiento fantasma creado hoy.
function CardEvento({
  ev, divisionNombre, onAsistencia, onPartido,
}: {
  ev: ProximoEvento | null
  divisionNombre: string
  onAsistencia: (eventoId: string) => void
  onPartido: () => void
}) {
  const accion = ev ? accionDelEvento(ev, fechaLocal()) : null
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
          {accion === 'asistencia' && (
            <TouchableOpacity
              style={s.asistenciaBtn}
              onPress={() => onAsistencia(ev.id)}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Text style={s.asistenciaBtnText}>TOMAR ASISTENCIA →</Text>
            </TouchableOpacity>
          )}
          {accion === 'partido' && (
            <TouchableOpacity style={s.asistenciaBtn} onPress={onPartido} activeOpacity={0.85} accessibilityRole="button">
              <Text style={s.asistenciaBtnText}>MESA Y ASISTENCIA →</Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        <Text style={s.sinEventoText}>Sin eventos programados hoy.</Text>
      )}
    </View>
  )
}

// Fondo del badge y su texto: blanco sólo sobre rojo (4.82:1); sobre oroHondo
// y crema el blanco no llega (2.97 / 1.15), va sobreOro.
const TAREA_COLORS: Record<TareaPendiente['tipo'], { bg: string; texto: string }> = {
  RESULTADO: { bg: colors.oroHondo,    texto: colors.sobreOro },
  MESA:      { bg: colors.tinta,       texto: colors.sobreOro },
  LESIÓN:    { bg: colors.rojoUrgente, texto: colors.blanco },
}

function FilaTarea({ tarea, onPress }: { tarea: TareaPendiente; onPress: () => void }) {
  const badge = TAREA_COLORS[tarea.tipo]
  return (
    <TouchableOpacity style={s.tareaRow} onPress={onPress} activeOpacity={0.75}>
      <View style={[s.tareaBadge, { backgroundColor: badge.bg }]}>
        <Text style={[s.tareaBadgeText, { color: badge.texto }]}>{tarea.tipo}</Text>
      </View>
      <Text style={s.tareaDesc} numberOfLines={1}>{tarea.desc}</Text>
      <Text style={s.tareaArrow}>→</Text>
    </TouchableOpacity>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function DiarioEntrenadorScreen() {
  const scrollRef = useRef<ScrollView>(null)
  useScrollToTop(scrollRef)
  const router  = useRouter()
  const insets  = useSafeAreaInsets()
  const { loading, refrescando, data, refetch } = useDiarioEntrenador()

  if (data.sinDivision && !loading) {
    return (
      <View style={s.sinDivWrap}>
        <Text style={s.sinDivTitle}>Sin división asignada.</Text>
        <Text style={s.sinDivSub}>Contactá a la Subcomisión.</Text>
      </View>
    )
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={s.root}
      contentContainerStyle={[s.scrollContent, { paddingTop: insets.top }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refetch} tintColor={colors.oro} />}
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
        <Text style={s.saludoTexto}>{data.nombre || '—'}.</Text>
        <View style={s.saludoDivider} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.oro} style={s.activityIndicator} />
      ) : (
        <>
          {/* ── PRÓXIMO EVENTO ── */}
          <View style={s.section}>
            <SectionHeader title="PRÓXIMO EVENTO" />
            <CardEvento
              ev={data.proximoEvento}
              divisionNombre={data.divisionNombre}
              onAsistencia={eventoId => router.navigate({
                pathname: '/(entrenador)/asistencia',
                params: { eventoId, ...(data.divisionId ? { divisionId: data.divisionId } : {}) },
              })}
              onPartido={() => router.navigate('/(entrenador)/partido')}
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
              {filasDeAtajos(ATAJOS.filter(a => FEATURES.lesiones || !a.lesiones)).map((fila, i) => (
                <View key={i} style={s.gridRow}>
                  {fila.map(a => (
                    <TouchableOpacity
                      key={a.label}
                      style={[s.atajoCard, a.destacado && s.atajoCardGold]}
                      onPress={() => router.navigate(a.ruta)}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.atajoText, a.destacado && s.atajoTextDark]}>{a.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
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
  root:          { flex: 1, backgroundColor: colors.fondo },
  scrollContent: { paddingBottom: 48 },
  activityIndicator: { marginTop: 40 },

  sinDivWrap: {
    flex: 1, backgroundColor: colors.fondo,
    justifyContent: 'center', alignItems: 'center',
  },

  edicionBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.tinta,
  },
  edicionLabel: {
    fontFamily: fonts.label, fontSize: 12, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.oroSobreClaro,
  },
  edicionMeta: {
    fontFamily: fonts.label, fontSize: 12, letterSpacing: 1,
    textTransform: 'uppercase', color: colors.grisClaro,
    flexShrink: 1, marginLeft: 8, textAlign: 'right',
  },

  saludoContainer: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 4 },
  saludoTexto:     { fontFamily: fonts.titulo, fontSize: 32, color: colors.texto, marginBottom: 14 },
  saludoDivider:   { height: 1, backgroundColor: colors.grisClaro },

  section:  { paddingHorizontal: 20, paddingTop: 22 },
  secRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 },
  secTitle: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 2.5, textTransform: 'uppercase', color: colors.oroHondo },
  secLine:  { flex: 1, height: 1, backgroundColor: colors.grisClaro },

  // Evento card
  eventoCard: {
    backgroundColor: colors.tinta, borderRadius: 4, padding: 22, gap: 0,
  },
  eventoBadge: {
    fontFamily: fonts.label, fontSize: 12, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.oroSobreClaro, marginBottom: 14,
  },
  eventoNombre: {
    fontFamily: fonts.titulo, fontSize: 30, color: colors.oroSobreClaro,
    lineHeight: 34, marginBottom: 10,
  },
  eventoLugar: {
    fontFamily: fonts.label, fontSize: 13, letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.grisClaro, marginBottom: 22,
  },
  sinEventoText: {
    fontFamily: fonts.cuerpo, fontSize: 16, fontStyle: 'italic',
    color: colors.grisClaro, marginBottom: 8,
  },
  asistenciaBtn: {
    backgroundColor: colors.oro, borderRadius: 4,
    paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  asistenciaBtnText: {
    fontFamily: fonts.label, fontSize: 13, letterSpacing: 2.5,
    textTransform: 'uppercase', color: colors.sobreOro, fontWeight: '700',
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
    fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.blanco,
  },
  tareaDesc:  { flex: 1, fontFamily: fonts.cuerpo, fontSize: 14, color: colors.texto },
  tareaArrow: { fontFamily: fonts.label, fontSize: 15, color: colors.oroHondo },

  // Atajos
  grid:    { gap: 10 },
  gridRow: { flexDirection: 'row', gap: 10 },
  atajoCard: {
    flex: 1, borderWidth: 1, borderColor: colors.texto,
    paddingVertical: 26, alignItems: 'center', borderRadius: 4,
    backgroundColor: colors.fondo,
  },
  atajoCardGold: { backgroundColor: colors.oro, borderColor: colors.oro },
  atajoText:     { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', color: colors.texto },
  atajoTextDark: { color: colors.sobreOro },

  emptyText:  { fontFamily: fonts.cuerpo, fontSize: 15, fontStyle: 'italic', color: '#9B9183' },
  sinDivTitle:{ fontFamily: fonts.titulo, fontSize: 25, color: colors.texto, marginBottom: 8 },
  sinDivSub:  { fontFamily: fonts.cuerpo, fontSize: 15, fontStyle: 'italic', color: '#9B9183' },
})
