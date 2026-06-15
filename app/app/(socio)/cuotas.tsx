import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native'
import { useRef } from 'react'
import { useScrollToTop } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { Header } from '@/components/shared/Header'
import { useCuotas, type Cuota, type ServicioActivo } from '@/hooks/useCuotas'
import { colors, fonts } from '@/constants/theme'

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
  categoriaLabel,
  montoCategoria,
  serviciosActivos,
}: {
  cuota:             Cuota
  onPagar:           (id: string) => void
  pagando:           boolean
  categoriaLabel?:   string
  montoCategoria?:   number
  serviciosActivos?: ServicioActivo[]
}) {
  const pagada      = cuota.estado === 'pagado'
  const conDetalle  = !pagada && !!categoriaLabel

  return (
    <View style={s.card}>
      {/* Header de la card */}
      <View style={s.cardHeader}>
        <Text style={s.cardPeriodo}>{periodoLabel(cuota.periodo)}</Text>
        <View style={[s.estadoBadge, pagada ? s.estadoBadgePagada : s.estadoBadgePendiente]}>
          <Text style={s.estadoText}>{pagada ? 'PAGADA' : 'PENDIENTE'}</Text>
        </View>
      </View>

      {/* Desglose (solo cuotas pendientes) */}
      {conDetalle ? (
        <View style={s.breakdown}>
          <View style={s.breakdownRow}>
            <Text style={s.breakdownItem}>{categoriaLabel}</Text>
            <Text style={s.breakdownMonto}>${(montoCategoria ?? 0).toLocaleString('es-AR')}</Text>
          </View>
          {(serviciosActivos ?? []).map(srv => (
            <View key={srv.id} style={s.breakdownRow}>
              <Text style={s.breakdownItem}>{srv.nombre}</Text>
              <Text style={s.breakdownMonto}>${srv.monto_mensual.toLocaleString('es-AR')}</Text>
            </View>
          ))}
          <View style={s.breakdownSep} />
          <View style={s.breakdownRow}>
            <Text style={s.breakdownTotalLabel}>TOTAL</Text>
            <Text style={s.cardMonto}>{montoLabel(cuota.monto)}</Text>
          </View>
        </View>
      ) : (
        <Text style={s.cardMonto}>{montoLabel(cuota.monto)}</Text>
      )}

      {/* Detalle / acción */}
      {pagada && cuota.fecha_pago ? (
        <Text style={s.cardFecha}>
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
  const scrollRef = useRef<FlatList>(null)
  useScrollToTop(scrollRef)
  const insets = useSafeAreaInsets()
  const {
    cuotas, loading, pagando, iniciarPago, refetch,
    cardLastFour, cardBrand, serviciosActivos, totalMensual,
    categoriaLabel, montoCategoria,
  } = useCuotas()

  const pendientes = cuotas.filter(c => c.estado === 'pendiente').length

  return (
    <View style={s.root}>
      {/* Header + Edition bar arriba de la lista */}
      <View style={[s.topSection, { paddingTop: insets.top }]}>
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

        {!loading && cardLastFour && (
          <View style={s.tarjetaBanner}>
            <Feather name="credit-card" size={14} color={colors.oroHondo} />
            <Text style={s.tarjetaText}>
              Débito automático activo · •••• {cardLastFour}
              {cardBrand ? `  ·  ${cardBrand.toUpperCase()}` : ''}
            </Text>
          </View>
        )}

        {!loading && !!categoriaLabel && (
          <View style={s.serviciosSection}>
            <View style={s.secRow}>
              <Text style={s.secTitle}>LO QUE PAGÁS</Text>
              <View style={s.secLine} />
            </View>
            <View style={s.serviciosGrid}>
              {/* Cuota base */}
              <View style={s.servicioChip}>
                <Text style={s.servicioNombre}>{categoriaLabel}</Text>
                <Text style={s.servicioMonto}>
                  ${montoCategoria.toLocaleString('es-AR')}/mes
                </Text>
              </View>
              {/* Servicios opcionales */}
              {serviciosActivos.map((srv: ServicioActivo) => (
                <View key={srv.id} style={s.servicioChip}>
                  <Text style={s.servicioNombre}>{srv.nombre}</Text>
                  <Text style={s.servicioMonto}>
                    ${srv.monto_mensual.toLocaleString('es-AR')}/mes
                  </Text>
                </View>
              ))}
            </View>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>TOTAL MENSUAL</Text>
              <Text style={s.totalMonto}>
                ${totalMensual.toLocaleString('es-AR', { minimumFractionDigits: 0 })}
              </Text>
            </View>
          </View>
        )}

        <View style={s.secRow}>
          <Text style={s.secTitle}>HISTORIAL</Text>
          <View style={s.secLine} />
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.oro} style={s.activityIndicator} />
      ) : cuotas.length === 0 ? (
        <View style={s.emptyContainer}>
          <Text style={s.emptyText}>No hay cuotas registradas aún.</Text>
        </View>
      ) : (
        <FlatList
          ref={scrollRef}
          data={cuotas}
          keyExtractor={c => c.id}
          contentContainerStyle={s.listContent}
          renderItem={({ item }) => (
            <CuotaCard
              cuota={item}
              onPagar={iniciarPago}
              pagando={pagando === item.id}
              {...(item.estado === 'pendiente'
                ? { categoriaLabel, montoCategoria, serviciosActivos }
                : {})}
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
  root:          { flex: 1, backgroundColor: '#15110A' },
  topSection:    {},
  activityIndicator: { marginTop: 40 },
  listContent:   { paddingHorizontal: 20, paddingBottom: 60, gap: 12 },

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
  secLine: { flex: 1, height: 1, backgroundColor: '#2C2418' },

  card: {
    borderWidth: 1, borderRadius: 4, padding: 16, gap: 10,
    borderLeftWidth: 3, borderLeftColor: colors.grisClaro,
    backgroundColor: '#1C1710', borderColor: '#2C2418',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardPeriodo: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: '#F3EFE4' },
  estadoBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 2 },
  estadoBadgePagada:   { backgroundColor: '#1A7A1A' },
  estadoBadgePendiente:{ backgroundColor: colors.oroHondo },
  estadoText:  {
    fontFamily: fonts.label, fontSize: 7, letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.blanco,
  },
  cardMonto: { fontFamily: fonts.titulo, fontSize: 30, lineHeight: 34, color: '#F3EFE4' },
  cardFecha: { fontFamily: fonts.cuerpo, fontSize: 11, fontStyle: 'italic', color: '#8E8574' },

  breakdown:           { gap: 6 },
  breakdownRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  breakdownItem:       { fontFamily: fonts.cuerpo, fontSize: 13, color: '#8E8574', flex: 1 },
  breakdownMonto:      { fontFamily: fonts.cuerpo, fontSize: 13, color: '#F3EFE4' },
  breakdownSep:        { height: 1, backgroundColor: '#2C2418', marginVertical: 4 },
  breakdownTotalLabel: { fontFamily: fonts.label, fontSize: 8, letterSpacing: 2, color: '#8E8574', flex: 1 },

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
  emptyText:      { fontFamily: fonts.cuerpo, fontSize: 14, fontStyle: 'italic', color: '#8E8574' },

  serviciosSection: { paddingHorizontal: 20 },
  serviciosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  servicioChip: {
    borderWidth: 1, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 8, gap: 2,
    borderColor: '#2C2418', backgroundColor: '#1C1710',
  },
  servicioNombre: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1, color: '#F3EFE4' },
  servicioMonto:  { fontFamily: fonts.cuerpo, fontSize: 11, fontStyle: 'italic', color: '#8E8574' },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    paddingTop: 10, borderTopWidth: 1, borderTopColor: '#2C2418',
  },
  totalLabel: { fontFamily: fonts.label, fontSize: 8, letterSpacing: 2, color: '#8E8574' },
  totalMonto: { fontFamily: fonts.titulo, fontSize: 22, color: '#F3EFE4' },

  tarjetaBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 4, marginHorizontal: 20, padding: 12,
    borderColor: '#2C2418', backgroundColor: '#1C1710',
  },
  tarjetaText: { fontFamily: fonts.cuerpo, fontSize: 13, flex: 1, color: '#F3EFE4' },
})
