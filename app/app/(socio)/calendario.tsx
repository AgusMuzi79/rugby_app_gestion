import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  TouchableOpacity, RefreshControl,
} from 'react-native'
import { useRef } from 'react'
import { useScrollToTop } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  useCalendarioSocio,
  type FiltrodeDeporte,
  type PartidoCalendario,
  type ResultadoCalendario,
} from '@/hooks/useCalendarioSocio'
import { Header } from '@/components/shared/Header'
import { colors, fonts } from '@/constants/theme'

// ─── Tokens ───────────────────────────────────────────────────────────────────

const FONDO   = '#15110A'
const CARD    = '#1C1710'
const TEXTO   = '#F3EFE4'
const MUTED   = '#8E8574'
const DIVIDER = '#2C2418'
const ORO     = '#F5B41C'
const VERDE   = '#22C55E'
const ROJO    = '#EF4444'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fechaEdicion(): string {
  const d    = new Date()
  const dias = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']
  const dd   = String(d.getDate()).padStart(2, '0')
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const yy   = String(d.getFullYear()).slice(2)
  return `${dias[d.getDay()]} ${dd}.${mm}.${yy}`
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fechaCorta(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', {
    weekday: 'short', day: 'numeric', month: 'short',
  }).toUpperCase()
}

// ─── Filtro chips ─────────────────────────────────────────────────────────────

const FILTROS: { value: FiltrodeDeporte; label: string }[] = [
  { value: 'todos',  label: 'TODOS'  },
  { value: 'rugby',  label: 'RUGBY'  },
  { value: 'hockey', label: 'HOCKEY' },
  { value: 'tenis',  label: 'TENIS'  },
]

function FiltroBar({ filtro, onChange }: { filtro: FiltrodeDeporte; onChange: (f: FiltrodeDeporte) => void }) {
  return (
    <View style={s.filtroBar}>
      {FILTROS.map(f => (
        <TouchableOpacity
          key={f.value}
          style={[s.filtroChip, filtro === f.value && s.filtroChipActivo]}
          onPress={() => onChange(f.value)}
          activeOpacity={0.7}
        >
          <Text style={[s.filtroChipTexto, filtro === f.value && s.filtroChipTextoActivo]}>
            {f.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

// ─── Card partido ─────────────────────────────────────────────────────────────

function CardPartido({ partido }: { partido: PartidoCalendario }) {
  return (
    <View style={[s.card, partido.es_mi_division && s.cardDestacada]}>
      {partido.es_mi_division && (
        <View style={s.miDivisionBadge}>
          <Text style={s.miDivisionTexto}>MI EQUIPO</Text>
        </View>
      )}
      <Text style={s.partidoFecha}>{fechaCorta(partido.fecha)}</Text>
      {partido.hora && <Text style={s.partidoHora}>{partido.hora.slice(0, 5)}</Text>}
      <Text style={s.partidoVs}>vs. {partido.rival}</Text>
      {partido.lugar && <Text style={s.partidoLugar}>{partido.lugar}</Text>}
      <Text style={s.partidoDiv}>{partido.division_nombre.toUpperCase()}</Text>
    </View>
  )
}

// ─── Card resultado ───────────────────────────────────────────────────────────

function CardResultado({ resultado }: { resultado: ResultadoCalendario }) {
  const tieneScore  = resultado.puntos_propios !== null && resultado.puntos_rival !== null
  const gano        = tieneScore && resultado.puntos_propios! > resultado.puntos_rival!
  const empato      = tieneScore && resultado.puntos_propios === resultado.puntos_rival

  return (
    <View style={[s.card, resultado.es_mi_division && s.cardDestacada]}>
      {resultado.es_mi_division && (
        <View style={s.miDivisionBadge}>
          <Text style={s.miDivisionTexto}>MI EQUIPO</Text>
        </View>
      )}
      <Text style={s.partidoFecha}>{fechaCorta(resultado.fecha)}</Text>
      <Text style={s.partidoVs}>vs. {resultado.rival}</Text>
      {tieneScore ? (
        <Text style={[
          s.scoreTexto,
          { color: gano ? VERDE : empato ? MUTED : ROJO },
        ]}>
          {resultado.puntos_propios} — {resultado.puntos_rival}
        </Text>
      ) : (
        <Text style={s.sinScore}>Sin resultado registrado</Text>
      )}
      <Text style={s.partidoDiv}>{resultado.division_nombre.toUpperCase()}</Text>
    </View>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CalendarioSocioScreen() {
  const insets = useSafeAreaInsets()
  const {
    loading, error,
    jugadorDivisionNombre,
    partidos, resultados,
    filtroDeporte, setFiltroDeporte,
    recargar,
  } = useCalendarioSocio()

  const listRef = useRef<FlatList>(null)
  useScrollToTop(listRef)

  type Item =
    | { kind: 'header_proximos' }
    | { kind: 'banner_jugador' }
    | { kind: 'partido'; data: PartidoCalendario }
    | { kind: 'empty_partidos' }
    | { kind: 'header_resultados' }
    | { kind: 'resultado'; data: ResultadoCalendario }
    | { kind: 'empty_resultados' }

  const items: Item[] = [
    ...(jugadorDivisionNombre ? [{ kind: 'banner_jugador' } as Item] : []),
    { kind: 'header_proximos' },
    ...(partidos.length > 0
      ? partidos.map(p => ({ kind: 'partido', data: p } as Item))
      : [{ kind: 'empty_partidos' } as Item]
    ),
    { kind: 'header_resultados' },
    ...(resultados.length > 0
      ? resultados.map(r => ({ kind: 'resultado', data: r } as Item))
      : [{ kind: 'empty_resultados' } as Item]
    ),
  ]

  function renderItem({ item }: { item: Item }) {
    if (item.kind === 'banner_jugador') {
      return (
        <View style={s.bannerJugador}>
          <Text style={s.bannerJugadorTexto}>Jugás en {jugadorDivisionNombre}</Text>
        </View>
      )
    }
    if (item.kind === 'header_proximos') {
      return <Text style={s.seccionHeader}>PRÓXIMOS PARTIDOS</Text>
    }
    if (item.kind === 'partido') {
      return <CardPartido partido={item.data} />
    }
    if (item.kind === 'empty_partidos') {
      return <Text style={s.vacio}>Sin partidos en los próximos 60 días.</Text>
    }
    if (item.kind === 'header_resultados') {
      return <Text style={[s.seccionHeader, { marginTop: 24 }]}>ÚLTIMOS RESULTADOS</Text>
    }
    if (item.kind === 'resultado') {
      return <CardResultado resultado={item.data} />
    }
    if (item.kind === 'empty_resultados') {
      return <Text style={s.vacio}>Sin partidos recientes.</Text>
    }
    return null
  }

  return (
    <View style={s.root}>
      <View style={{ paddingTop: insets.top }}>
        <Header />
        <View style={s.edicionBar}>
          <Text style={s.edicionLabel}>SECCIÓN · CALENDARIO</Text>
          <Text style={s.edicionFecha}>{fechaEdicion()}</Text>
        </View>
        <FiltroBar filtro={filtroDeporte} onChange={setFiltroDeporte} />
      </View>

      {loading ? (
        <ActivityIndicator color={ORO} size="large" style={{ marginTop: 60 }} />
      ) : error ? (
        <View style={s.centrado}>
          <Text style={s.errorTexto}>{error}</Text>
          <TouchableOpacity onPress={recargar} style={s.reintentarBtn} activeOpacity={0.8}>
            <Text style={s.reintentarTexto}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(item, idx) =>
            item.kind === 'partido'   ? item.data.id :
            item.kind === 'resultado' ? item.data.id :
            `${item.kind}-${idx}`
          }
          renderItem={renderItem}
          contentContainerStyle={s.listaContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={recargar} tintColor={ORO} />}
        />
      )}
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:     { flex: 1, backgroundColor: FONDO },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 24 },

  edicionBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.tinta,
  },
  edicionLabel: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: colors.oro },
  edicionFecha: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: colors.grisClaro },

  filtroBar: {
    flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 16, gap: 8,
  },
  filtroChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1, borderColor: DIVIDER, backgroundColor: CARD,
  },
  filtroChipActivo:      { backgroundColor: ORO, borderColor: ORO },
  filtroChipTexto:       { fontFamily: fonts.label, fontSize: 10, letterSpacing: 1.5, color: MUTED },
  filtroChipTextoActivo: { color: FONDO },

  listaContent: { paddingHorizontal: 20, paddingBottom: 40 },
  seccionHeader: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 3, color: MUTED, marginBottom: 10 },
  vacio:         { fontFamily: fonts.cuerpo, color: MUTED, fontStyle: 'italic', fontSize: 13, marginBottom: 8 },

  card: {
    backgroundColor: CARD, borderRadius: 6, borderWidth: 1, borderColor: DIVIDER,
    padding: 16, marginBottom: 8, gap: 4,
  },
  cardDestacada: { borderColor: ORO },

  miDivisionBadge: {
    alignSelf: 'flex-start', backgroundColor: ORO + '22', borderRadius: 3,
    paddingHorizontal: 6, paddingVertical: 2, marginBottom: 4,
  },
  miDivisionTexto: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1.5, color: ORO },

  partidoFecha: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.5, color: MUTED },
  partidoHora:  { fontFamily: fonts.label, fontSize: 10, color: MUTED, letterSpacing: 1 },
  partidoVs:    { fontFamily: fonts.cuerpo, fontSize: 17, color: TEXTO, fontWeight: '600', marginTop: 2 },
  partidoLugar: { fontFamily: fonts.cuerpo, fontSize: 12, color: MUTED },
  partidoDiv:   { fontFamily: fonts.label, fontSize: 10, color: ORO, letterSpacing: 1.5, marginTop: 4 },

  scoreTexto: { fontFamily: fonts.titulo, fontSize: 22, fontWeight: '700', marginTop: 2 },
  sinScore:   { fontFamily: fonts.cuerpo, fontSize: 12, color: MUTED, fontStyle: 'italic' },

  bannerJugador: {
    backgroundColor: ORO + '22', borderRadius: 6, borderWidth: 1, borderColor: ORO,
    paddingVertical: 10, paddingHorizontal: 16, marginBottom: 16,
  },
  bannerJugadorTexto: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.5, color: ORO },

  errorTexto:    { fontFamily: fonts.cuerpo, color: ROJO, fontSize: 14 },
  reintentarBtn: { marginTop: 8, paddingVertical: 8, paddingHorizontal: 16, borderWidth: 1, borderColor: ORO, borderRadius: 4 },
  reintentarTexto: { fontFamily: fonts.label, fontSize: 11, color: ORO, letterSpacing: 1 },
})
