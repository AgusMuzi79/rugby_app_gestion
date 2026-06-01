import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Header } from '@/components/shared/Header'
import { useCuotas, type Cuota } from '@/hooks/useCuotas'
import { colors, fonts } from '@/constants/theme'
import { useTheme } from '@/contexts/ThemeContext'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function periodoLabel(periodo: string): string {
  const [anio, mes] = periodo.split('-')
  const meses = [
    '', 'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
  ]
  return `${meses[Number(mes)]} ${anio}`
}

function fechaCorta(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function montoLabel(monto: number): string {
  return `$ ${monto.toLocaleString('es-AR', { minimumFractionDigits: 0 })}`
}

// ─── Sub-component ────────────────────────────────────────────────────────────

function CuotaCard({
  cuota,
  onPagar,
  pagando,
}: {
  cuota:   Cuota
  onPagar: (id: string) => void
  pagando: boolean
}) {
  const { colors: tc } = useTheme()
  const pagada         = cuota.estado === 'pagado'

  return (
    <View style={[s.card, { backgroundColor: tc.card, borderColor: tc.grisClaro }]}>
      {/* Header de la card */}
      <View style={s.cardHeader}>
        <Text style={[s.cardPeriodo, { color: tc.texto }]}>{periodoLabel(cuota.periodo)}</Text>
        <View style={[s.estadoBadge, { backgroundColor: pagada ? '#1A7A1A' : colors.tinta }]}>
          <Text style={s.estadoText}>{pagada ? 'PAGADA' : 'PENDIENTE'}</Text>
        </View>
      </View>

      {/* Monto */}
      <Text style={[s.cardMonto, { color: tc.texto }]}>{montoLabel(cuota.monto)}</Text>

      {/* Detalle / acción */}
      {pagada && cuota.fecha_pago ? (
        <Text style={[s.cardFecha, { color: tc.muted }]}>
          Pagado el {fechaCorta(cuota.fecha_pago)}
        </Text>
      ) : !pagada ? (
        <TouchableOpacity
          style={[s.pagarBtn, pagando && s.pagarBtnDisabled]}
          onPress={() => onPagar(cuota.id)}
          disabled={pagando}
          activeOpacity={0.8}
        >
          {pagando ? (
            <ActivityIndicator color={colors.oro} size="small" />
          ) : (
            <Text style={s.pagarBtnText}>PAGAR CON MERCADO PAGO →</Text>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CuotasScreen() {
  const insets          = useSafeAreaInsets()
  const { colors: tc }  = useTheme()
  const { cuotas, loading, pagando, iniciarPago, refetch } = useCuotas()

  const pendientes = cuotas.filter(c => c.estado === 'pendiente').length

  return (
    <View style={[s.root, { backgroundColor: tc.fondo }]}>
      {/* Header + Edition bar arriba de la lista */}
      <View style={{ paddingTop: insets.top }}>
        <Header />
        <View style={s.edicionBar}>
          <Text style={s.edicionLabel}>SECCIÓN · SOCIOS</Text>
          <Text style={s.edicionFecha}>MIS CUOTAS</Text>
        </View>

        {!loading && pendientes > 0 && (
          <View style={s.alertaBanner}>
            <Text style={s.alertaText}>
              Tenés {pendientes} cuota{pendientes > 1 ? 's' : ''} pendiente{pendientes > 1 ? 's' : ''}.
            </Text>
          </View>
        )}

        <View style={s.secRow}>
          <Text style={s.secTitle}>HISTORIAL</Text>
          <View style={[s.secLine, { backgroundColor: tc.grisClaro }]} />
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.oro} style={{ marginTop: 40 }} />
      ) : cuotas.length === 0 ? (
        <View style={s.emptyContainer}>
          <Text style={[s.emptyText, { color: tc.muted }]}>No hay cuotas registradas aún.</Text>
        </View>
      ) : (
        <FlatList
          data={cuotas}
          keyExtractor={c => c.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60, gap: 12 }}
          renderItem={({ item }) => (
            <CuotaCard
              cuota={item}
              onPagar={iniciarPago}
              pagando={pagando === item.id}
            />
          )}
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

  alertaBanner: {
    backgroundColor: colors.oroHondo, paddingHorizontal: 20, paddingVertical: 10,
  },
  alertaText: {
    fontFamily: fonts.label, fontSize: 10, letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.blanco,
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
    borderWidth: 1, borderRadius: 4, padding: 16, gap: 10,
    borderLeftWidth: 3, borderLeftColor: colors.grisClaro,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardPeriodo: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' },
  estadoBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 2 },
  estadoText:  {
    fontFamily: fonts.label, fontSize: 7, letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.blanco,
  },
  cardMonto: { fontFamily: fonts.titulo, fontSize: 30, lineHeight: 34 },
  cardFecha: { fontFamily: fonts.cuerpo, fontSize: 11, fontStyle: 'italic' },

  pagarBtn: {
    backgroundColor: colors.tinta, paddingVertical: 14,
    alignItems: 'center', borderRadius: 4, marginTop: 4,
  },
  pagarBtnDisabled: { opacity: 0.5 },
  pagarBtnText: {
    fontFamily: fonts.label, fontSize: 10, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.oro,
  },

  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText:      { fontFamily: fonts.cuerpo, fontSize: 14, fontStyle: 'italic' },
})
