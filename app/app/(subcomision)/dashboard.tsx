import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { useDashboard } from '@/hooks/useDashboard'
import type {
  AsistenciaDivision,
  ResultadoResumen,
  FichajesDivision,
  EventoFinancieroResumen,
} from '@/hooks/useDashboard'

const CREAM = '#F5F0E8'
const GOLD  = '#C9A84C'
const DARK  = '#1A1A1A'
const MUTED = '#888888'
const CARD  = '#FFFFFF'
const ROJO  = '#EF4444'
const VERDE = '#22C55E'
const AZUL  = '#3B82F6'

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const {
    loading,
    divisiones,
    divisionFiltro,
    setDivisionFiltro,
    asistencias,
    resultados,
    fichajes,
    financiero,
  } = useDashboard()

  if (loading) {
    return (
      <View style={s.centrado}>
        <ActivityIndicator size="large" color={GOLD} />
        <Text style={s.cargandoTexto}>Cargando dashboard…</Text>
      </View>
    )
  }

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerLabel}>SUBCOMISIÓN</Text>
        <Text style={s.headerTitle}>Dashboard</Text>
      </View>

      {/* Selector de división */}
      <View style={s.selectorWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.selectorContent}
        >
          <TouchableOpacity
            style={[s.pill, divisionFiltro === null && s.pillActiva]}
            onPress={() => setDivisionFiltro(null)}
            activeOpacity={0.7}
          >
            <Text style={[s.pillTexto, divisionFiltro === null && s.pillTextoActiva]}>
              Todas
            </Text>
          </TouchableOpacity>
          {divisiones.map(d => (
            <TouchableOpacity
              key={d.id}
              style={[s.pill, divisionFiltro === d.id && s.pillActiva]}
              onPress={() => setDivisionFiltro(d.id)}
              activeOpacity={0.7}
            >
              <Text style={[s.pillTexto, divisionFiltro === d.id && s.pillTextoActiva]}>
                {d.nombre}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Secciones */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <SeccionAsistencia datos={asistencias} />
        <SeccionResultados datos={resultados} />
        <SeccionFichajes   datos={fichajes} />
        <SeccionFinanciero datos={financiero} />
      </ScrollView>
    </View>
  )
}

// ─── Asistencia ───────────────────────────────────────────────────────────────

function SeccionAsistencia({ datos }: { datos: AsistenciaDivision[] }) {
  return (
    <View style={s.seccion}>
      <Text style={s.seccionTitulo}>Asistencia</Text>
      {datos.length === 0 ? (
        <Text style={s.vacio}>Sin datos de asistencia recientes.</Text>
      ) : (
        datos.map(d => (
          <View key={d.divisionId} style={s.card}>
            <View style={s.fila}>
              <Text style={s.cardNombre} numberOfLines={1}>{d.divisionNombre}</Text>
              {d.tieneAlertas && (
                <View style={s.badgeRojo}>
                  <Text style={s.badgeTexto}>4+ AUSENCIAS</Text>
                </View>
              )}
            </View>
            <View style={s.fila}>
              <Text style={s.cardMuted}>{d.presentes} de {d.totalJugadores} presentes</Text>
              <Text style={[s.porcentaje, (d.porcentaje ?? 100) < 70 ? s.porcBajo : s.porcNormal]}>
                {d.porcentaje !== null ? `${d.porcentaje}%` : '—'}
              </Text>
            </View>
          </View>
        ))
      )}
    </View>
  )
}

// ─── Resultados ───────────────────────────────────────────────────────────────

function SeccionResultados({ datos }: { datos: ResultadoResumen[] }) {
  return (
    <View style={s.seccion}>
      <Text style={s.seccionTitulo}>Últimos Resultados</Text>
      {datos.length === 0 ? (
        <Text style={s.vacio}>Sin resultados cargados.</Text>
      ) : (
        datos.map(r => (
          <View key={r.id} style={s.card}>
            <View style={s.fila}>
              <Text style={s.cardNombre} numberOfLines={1}>{r.divisionNombre}</Text>
              <Text style={s.cardFecha}>{formatFecha(r.fecha)}</Text>
            </View>
            {r.equipoNombre != null && (
              <Text style={s.cardMuted}>{r.equipoNombre}</Text>
            )}
            <View style={s.resultadoFila}>
              <Text style={s.marcador}>{r.puntosPropios}</Text>
              <Text style={s.vs}>–</Text>
              <Text style={s.marcador}>{r.puntosRival}</Text>
              <Text style={s.rival} numberOfLines={1}>{r.rival ?? '—'}</Text>
            </View>
          </View>
        ))
      )}
    </View>
  )
}

// ─── Fichajes ─────────────────────────────────────────────────────────────────

function SeccionFichajes({ datos }: { datos: FichajesDivision[] }) {
  const totalClub = datos.reduce((s, d) => s + d.total, 0)
  return (
    <View style={s.seccion}>
      <View style={s.seccionEncabezado}>
        <Text style={s.seccionTitulo}>Fichajes</Text>
        <Text style={s.seccionTotal}>Club: {totalClub} jugadores</Text>
      </View>
      {datos.length === 0 ? (
        <Text style={s.vacio}>Sin jugadores fichados.</Text>
      ) : (
        datos.map(d => (
          <View key={d.divisionId} style={s.card}>
            <View style={s.fila}>
              <Text style={s.cardNombre} numberOfLines={1}>{d.divisionNombre}</Text>
              <Text style={s.numGrande}>{d.total}</Text>
            </View>
          </View>
        ))
      )}
    </View>
  )
}

// ─── Financiero ───────────────────────────────────────────────────────────────

const TIPO_COLOR: Record<string, string> = {
  viaje:         AZUL,
  tercer_tiempo: VERDE,
  recaudacion:   GOLD,
}

function SeccionFinanciero({ datos }: { datos: EventoFinancieroResumen[] }) {
  return (
    <View style={s.seccion}>
      <Text style={s.seccionTitulo}>Financiero</Text>
      {datos.length === 0 ? (
        <Text style={s.vacio}>Sin eventos financieros activos.</Text>
      ) : (
        datos.map(ef => {
          const color = TIPO_COLOR[ef.tipo] ?? MUTED
          return (
            <View key={ef.id} style={s.card}>
              <View style={s.fila}>
                <View style={[s.tipoBadge, { borderColor: color }]}>
                  <Text style={[s.tipoTexto, { color }]}>
                    {ef.tipo.replace('_', ' ').toUpperCase()}
                  </Text>
                </View>
                {ef.divisionNombre != null && (
                  <Text style={s.cardFecha}>{ef.divisionNombre}</Text>
                )}
              </View>
              <Text style={s.cardNombre}>{ef.nombre}</Text>
              <View style={s.fila}>
                <Text style={s.cobrado}>
                  Cobrado: ${ef.totalCobrado.toLocaleString('es-AR')}
                </Text>
                <Text style={s.cardMuted}>
                  {ef.countPagados}P · {ef.countPendientes}PN
                </Text>
              </View>
            </View>
          )
        })
      )}
    </View>
  )
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function formatFecha(fecha: string): string {
  const [y, m, d] = fecha.split('-')
  return `${d}/${m}/${y}`
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: CREAM },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: CREAM, gap: 12 },
  cargandoTexto: { color: MUTED, fontSize: 13 },

  // Header
  header:      { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 14, backgroundColor: DARK },
  headerLabel: { fontSize: 10, letterSpacing: 2.5, color: GOLD, marginBottom: 4 },
  headerTitle: { fontSize: 28, fontStyle: 'italic', fontFamily: 'serif', color: '#FFFFFF' },

  // Selector
  selectorWrap:    { backgroundColor: DARK, paddingBottom: 12 },
  selectorContent: { paddingHorizontal: 16, gap: 8, flexDirection: 'row' },
  pill:            { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#2A2A2A', borderWidth: 1, borderColor: '#3A3A3A' },
  pillActiva:      { backgroundColor: GOLD, borderColor: GOLD },
  pillTexto:       { color: '#AAAAAA', fontSize: 12, fontWeight: '500' },
  pillTextoActiva: { color: DARK },

  // Scroll
  scroll:        { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40, gap: 24 },

  // Sección
  seccion:         { gap: 8 },
  seccionEncabezado: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seccionTitulo:   { fontSize: 11, letterSpacing: 1.5, color: GOLD, fontWeight: '700', textTransform: 'uppercase' },
  seccionTotal:    { fontSize: 12, color: MUTED },
  vacio:           { color: MUTED, fontSize: 13, fontStyle: 'italic', paddingVertical: 4 },

  // Card
  card:       { backgroundColor: CARD, borderRadius: 10, padding: 14, gap: 6, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  fila:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardNombre: { fontSize: 14, fontWeight: '600', color: DARK, flex: 1, marginRight: 8 },
  cardMuted:  { fontSize: 12, color: MUTED },
  cardFecha:  { fontSize: 12, color: MUTED },

  // Asistencia
  badgeRojo:  { backgroundColor: ROJO, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  badgeTexto: { color: '#FFFFFF', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  porcentaje: { fontSize: 22, fontWeight: '700' },
  porcNormal: { color: VERDE },
  porcBajo:   { color: ROJO },

  // Resultados
  resultadoFila: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  marcador:      { fontSize: 22, fontWeight: '700', color: DARK, minWidth: 28 },
  vs:            { fontSize: 14, color: MUTED },
  rival:         { fontSize: 13, color: MUTED, flex: 1 },

  // Fichajes
  numGrande: { fontSize: 24, fontWeight: '700', color: DARK },

  // Financiero
  tipoBadge: { borderWidth: 1.5, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  tipoTexto: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  cobrado:   { fontSize: 13, fontWeight: '600', color: DARK },
})
