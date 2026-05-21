import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
} from 'react-native'
import { useAsistenciaCoordinador, JugadorAsistencia } from '@/hooks/useAsistenciaCoordinador'
import { useTheme } from '@/contexts/ThemeContext'

const CREAM  = '#F5F0E8'
const GOLD   = '#C9A84C'
const DARK   = '#1A1A1A'
const DIVIDER = '#D1C9B8'
const MUTED  = '#7C7267'
const ROJO   = '#EF4444'
const VERDE  = '#22C55E'
const NARANJA = '#F97316'

function colorPorcentaje(p: number | null): string {
  if (p === null) return MUTED
  if (p >= 75) return VERDE
  if (p >= 50) return NARANJA
  return ROJO
}

function FilaJugador({ jugador }: { jugador: JugadorAsistencia }) {
  const { colors: tc } = useTheme()
  const { porcentaje, ausenciasConsecutivas, totalEventos, totalPresentes, nombre_completo } = jugador
  const color = colorPorcentaje(porcentaje)

  return (
    <View style={styles.fila}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[styles.nombreJugador, { color: tc.tinta }]} numberOfLines={1}>{nombre_completo}</Text>
          {ausenciasConsecutivas && (
            <View style={styles.alerta}>
              <Text style={styles.alertaTexto}>4 AUST.</Text>
            </View>
          )}
        </View>
        <Text style={styles.detalle}>
          {totalEventos > 0
            ? `${totalPresentes} de ${totalEventos} eventos (últimos 30 días)`
            : 'Sin eventos registrados en últimos 30 días'}
        </Text>
      </View>
      <View style={styles.porcentajeContainer}>
        {porcentaje !== null ? (
          <Text style={[styles.porcentaje, { color }]}>{porcentaje}%</Text>
        ) : (
          <Text style={[styles.porcentaje, { color: MUTED }]}>—</Text>
        )}
      </View>
    </View>
  )
}

interface SelectorDivisionProps {
  divisiones: { id: string; nombre: string }[]
  seleccionada: string | null
  onSeleccionar: (id: string) => void
}

function SelectorDivision({ divisiones, seleccionada, onSeleccionar }: SelectorDivisionProps) {
  if (divisiones.length <= 1) return null
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.selectorScroll}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 8, flexDirection: 'row' }}
    >
      {divisiones.map(d => (
        <TouchableOpacity
          key={d.id}
          style={[styles.pill, d.id === seleccionada && styles.pillActiva]}
          onPress={() => onSeleccionar(d.id)}
          activeOpacity={0.8}
        >
          <Text style={[styles.pillTexto, d.id === seleccionada && styles.pillTextoActivo]}>
            {d.nombre}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  )
}

export default function AsistenciaCoordinadorScreen() {
  const {
    jugadores,
    divisiones,
    divisionSeleccionada,
    divisionNombre,
    loading,
    sinDivisiones,
    seleccionarDivision,
    recargar,
  } = useAsistenciaCoordinador()
  const { colors: tc } = useTheme()

  if (sinDivisiones) {
    return (
      <SafeAreaView style={[styles.centrado, { backgroundColor: tc.fondo }]}>
        <Text style={styles.mutedTexto}>Sin divisiones asignadas.</Text>
        <Text style={styles.mutedTexto}>Contactá a la Subcomisión.</Text>
      </SafeAreaView>
    )
  }

  const conAlerta = jugadores.filter(j => j.ausenciasConsecutivas).length

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tc.fondo }]}>
      <View style={styles.header}>
        <Text style={styles.labelHeader}>COORDINADOR</Text>
        <Text style={[styles.titulo, { color: tc.tinta }]}>Asistencia</Text>
        {divisionNombre ? (
          <Text style={styles.subtitulo}>{divisionNombre}</Text>
        ) : null}
      </View>

      <SelectorDivision
        divisiones={divisiones}
        seleccionada={divisionSeleccionada}
        onSeleccionar={seleccionarDivision}
      />

      <View style={{ height: 1, backgroundColor: tc.grisClaro, marginHorizontal: 20, marginTop: divisiones.length > 1 ? 12 : 0 }} />

      {loading ? (
        <View style={styles.centrado}>
          <ActivityIndicator color={GOLD} size="large" />
        </View>
      ) : (
        <>
          {conAlerta > 0 && (
            <View style={styles.alertaBanner}>
              <Text style={styles.alertaBannerTexto}>
                ⚠  {conAlerta} jugador{conAlerta !== 1 ? 'es' : ''} con 4 ausencias consecutivas
              </Text>
            </View>
          )}

          <View style={styles.leyenda}>
            {[
              { color: VERDE,   label: '≥75%' },
              { color: NARANJA, label: '50–74%' },
              { color: ROJO,    label: '<50%' },
            ].map(l => (
              <View key={l.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={[styles.leyendaDot, { backgroundColor: l.color }]} />
                <Text style={styles.leyendaTexto}>{l.label}</Text>
              </View>
            ))}
            <Text style={[styles.contador, { color: tc.tinta }]}>{jugadores.length} jugadores</Text>
          </View>

          <FlatList
            data={jugadores}
            keyExtractor={item => item.id}
            renderItem={({ item }) => <FilaJugador jugador={item} />}
            ItemSeparatorComponent={() => (
              <View style={{ height: 1, backgroundColor: tc.grisClaro, marginHorizontal: 20 }} />
            )}
            contentContainerStyle={jugadores.length === 0 ? { flex: 1 } : { paddingBottom: 16 }}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                <Text style={styles.mutedTexto}>Sin jugadores en esta división.</Text>
              </View>
            }
            onRefresh={recargar}
            refreshing={loading}
          />
        </>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: CREAM },
  centrado:           { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: CREAM, gap: 8 },
  mutedTexto:         { color: MUTED, fontSize: 14, fontFamily: 'serif', fontStyle: 'italic' },
  header:             { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14 },
  labelHeader:        { fontSize: 10, letterSpacing: 2.5, color: GOLD, marginBottom: 4 },
  titulo:             { fontSize: 32, fontStyle: 'italic', fontFamily: 'serif', color: DARK },
  subtitulo:          { fontSize: 12, color: MUTED, marginTop: 4, letterSpacing: 0.3 },
  selectorScroll:     { marginBottom: 12 },
  pill:               { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: DIVIDER },
  pillActiva:         { backgroundColor: DARK, borderColor: DARK },
  pillTexto:          { fontSize: 13, color: MUTED },
  pillTextoActivo:    { color: GOLD },
  leyenda:            { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, gap: 14 },
  leyendaDot:         { width: 8, height: 8, borderRadius: 4 },
  leyendaTexto:       { fontSize: 11, color: MUTED },
  contador:           { marginLeft: 'auto', fontSize: 12, color: DARK, fontWeight: '600', letterSpacing: 0.5 },
  fila:               { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 13, gap: 12 },
  nombreJugador:      { fontSize: 15, color: DARK, flexShrink: 1 },
  detalle:            { fontSize: 11, color: MUTED, marginTop: 2 },
  alerta:             { backgroundColor: ROJO, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2 },
  alertaTexto:        { fontSize: 9, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  porcentajeContainer:{ minWidth: 48, alignItems: 'flex-end' },
  porcentaje:         { fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  alertaBanner:       { marginHorizontal: 20, marginTop: 10, backgroundColor: '#FEF3C7', borderLeftWidth: 3, borderLeftColor: '#F59E0B', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 10 },
  alertaBannerTexto:  { fontSize: 13, color: '#92400E', fontWeight: '600' },
})
