import {
  ScrollView, View, Text, TouchableOpacity,
  ActivityIndicator, StyleSheet,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Header } from '@/components/shared/Header'
import { useDiarioManager, type EventoProgreso, type UltimoFichaje } from '@/hooks/useDiarioManager'
import { colors, fonts } from '@/constants/theme'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TIPO_LABEL: Record<string, string> = {
  viaje:         'VIAJE',
  tercer_tiempo: '3ER TIEMPO',
  recaudacion:   'RECAUDACIÓN',
}

function formatMonto(n: number): string {
  if (n === 0)   return '$0'
  if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return `$${n}`
}

function tiempoRelativo(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime()
  const days  = Math.floor(diff / 86400000)
  const hours = Math.floor(diff / 3600000)
  if (days  > 0) return `HACE ${days} DÍA${days > 1 ? 'S' : ''}`
  if (hours > 0) return `HACE ${hours}H`
  return 'RECIENTE'
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

function CardCobranza({ ev, onPress }: { ev: EventoProgreso; onPress: () => void }) {
  const tipoLabel = TIPO_LABEL[ev.tipo] ?? ev.tipo.toUpperCase()
  const pct       = ev.pct

  return (
    <TouchableOpacity style={s.cobranzaCard} onPress={onPress} activeOpacity={0.8}>
      <View style={s.cobranzaHeader}>
        <View style={s.tipoBadge}>
          <Text style={s.tipoBadgeText}>{tipoLabel}</Text>
        </View>
        <Text style={s.cobranzaNombre} numberOfLines={1}>{ev.nombre}</Text>
        <Text style={s.cobranzaPct}>{pct}%</Text>
      </View>
      {/* Barra dorada */}
      <View style={s.barraFondo}>
        <View style={{ flex: pct, height: 4, backgroundColor: colors.oro, borderRadius: 2 }} />
        <View style={{ flex: Math.max(0, 100 - pct) }} />
      </View>
      <View style={s.cobranzaFooter}>
        <Text style={s.cobranzaDetalle}>
          {ev.pagados}/{ev.total} PAGADOS
          {ev.montoTotal > 0 ? ` · ${formatMonto(ev.montoCobrado)} / ${formatMonto(ev.montoTotal)}` : ''}
        </Text>
        <Text style={s.cobranzaArrow}>→</Text>
      </View>
    </TouchableOpacity>
  )
}

function CardPedido({ ev, onPress }: { ev: EventoProgreso; onPress: () => void }) {
  const pendiente = ev.pct < 100

  return (
    <View style={s.pedidoCard}>
      <View style={s.pedidoHeaderRow}>
        <View style={s.pedidoBadge}>
          <Text style={s.pedidoBadgeText}>PEDIDO ABIERTO</Text>
        </View>
      </View>
      <Text style={s.pedidoNombre}>{ev.nombre}</Text>
      {ev.descripcion ? (
        <Text style={s.pedidoDetalle} numberOfLines={2}>{ev.descripcion}</Text>
      ) : null}
      <Text style={s.pedidoProgreso}>
        {ev.pagados}/{ev.total} confirmados
      </Text>
      {pendiente && (
        <TouchableOpacity style={s.confirmarBtn} onPress={onPress} activeOpacity={0.8}>
          <Text style={s.confirmarBtnText}>CONFIRMAR COMPROBANTE →</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

function FilaFichaje({ fichaje, divisionNombre }: { fichaje: UltimoFichaje; divisionNombre: string }) {
  return (
    <View style={s.fichajeRow}>
      <View style={s.fichajeInfo}>
        <Text style={s.fichajeNombre}>{fichaje.nombreCompleto}</Text>
        <Text style={s.fichajeMeta}>
          {divisionNombre} · {tiempoRelativo(fichaje.createdAt)}
        </Text>
      </View>
      <View style={s.okBadge}>
        <Text style={s.okBadgeText}>OK</Text>
      </View>
    </View>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function DiarioManagerScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { loading, data } = useDiarioManager()

  if (data.sinDivision && !loading) {
    return (
      <View style={[s.root, s.centered]}>
        <Text style={s.sinDivTitle}>Sin división asignada.</Text>
        <Text style={s.sinDivSub}>Contactá a la Subcomisión.</Text>
      </View>
    )
  }

  const eventosLocales  = data.eventos.filter(e => !e.esGlobal)
  const eventosGlobales = data.eventos.filter(e => e.esGlobal)
  const primerNombre    = data.nombre.split(' ')[0] || '—'

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 48 }}
      showsVerticalScrollIndicator={false}
    >
      <Header />

      {/* Edition bar */}
      <View style={s.edicionBar}>
        <Text style={s.edicionLabel}>EDICIÓN · OPERATIVA</Text>
        <Text style={s.edicionMeta} numberOfLines={1}>
          {primerNombre} · {data.divisionNombre}
        </Text>
      </View>

      {/* Título */}
      <View style={s.tituloContainer}>
        <Text style={s.tituloTexto}>
          {data.divisionNombre || '—'} · Cobranzas y fichajes.
        </Text>
        <View style={s.tituloDivider} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.oro} style={{ marginTop: 40 }} />
      ) : (
        <>
          {/* ── COBRANZAS ACTIVAS ── */}
          <View style={s.section}>
            <SectionHeader title="COBRANZAS ACTIVAS" />
            {eventosLocales.length === 0 ? (
              <Text style={s.emptyText}>Sin cobranzas activas.</Text>
            ) : (
              <View style={s.lista}>
                {eventosLocales.map(ev => (
                  <CardCobranza
                    key={ev.id}
                    ev={ev}
                    onPress={() => router.navigate('/(manager)/cobranzas')}
                  />
                ))}
              </View>
            )}
          </View>

          {/* ── PEDIDO DE SUBCOMISIÓN ── */}
          {eventosGlobales.length > 0 && (
            <View style={s.section}>
              <SectionHeader title="PEDIDO DE SUBCOMISIÓN" />
              <View style={s.lista}>
                {eventosGlobales.map(ev => (
                  <CardPedido
                    key={ev.id}
                    ev={ev}
                    onPress={() => router.navigate('/(manager)/cobranzas')}
                  />
                ))}
              </View>
            </View>
          )}

          {/* ── ÚLTIMOS FICHAJES ── */}
          <View style={s.section}>
            <SectionHeader title="ÚLTIMOS FICHAJES" />
            {data.fichajes.length === 0 ? (
              <Text style={s.emptyText}>Sin fichajes recientes.</Text>
            ) : (
              <View style={s.fichajesList}>
                {data.fichajes.map(f => (
                  <FilaFichaje
                    key={f.id}
                    fichaje={f}
                    divisionNombre={data.divisionNombre}
                  />
                ))}
              </View>
            )}
            <TouchableOpacity
              style={s.verTodosBtn}
              onPress={() => router.navigate('/(manager)/fichajes')}
              activeOpacity={0.75}
            >
              <Text style={s.verTodosBtnText}>VER TODOS LOS FICHAJES →</Text>
            </TouchableOpacity>
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

  tituloContainer: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 4 },
  tituloTexto: {
    fontFamily: fonts.titulo, fontSize: 24, color: colors.tinta,
    marginBottom: 14, lineHeight: 30,
  },
  tituloDivider: { height: 1, backgroundColor: colors.grisClaro },

  section:  { paddingHorizontal: 20, paddingTop: 22 },
  secRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 },
  secTitle: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 2.5, textTransform: 'uppercase', color: colors.oroHondo },
  secLine:  { flex: 1, height: 1, backgroundColor: colors.grisClaro },

  lista: { gap: 12 },

  // Cobranza card
  cobranzaCard: {
    backgroundColor: colors.blanco, borderWidth: 1, borderColor: colors.grisClaro,
    borderRadius: 4, padding: 14, gap: 10,
  },
  cobranzaHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tipoBadge: {
    backgroundColor: colors.grisClaro,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2,
  },
  tipoBadgeText: {
    fontFamily: fonts.label, fontSize: 7, letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.tinta,
  },
  cobranzaNombre: { flex: 1, fontFamily: fonts.cuerpo, fontSize: 13, color: colors.tinta },
  cobranzaPct:    { fontFamily: fonts.titulo, fontSize: 18, color: colors.oroHondo, lineHeight: 22 },
  barraFondo: {
    flexDirection: 'row', height: 4,
    backgroundColor: colors.grisClaro, borderRadius: 2, overflow: 'hidden',
  },
  cobranzaFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cobranzaDetalle:{ fontFamily: fonts.label, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: '#9B9183' },
  cobranzaArrow:  { fontFamily: fonts.label, fontSize: 13, color: colors.oroHondo },

  // Pedido de subcomisión
  pedidoCard: {
    backgroundColor: colors.papel,
    borderWidth: 1, borderColor: colors.grisClaro,
    borderLeftWidth: 3, borderLeftColor: colors.oroHondo,
    borderRadius: 4, padding: 16, gap: 6,
  },
  pedidoHeaderRow: { flexDirection: 'row', marginBottom: 2 },
  pedidoBadge: {
    borderWidth: 1, borderColor: colors.oroHondo,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 2,
  },
  pedidoBadgeText: {
    fontFamily: fonts.label, fontSize: 7, letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.oroHondo,
  },
  pedidoNombre: { fontFamily: fonts.cuerpo, fontSize: 14, color: colors.tinta },
  pedidoDetalle:{ fontFamily: fonts.cuerpo, fontSize: 12, fontStyle: 'italic', color: '#7C7267', lineHeight: 18 },
  pedidoProgreso:{ fontFamily: fonts.label, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: '#9B9183', marginTop: 2 },
  confirmarBtn: {
    marginTop: 6, backgroundColor: colors.tinta,
    paddingVertical: 12, alignItems: 'center', borderRadius: 4,
  },
  confirmarBtnText: {
    fontFamily: fonts.label, fontSize: 10, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.oro,
  },

  // Fichajes
  fichajesList: { gap: 0 },
  fichajeRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.grisClaro,
  },
  fichajeInfo:  { flex: 1 },
  fichajeNombre:{ fontFamily: fonts.cuerpo, fontSize: 13, color: colors.tinta, marginBottom: 3 },
  fichajeMeta:  { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: '#9B9183' },
  okBadge: {
    backgroundColor: colors.oro,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 2,
  },
  okBadgeText: {
    fontFamily: fonts.label, fontSize: 8, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.tinta, fontWeight: '700',
  },

  verTodosBtn: {
    marginTop: 16, borderWidth: 1, borderColor: colors.tinta,
    paddingVertical: 14, alignItems: 'center', borderRadius: 4,
  },
  verTodosBtnText: {
    fontFamily: fonts.label, fontSize: 10, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.tinta,
  },

  emptyText:  { fontFamily: fonts.cuerpo, fontSize: 13, fontStyle: 'italic', color: '#9B9183' },
  sinDivTitle:{ fontFamily: fonts.titulo, fontSize: 24, color: colors.tinta, marginBottom: 8 },
  sinDivSub:  { fontFamily: fonts.cuerpo, fontSize: 13, fontStyle: 'italic', color: '#9B9183' },
})
