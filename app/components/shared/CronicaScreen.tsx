import {
  ScrollView, View, Text, TouchableOpacity,
  Modal, ActivityIndicator, StyleSheet, Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useState } from 'react'
import { Header } from '@/components/shared/Header'
import { useCronica, type FeedItem, type FeedTipo } from '@/hooks/useCronica'
import { colors, fonts } from '@/constants/theme'
import { useTheme } from '@/contexts/ThemeContext'

// ─── Helpers ─────────────────────────────────────────────────────────────────

type BadgeStyle = { bg: string; text: string; border?: string }

const TIPO_BADGE: Record<FeedTipo, BadgeStyle> = {
  'LESIÓN':     { bg: '#C0392B',         text: '#FFFFFF' },
  'FICHAJE':    { bg: colors.tinta,      text: colors.oro },
  'RESULTADO':  { bg: colors.oroHondo,   text: colors.tinta },
  'ASISTENCIA': { bg: colors.oro,        text: colors.tinta },
  'INFO':       { bg: 'transparent',     text: colors.tinta, border: colors.tinta },
}

function tiempoRelativo(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime()
  const days  = Math.floor(diff / 86400000)
  const hours = Math.floor(diff / 3600000)
  if (days  > 0) return `HACE ${days}D`
  if (hours > 0) return `HACE ${hours}H`
  return 'RECIENTE'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TipoBadge({ tipo }: { tipo: FeedTipo }) {
  const c = TIPO_BADGE[tipo]
  return (
    <View style={[
      s.badge,
      { backgroundColor: c.bg, borderColor: c.border ?? 'transparent', borderWidth: c.border ? 1 : 0 },
    ]}>
      <Text style={[s.badgeText, { color: c.text }]}>{tipo}</Text>
    </View>
  )
}

function FilaFeed({ item, onPress }: { item: FeedItem; onPress?: () => void }) {
  const { colors: tc } = useTheme()
  const urgente = item.urgente
  const Wrapper = onPress ? TouchableOpacity : View

  return (
    <Wrapper
      style={[s.feedRow, { borderBottomColor: tc.grisClaro }, urgente && s.feedRowUrgente]}
      {...(onPress ? { onPress, activeOpacity: 0.8 } : {})}
    >
      <View style={s.feedMeta}>
        <TipoBadge tipo={item.tipo} />
        <Text style={[s.feedTiempo, urgente && { color: colors.oro }]}>
          {tiempoRelativo(item.createdAt)}
        </Text>
        {onPress ? <Text style={[s.feedArrow, urgente && { color: colors.oro }]}>→</Text> : null}
      </View>
      <Text style={[s.feedTitulo, { color: tc.texto }, urgente && { color: colors.oro }]} numberOfLines={2}>
        {item.titulo}
      </Text>
      {item.desc ? (
        <Text style={[s.feedDesc, urgente && { color: '#C9B98A' }]} numberOfLines={3}>
          {item.desc}
        </Text>
      ) : null}
      <Text style={[s.feedAutor, urgente && { color: '#7A6D50' }]}>{item.autor}</Text>
    </Wrapper>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function CronicaScreen() {
  const router  = useRouter()
  const insets  = useSafeAreaInsets()
  const { loading, items, rol } = useCronica()
  const { colors: tc } = useTheme()
  const esSubcomision = ['subcomision', 'admin'].includes(rol)

  // INFO rows (manual notifications) have no route: they open in a sheet that
  // shows the full title and message instead of the truncated preview.
  const [detalle, setDetalle] = useState<FeedItem | null>(null)

  function onPressItem(item: FeedItem): (() => void) | undefined {
    if (item.route) {
      return () => router.navigate(item.route as Parameters<typeof router.navigate>[0])
    }
    if (item.tipo === 'INFO') return () => setDetalle(item)
    return undefined
  }

  return (
    <>
      <ScrollView
        style={[s.root, { backgroundColor: tc.fondo }]}
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        <Header />

        {/* Edition bar */}
        <View style={s.edicionBar}>
          <Text style={s.edicionLabel}>SECCIÓN · CRÓNICA</Text>
          <Text style={s.edicionMeta}>{rol.toUpperCase()}</Text>
        </View>

        {/* Título */}
        <View style={s.tituloContainer}>
          <Text style={[s.tituloTexto, { color: tc.texto }]}>Bandeja del día.</Text>
          <View style={[s.tituloDivider, { backgroundColor: tc.grisClaro }]} />
        </View>

        {/* Nueva noticia — subcomision only, opens the Noticias tab */}
        {esSubcomision && (
          <View style={s.nuevaSection}>
            <TouchableOpacity
              style={s.nuevaBtn}
              onPress={() => router.navigate('/(subcomision)/noticias')}
              activeOpacity={0.8}
            >
              <Text style={s.nuevaBtnText}>+ NUEVA NOTICIA</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Feed */}
        {loading ? (
          <ActivityIndicator color={colors.oro} style={{ marginTop: 48 }} />
        ) : items.length === 0 ? (
          <View style={s.emptyContainer}>
            <Text style={s.emptyText}>Sin novedades en los últimos 7 días.</Text>
          </View>
        ) : (
          <View style={s.feedList}>
            {items.map(item => (
              <FilaFeed key={item.id} item={item} onPress={onPressItem(item)} />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Modal: detalle de una notificación */}
      <Modal
        visible={detalle !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDetalle(null)}
      >
        <View style={[s.modalRoot, { backgroundColor: tc.fondo, paddingTop: Platform.OS === 'ios' ? 0 : insets.top }]}>
          <View style={s.modalHeaderRow}>
            <Text style={[s.modalTitulo, { color: tc.texto }]}>Notificación</Text>
            <TouchableOpacity
              onPress={() => setDetalle(null)}
              hitSlop={{ top: 10, bottom: 10, left: 16, right: 16 }}
            >
              <Text style={s.modalCerrar}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={[s.modalDivider, { backgroundColor: tc.grisClaro }]} />

          {detalle && (
            <ScrollView style={s.modalBody} contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}>
              <Text style={s.inputLabel}>{`${detalle.autor} · ${tiempoRelativo(detalle.createdAt)}`}</Text>
              <Text style={[s.detalleTitulo, { color: tc.texto }]}>{detalle.titulo}</Text>
              {detalle.mensaje ? (
                <Text style={[s.detalleMensaje, { color: tc.texto }]}>{detalle.mensaje}</Text>
              ) : null}
            </ScrollView>
          )}
        </View>
      </Modal>
    </>
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
    fontFamily: fonts.label, fontSize: 12, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.oro,
  },
  edicionMeta: {
    fontFamily: fonts.label, fontSize: 12, letterSpacing: 1,
    textTransform: 'uppercase', color: colors.grisClaro,
    flexShrink: 1, marginLeft: 8, textAlign: 'right',
  },

  tituloContainer: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 4 },
  tituloTexto: {
    fontFamily: fonts.titulo, fontSize: 28, color: colors.tinta,
    marginBottom: 14, lineHeight: 34,
  },
  tituloDivider: { height: 1, backgroundColor: colors.grisClaro },

  nuevaSection: { paddingHorizontal: 20, paddingTop: 18 },
  nuevaBtn: {
    backgroundColor: colors.oro,
    paddingVertical: 14, alignItems: 'center', borderRadius: 4,
  },
  nuevaBtnText: {
    fontFamily: fonts.label, fontSize: 13, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.tinta, fontWeight: '700',
  },

  feedList: { paddingHorizontal: 20, paddingTop: 16 },

  feedRow: {
    paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: colors.grisClaro,
    gap: 5,
  },
  feedRowUrgente: {
    backgroundColor: colors.tinta,
    borderRadius: 4, borderBottomWidth: 0,
    paddingHorizontal: 14, marginBottom: 8,
  },
  feedMeta: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4,
  },
  badge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2,
  },
  badgeText: {
    fontFamily: fonts.label, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase',
  },
  feedTiempo: {
    fontFamily: fonts.label, fontSize: 12, letterSpacing: 1,
    textTransform: 'uppercase', color: colors.oroHondo, flex: 1,
  },
  feedArrow: {
    fontFamily: fonts.label, fontSize: 14, color: colors.oroHondo,
  },
  feedTitulo: {
    fontFamily: fonts.cuerpo, fontSize: 16, color: colors.tinta,
    fontWeight: '600', lineHeight: 20,
  },
  feedDesc: {
    fontFamily: fonts.cuerpo, fontSize: 14, fontStyle: 'italic',
    color: '#7C7267', lineHeight: 18,
  },
  feedAutor: {
    fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.5,
    textTransform: 'uppercase', color: '#9B9183', marginTop: 2,
  },

  emptyContainer: { paddingHorizontal: 20, paddingTop: 40 },
  emptyText: {
    fontFamily: fonts.cuerpo, fontSize: 15, fontStyle: 'italic', color: '#9B9183',
  },

  // Modal
  modalRoot: {
    flex: 1, backgroundColor: colors.papel,
  },
  modalHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingTop: 28, paddingBottom: 18,
  },
  modalTitulo: {
    fontFamily: fonts.titulo, fontSize: 25, color: colors.tinta, lineHeight: 30,
  },
  modalCerrar: {
    fontFamily: fonts.label, fontSize: 16, color: '#9B9183', letterSpacing: 1,
  },
  modalDivider: { height: 1, backgroundColor: colors.grisClaro, marginHorizontal: 24 },
  modalBody:    { paddingHorizontal: 24, paddingTop: 24 },

  inputLabel: {
    fontFamily: fonts.label, fontSize: 12, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.oroHondo, marginBottom: 8,
  },
  detalleTitulo: {
    fontFamily: fonts.titulo, fontSize: 22, lineHeight: 28, marginBottom: 16,
  },
  detalleMensaje: {
    fontFamily: fonts.cuerpo, fontSize: 16, lineHeight: 23,
  },
})
