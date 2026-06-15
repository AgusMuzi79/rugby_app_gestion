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
import { colors, fonts } from '@/constants/theme'

// ─── Tokens ───────────────────────────────────────────────────────────────────

const FONDO   = '#15110A'
const CARD    = '#1C1710'
const TEXTO   = '#F3EFE4'
const MUTED   = '#8E8574'
const DIVIDER = '#2C2418'
const ROJO    = colors.rojoUrgente
const VERDE   = '#22C55E'
const NARANJA = '#F97316'

function colorPorcentaje(p: number | null): string {
  if (p === null) return MUTED
  if (p >= 75) return VERDE
  if (p >= 50) return NARANJA
  return ROJO
}

// ─── FilaJugador ─────────────────────────────────────────────────────────────

function FilaJugador({ jugador }: { jugador: JugadorAsistencia }) {
  const { porcentaje, ausenciasConsecutivas, totalEventos, totalPresentes, nombre_completo } = jugador
  const color = colorPorcentaje(porcentaje)

  return (
    <View style={styles.fila}>
      <View style={styles.filaInfo}>
        <View style={styles.filaNombreRow}>
          <Text style={styles.nombreJugador} numberOfLines={1}>{nombre_completo}</Text>
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

// ─── SelectorDivision ────────────────────────────────────────────────────────

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
      contentContainerStyle={styles.selectorContent}
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

// ─── Screen ───────────────────────────────────────────────────────────────────

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

  if (sinDivisiones) {
    return (
      <SafeAreaView style={styles.centrado}>
        <Text style={styles.mutedTexto}>Sin divisiones asignadas.</Text>
        <Text style={styles.mutedTexto}>Contactá a la Subcomisión.</Text>
      </SafeAreaView>
    )
  }

  const conAlerta = jugadores.filter(j => j.ausenciasConsecutivas).length

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.labelHeader}>COORDINADOR</Text>
        <Text style={styles.titulo}>Asistencia</Text>
        {divisionNombre ? (
          <Text style={styles.subtitulo}>{divisionNombre}</Text>
        ) : null}
      </View>

      <SelectorDivision
        divisiones={divisiones}
        seleccionada={divisionSeleccionada}
        onSeleccionar={seleccionarDivision}
      />

      {/* Divider — marginTop dynamic based on divisiones.length */}
      <View style={[
        styles.divider,
        divisiones.length > 1 ? styles.dividerMt : styles.dividerMt0,
      ]} />

      {loading ? (
        <View style={styles.centrado}>
          <ActivityIndicator color={colors.oro} size="large" />
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
              <View key={l.label} style={styles.leyendaItem}>
                {/* backgroundColor: l.color is truly dynamic (from runtime data map) — keep inline */}
                <View style={[styles.leyendaDot, { backgroundColor: l.color }]} />
                <Text style={styles.leyendaTexto}>{l.label}</Text>
              </View>
            ))}
            <Text style={styles.contador}>{jugadores.length} jugadores</Text>
          </View>

          <FlatList
            data={jugadores}
            keyExtractor={item => item.id}
            renderItem={({ item }) => <FilaJugador jugador={item} />}
            ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
            contentContainerStyle={jugadores.length === 0 ? styles.listaVacia : styles.listaContent}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
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
  container: { flex: 1, backgroundColor: FONDO },
  centrado:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: FONDO, gap: 8 },
  mutedTexto:{ fontFamily: fonts.cuerpo, color: MUTED, fontSize: 14, fontStyle: 'italic' },

  header:       { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14 },
  labelHeader:  { fontFamily: fonts.label, fontSize: 10, letterSpacing: 2.5, color: colors.oro, marginBottom: 4 },
  titulo:       { fontFamily: fonts.titulo, fontSize: 32, color: TEXTO },
  subtitulo:    { fontFamily: fonts.cuerpo, fontSize: 12, color: MUTED, marginTop: 4, letterSpacing: 0.3 },

  selectorScroll:  { marginBottom: 12 },
  selectorContent: { paddingHorizontal: 20, gap: 8, flexDirection: 'row', alignItems: 'center' },
  pill:            { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: DIVIDER },
  pillActiva:      { backgroundColor: TEXTO, borderColor: TEXTO },
  pillTexto:       { fontFamily: fonts.cuerpo, fontSize: 13, color: MUTED },
  pillTextoActivo: { color: colors.oro },

  divider:    { height: 1, backgroundColor: DIVIDER, marginHorizontal: 20 },
  dividerMt:  { marginTop: 12 },
  dividerMt0: { marginTop: 0 },
  itemSeparator: { height: 1, backgroundColor: DIVIDER, marginHorizontal: 20 },

  leyenda:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, gap: 14 },
  leyendaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  leyendaDot:  { width: 8, height: 8, borderRadius: 4 },
  leyendaTexto:{ fontFamily: fonts.label, fontSize: 11, color: MUTED },
  contador:    { marginLeft: 'auto', fontFamily: fonts.label, fontSize: 12, color: TEXTO, fontWeight: '600', letterSpacing: 0.5 },

  fila:                { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 13, gap: 12 },
  filaInfo:            { flex: 1 },
  filaNombreRow:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nombreJugador:       { fontFamily: fonts.cuerpo, fontSize: 15, color: TEXTO, flexShrink: 1 },
  detalle:             { fontFamily: fonts.label, fontSize: 11, color: MUTED, marginTop: 2 },
  alerta:              { backgroundColor: ROJO, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2 },
  alertaTexto:         { fontFamily: fonts.label, fontSize: 9, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  porcentajeContainer: { minWidth: 48, alignItems: 'flex-end' },
  porcentaje:          { fontFamily: fonts.cuerpo, fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },

  alertaBanner:       { marginHorizontal: 20, marginTop: 10, backgroundColor: '#2A1A00', borderLeftWidth: 3, borderLeftColor: colors.oro, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 10 },
  alertaBannerTexto:  { fontFamily: fonts.cuerpo, fontSize: 13, color: colors.oroHondo, fontWeight: '600' },

  listaVacia:  { flex: 1 },
  listaContent:{ paddingBottom: 16 },
  emptyWrap:   { alignItems: 'center', paddingVertical: 48 },
})
