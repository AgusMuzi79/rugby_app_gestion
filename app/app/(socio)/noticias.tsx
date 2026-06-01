import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Header } from '@/components/shared/Header'
import { useNoticias, type Noticia } from '@/hooks/useNoticias'
import { colors, fonts } from '@/constants/theme'
import { useTheme } from '@/contexts/ThemeContext'

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

// ─── Sub-component ────────────────────────────────────────────────────────────

function NoticiaCard({ noticia }: { noticia: Noticia }) {
  const { colors: tc } = useTheme()

  return (
    <View style={[s.card, { backgroundColor: tc.card, borderColor: tc.grisClaro }]}>
      <View style={s.cardMeta}>
        <Text style={s.metaTiempo}>{tiempoRelativo(noticia.created_at)}</Text>
        {noticia.etiquetas.length > 0 && (
          <View style={s.etiquetasRow}>
            {noticia.etiquetas.slice(0, 3).map(et => (
              <View key={et} style={[s.etiqueta, { borderColor: tc.grisClaro }]}>
                <Text style={[s.etiquetaText, { color: tc.muted }]}>{et.toUpperCase()}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <Text style={[s.cardTitulo, { color: tc.texto }]}>{noticia.titulo}</Text>

      <View style={[s.divider, { backgroundColor: tc.grisClaro }]} />

      <Text style={[s.cardCuerpo, { color: tc.texto }]} numberOfLines={5}>
        {noticia.cuerpo}
      </Text>

      <Text style={[s.cardAutor, { color: tc.muted }]}>
        — {noticia.autor}
      </Text>
    </View>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function NoticiasPublicasScreen() {
  const insets         = useSafeAreaInsets()
  const { colors: tc } = useTheme()
  const { noticias, loading, refetch } = useNoticias(true)

  return (
    <View style={[s.root, { backgroundColor: tc.fondo }]}>
      <View style={{ paddingTop: insets.top }}>
        <Header />
        <View style={s.edicionBar}>
          <Text style={s.edicionLabel}>SECCIÓN · NOTICIAS</Text>
          <Text style={s.edicionFecha}>{fechaEdicion()}</Text>
        </View>
        <View style={s.secRow}>
          <Text style={s.secTitle}>NOVEDADES DEL CLUB</Text>
          <View style={[s.secLine, { backgroundColor: tc.grisClaro }]} />
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.oro} style={{ marginTop: 40 }} />
      ) : noticias.length === 0 ? (
        <View style={s.emptyContainer}>
          <Text style={[s.emptyText, { color: tc.muted }]}>
            No hay noticias publicadas aún.
          </Text>
        </View>
      ) : (
        <FlatList
          data={noticias}
          keyExtractor={n => n.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60, gap: 16 }}
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

  secRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, gap: 10,
  },
  secTitle: {
    fontFamily: fonts.label, fontSize: 9, letterSpacing: 2.5,
    textTransform: 'uppercase', color: colors.oroHondo,
  },
  secLine: { flex: 1, height: 1 },

  card: {
    borderWidth: 1, borderRadius: 4, padding: 18, gap: 10,
  },
  cardMeta:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaTiempo: {
    fontFamily: fonts.label, fontSize: 8, letterSpacing: 2, color: colors.oroHondo,
  },
  etiquetasRow: { flexDirection: 'row', gap: 6 },
  etiqueta: {
    borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2,
  },
  etiquetaText: { fontFamily: fonts.label, fontSize: 7, letterSpacing: 1 },

  cardTitulo: { fontFamily: fonts.titulo, fontSize: 22, lineHeight: 28 },
  divider:    { height: 1 },
  cardCuerpo: { fontFamily: fonts.cuerpo, fontSize: 13, lineHeight: 20 },
  cardAutor:  { fontFamily: fonts.cuerpo, fontSize: 11, fontStyle: 'italic' },

  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText:      { fontFamily: fonts.cuerpo, fontSize: 14, fontStyle: 'italic' },
})
