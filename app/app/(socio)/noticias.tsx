import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  TouchableOpacity,
} from 'react-native'
import { useState, useMemo, useRef } from 'react'
import { useScrollToTop } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Header } from '@/components/shared/Header'
import { useNoticias, type Noticia } from '@/hooks/useNoticias'
import { colors, fonts } from '@/constants/theme'

// ─── Types ────────────────────────────────────────────────────────────────────

type Filtro = 'todas' | 'rugby' | 'hockey' | 'tenis'

const FILTROS: { value: Filtro; label: string }[] = [
  { value: 'todas',  label: 'TODAS'  },
  { value: 'rugby',  label: 'RUGBY'  },
  { value: 'hockey', label: 'HOCKEY' },
  { value: 'tenis',  label: 'TENIS'  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fechaEdicion(): string {
  const d    = new Date()
  const dias = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']
  const dd   = String(d.getDate()).padStart(2, '0')
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const yy   = String(d.getFullYear()).slice(2)
  return `${dias[d.getDay()]} ${dd}.${mm}.${yy}`
}

function tiempoRelativo(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime()
  const days  = Math.floor(diff / 86400000)
  const hours = Math.floor(diff / 3600000)
  if (days  > 0) return `HACE ${days}D`
  if (hours > 0) return `HACE ${hours}H`
  return 'HOY'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FiltroBar({
  filtro,
  onChange,
}: {
  filtro:   Filtro
  onChange: (f: Filtro) => void
}) {
  return (
    <View style={s.filtroBar}>
      {FILTROS.map(f => {
        const activo = filtro === f.value
        return (
          <TouchableOpacity
            key={f.value}
            style={[s.filtroChip, activo ? s.filtroChipActivo : s.filtroChipInactivo]}
            onPress={() => onChange(f.value)}
            activeOpacity={0.75}
          >
            <Text style={[s.filtroText, activo ? s.filtroTextActivo : s.filtroTextInactivo]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

function NoticiaCard({ noticia }: { noticia: Noticia }) {
  const deporte = (['rugby', 'hockey', 'tenis'] as const)
    .find(d => noticia.etiquetas.includes(d))

  return (
    <View style={s.card}>
      <View style={s.cardMeta}>
        <Text style={s.metaTiempo}>{tiempoRelativo(noticia.created_at)}</Text>
        {deporte && (
          <View style={s.deporteBadge}>
            <Text style={s.deporteText}>
              {deporte.toUpperCase()}
            </Text>
          </View>
        )}
      </View>

      <Text style={s.cardTitulo}>{noticia.titulo}</Text>

      <View style={s.divider} />

      <Text style={s.cardCuerpo} numberOfLines={5}>
        {noticia.cuerpo}
      </Text>

      <Text style={s.cardAutor}>
        — {noticia.autor}
      </Text>
    </View>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function NoticiasPublicasScreen() {
  const insets = useSafeAreaInsets()
  const { noticias, loading, refetch } = useNoticias(true)
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const scrollRef = useRef<FlatList>(null)
  useScrollToTop(scrollRef)

  const noticiasFiltradas = useMemo(() =>
    filtro === 'todas'
      ? noticias
      : noticias.filter(n => n.etiquetas.includes(filtro)),
    [noticias, filtro]
  )

  return (
    <View style={s.root}>
      <View style={[s.topSection, { paddingTop: insets.top }]}>
        <Header />
        <View style={s.edicionBar}>
          <Text style={s.edicionLabel}>SECCIÓN · NOTICIAS</Text>
          <Text style={s.edicionFecha}>{fechaEdicion()}</Text>
        </View>
        <View style={s.secRow}>
          <Text style={s.secTitle}>NOVEDADES DEL CLUB</Text>
          <View style={s.secLine} />
        </View>
        <FiltroBar filtro={filtro} onChange={setFiltro} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.oro} style={s.activityIndicator} />
      ) : noticiasFiltradas.length === 0 ? (
        <View style={s.emptyContainer}>
          <Text style={s.emptyText}>
            {filtro === 'todas'
              ? 'No hay noticias publicadas aún.'
              : `No hay noticias de ${filtro} por el momento.`}
          </Text>
        </View>
      ) : (
        <FlatList
          ref={scrollRef}
          data={noticiasFiltradas}
          keyExtractor={n => n.id}
          contentContainerStyle={s.listContent}
          renderItem={({ item }) => <NoticiaCard noticia={item} />}
          onRefresh={refetch}
          refreshing={loading}
        />
      )}
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: '#15110A' },
  topSection:    {},
  activityIndicator: { marginTop: 40 },
  listContent:   { paddingHorizontal: 20, paddingBottom: 60, gap: 16, paddingTop: 16 },

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

  secRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, gap: 10,
  },
  secTitle: {
    fontFamily: fonts.label, fontSize: 9, letterSpacing: 2.5,
    textTransform: 'uppercase', color: colors.oroHondo,
  },
  secLine: { flex: 1, height: 1, backgroundColor: '#2C2418' },

  // Filtro bar
  filtroBar: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#2C2418',
  },
  filtroChip: {
    flex: 1, borderWidth: 1, borderRadius: 3,
    paddingHorizontal: 12, paddingVertical: 6,
    alignItems: 'center',
  },
  filtroChipActivo:  { backgroundColor: colors.tinta, borderColor: colors.tinta },
  filtroChipInactivo:{ backgroundColor: 'transparent', borderColor: '#2C2418' },
  filtroText: {
    fontFamily: fonts.label, fontSize: 9, letterSpacing: 2,
  },
  filtroTextActivo:  { color: colors.oro },
  filtroTextInactivo:{ color: '#8E8574' },

  // Cards
  card: {
    borderWidth: 1, borderRadius: 4, padding: 18, gap: 10,
    backgroundColor: '#1C1710', borderColor: '#2C2418',
  },
  cardMeta:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaTiempo: {
    fontFamily: fonts.label, fontSize: 8, letterSpacing: 2, color: colors.oroHondo,
  },
  deporteBadge: {
    borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 2,
    borderColor: '#2C2418',
  },
  deporteText: { fontFamily: fonts.label, fontSize: 8, letterSpacing: 1.5, color: colors.oroHondo },

  cardTitulo: { fontFamily: fonts.titulo, fontSize: 22, lineHeight: 28, color: '#F3EFE4' },
  divider:    { height: 1, backgroundColor: '#2C2418' },
  cardCuerpo: { fontFamily: fonts.cuerpo, fontSize: 13, lineHeight: 20, color: '#F3EFE4' },
  cardAutor:  { fontFamily: fonts.cuerpo, fontSize: 11, fontStyle: 'italic', color: '#8E8574' },

  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText:      { fontFamily: fonts.cuerpo, fontSize: 14, fontStyle: 'italic', color: '#8E8574' },
})
