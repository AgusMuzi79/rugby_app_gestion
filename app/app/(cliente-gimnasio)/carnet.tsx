import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { useRef, useState, useCallback } from 'react'
import { useScrollToTop } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Header } from '@/components/shared/Header'
import { useCarnet } from '@/hooks/useCarnet'
import { QRCarnet, CuentaRegresivaQR } from '@/components/socio/CarnetQR'
import { colors, fonts } from '@/constants/theme'

// Carnet de Cliente Gimnasio (2026-09-11) — versión simplificada del carnet
// de socio: mismo QR/TOTP (reusa useCarnet tal cual, es agnóstico de rol),
// sin roles/división/deporte/tarjeta física, que no aplican acá. Pedido del
// tesorero: esta gente ve ÚNICAMENTE esta pantalla (+ "Mi Perfil" para
// cerrar sesión) — ver migración 20260911000000_rol_cliente_gimnasio.

function formatCodigo(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} · ${code.slice(3)}` : code
}

function fechaEdicion(): string {
  const d    = new Date()
  const dias = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']
  const dd   = String(d.getDate()).padStart(2, '0')
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const yy   = String(d.getFullYear()).slice(2)
  return `${dias[d.getDay()]} ${dd}.${mm}.${yy}`
}

const ESTADO_COLOR: Record<string, string> = {
  activo:    colors.estadoActivo,
  moroso:    colors.rojoUrgente,
  pendiente: colors.estadoPendiente,
  inactivo:  colors.rojoUrgente,
}
const ESTADO_LABEL: Record<string, string> = {
  activo:    'AL DÍA',
  moroso:    'MOROSO',
  pendiente: 'PENDIENTE',
  inactivo:  'INACTIVO',
}

// Mismo criterio que el carnet de socio y el scanner de Lector: 'activo' con
// semáforo 'rojo' (2+ períodos impagos del reporte de vencimientos) se
// muestra como 'moroso'.
function estadoVisual(data: { estado: string; semaforo: string | null }): string {
  if (data.estado === 'activo' && data.semaforo === 'rojo') return 'moroso'
  return data.estado
}

// Texto del badge de estado (mismo criterio que el carnet de socio): oscuro
// sobre verde / naranja (el blanco no llega a 4.5:1), blanco sobre rojo (4.82).
function estadoTextoColor(estado: string): string {
  return estado === 'activo' || estado === 'pendiente' ? colors.sobreOro : colors.blanco
}

export default function CarnetClienteGimnasioScreen() {
  const scrollRef = useRef<ScrollView>(null)
  useScrollToTop(scrollRef)
  const insets = useSafeAreaInsets()
  const { loading, error, data, refresh } = useCarnet()
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await refresh()
    setRefreshing(false)
  }, [refresh])

  return (
    <ScrollView
      ref={scrollRef}
      style={s.root}
      contentContainerStyle={[s.scrollContent, { paddingTop: insets.top }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.oro}
          colors={[colors.oro]}
        />
      }
    >
      <Header />

      <View style={s.edicionBar}>
        <Text style={s.edicionLabel}>SECCIÓN · GIMNASIO</Text>
        <Text style={s.edicionFecha}>{fechaEdicion()}</Text>
      </View>

      <View style={s.saludoContainer}>
        <Text style={s.saludoTexto}>
          Tu carnet{data ? `, ${data.nombre.split(' ')[0]}.` : '.'}
        </Text>
        <View style={s.divider} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.oro} style={s.activityIndicator} />
      ) : error ? (
        <View style={s.errorContainer}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : data ? (
        <View style={s.section}>
          <View style={s.secRow}>
            <Text style={s.secTitle}>CARNET DIGITAL</Text>
            <View style={s.secLine} />
          </View>

          <View style={s.carnetCard}>
            <Text style={s.numLabel}>Nº DE CLIENTE</Text>
            <Text style={s.numValue}>{data.numero_socio}</Text>

            <View style={s.qrWrapper}>
              <QRCarnet value={data.qrContent} />
            </View>

            <CuentaRegresivaQR />

            <View style={[s.estadoBadge, { backgroundColor: ESTADO_COLOR[estadoVisual(data)] ?? colors.grisClaro }]}>
              <Text style={[s.estadoText, { color: estadoTextoColor(estadoVisual(data)) }]}>
                {ESTADO_LABEL[estadoVisual(data)] ?? estadoVisual(data).toUpperCase()}
              </Text>
            </View>

            <Text style={s.categoriaText}>CLIENTE GIMNASIO</Text>
          </View>

          <View style={s.sectionCodigo}>
            <View style={s.secRow}>
              <Text style={s.secTitle}>CÓDIGO DE HOY</Text>
              <View style={s.secLine} />
            </View>
            <Text style={s.codigoHint}>
              Si la cámara no puede leer tu QR, dictá este código.
            </Text>
            <Text style={s.codigoValue}>{formatCodigo(data.code)}</Text>
          </View>
        </View>
      ) : null}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: colors.fondo },
  scrollContent: { paddingBottom: 60 },
  activityIndicator: { marginTop: 60 },

  edicionBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.tinta,
  },
  edicionLabel: {
    fontFamily: fonts.label, fontSize: 12, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.oroSobreClaro,
  },
  edicionFecha: {
    fontFamily: fonts.label, fontSize: 12, letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.grisClaro,
  },

  saludoContainer: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 4 },
  saludoTexto:     { fontFamily: fonts.titulo, fontSize: 32, color: colors.texto, marginBottom: 14 },
  divider:         { height: 1, backgroundColor: colors.borde },

  section:      { paddingHorizontal: 20, paddingTop: 22 },
  sectionCodigo:{ paddingTop: 22, marginTop: 18 },
  secRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10 },
  secTitle: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 2.5, textTransform: 'uppercase', color: colors.oroHondo },
  secLine:  { flex: 1, height: 1, backgroundColor: colors.borde },

  carnetCard: {
    borderWidth: 1, borderRadius: 6, padding: 24,
    alignItems: 'center', gap: 12,
    backgroundColor: colors.card, borderColor: colors.borde,
  },
  numLabel:  { fontFamily: fonts.label, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: colors.muted },
  numValue:  { fontFamily: fonts.titulo, fontSize: 42, lineHeight: 48, color: colors.texto },

  qrWrapper: {
    padding: 16, backgroundColor: colors.blanco,
    borderRadius: 6, borderWidth: 1, borderColor: colors.grisClaro,
    marginVertical: 4,
  },

  estadoBadge: {
    paddingHorizontal: 14, paddingVertical: 5, borderRadius: 3, marginTop: 6,
  },
  estadoText: {
    fontFamily: fonts.label, fontSize: 13, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.blanco,
  },
  categoriaText: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1.5, marginTop: 2, color: colors.muted },

  codigoHint:  { fontFamily: fonts.cuerpo, fontSize: 14, fontStyle: 'italic', marginBottom: 10, color: colors.muted },
  codigoValue: {
    fontFamily: fonts.titulo, fontSize: 38, letterSpacing: 4,
    textAlign: 'center', color: colors.texto,
  },

  errorContainer: { padding: 40, alignItems: 'center' },
  errorText:      { fontFamily: fonts.cuerpo, fontSize: 16, textAlign: 'center', color: colors.rojoTexto },
})
