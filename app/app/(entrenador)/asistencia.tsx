import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
} from 'react-native'
import { useAsistencia, EstadoAsistencia, JugadorConEstado } from '@/hooks/useAsistencia'

const CREAM = '#F5F0E8'
const GOLD = '#C9A84C'
const DARK = '#1A1A1A'
const DIVIDER = '#D1C9B8'
const MUTED = '#7C7267'
const VERDE = '#22C55E'
const ROJO = '#EF4444'

const ESTADOS: { key: EstadoAsistencia; label: string; color: string }[] = [
  { key: 'presente',    label: 'P', color: VERDE },
  { key: 'ausente',     label: 'A', color: ROJO },
  { key: 'justificado', label: 'J', color: GOLD },
]

function fechaFormateada(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function FilaJugador({
  item,
  onMarca,
}: {
  item: JugadorConEstado
  onMarca: (id: string, estado: EstadoAsistencia) => void
}) {
  return (
    <View style={styles.fila}>
      <Text style={styles.nombreJugador} numberOfLines={1}>
        {item.nombre_completo}
      </Text>
      <View style={styles.botonesFila}>
        {ESTADOS.map(e => {
          const activo = item.estado === e.key
          return (
            <TouchableOpacity
              key={e.key}
              style={[
                styles.botonEstado,
                activo
                  ? { backgroundColor: e.color, borderColor: e.color }
                  : { backgroundColor: 'transparent', borderColor: DIVIDER },
              ]}
              onPress={() => onMarca(item.id, e.key)}
              activeOpacity={0.75}
            >
              <Text style={[styles.botonEstadoTexto, { color: activo ? '#fff' : MUTED }]}>
                {e.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

export default function AsistenciaScreen() {
  const {
    jugadores,
    loading,
    guardando,
    guardado,
    pendienteSync,
    errorGuardado,
    alertas,
    fecha,
    divisionNombre,
    sinDivision,
    marcados,
    marcarEstado,
    guardarAsistencia,
  } = useAsistencia()

  if (loading) {
    return (
      <SafeAreaView style={styles.centrado}>
        <ActivityIndicator color={GOLD} size="large" />
      </SafeAreaView>
    )
  }

  if (sinDivision) {
    return (
      <SafeAreaView style={styles.centrado}>
        <Text style={styles.mutedTexto}>Sin división asignada.</Text>
        <Text style={styles.mutedTexto}>Contactá a la Subcomisión.</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.labelHeader}>ENTRENADOR · {divisionNombre.toUpperCase()}</Text>
        <Text style={styles.titulo}>Asistencia</Text>
        <Text style={styles.fecha}>{fechaFormateada(fecha)}</Text>
      </View>

      <View style={{ height: 1, backgroundColor: DIVIDER, marginHorizontal: 20 }} />

      <View style={styles.leyenda}>
        {ESTADOS.map(e => (
          <View key={e.key} style={styles.leyendaItem}>
            <View style={[styles.leyendaDot, { backgroundColor: e.color }]} />
            <Text style={styles.leyendaTexto}>{e.key.charAt(0).toUpperCase() + e.key.slice(1)}</Text>
          </View>
        ))}
        <Text style={styles.contador}>{marcados}/{jugadores.length}</Text>
      </View>

      <FlatList
        data={jugadores}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <FilaJugador item={item} onMarca={marcarEstado} />
        )}
        ItemSeparatorComponent={() => (
          <View style={{ height: 1, backgroundColor: DIVIDER, marginHorizontal: 16 }} />
        )}
        contentContainerStyle={{ paddingBottom: 8 }}
      />

      <View style={styles.footer}>
        {alertas.length > 0 && (
          <View style={styles.alertaBanner}>
            <Text style={styles.alertaTitulo}>⚠ 4 ausencias consecutivas</Text>
            {alertas.map(nombre => (
              <Text key={nombre} style={styles.alertaNombre}>· {nombre}</Text>
            ))}
          </View>
        )}

        {errorGuardado && !guardando && (
          <View style={[styles.alertaBanner, { borderLeftColor: ROJO, backgroundColor: '#FEF2F2' }]}>
            <Text style={[styles.alertaTitulo, { color: '#991B1B' }]}>Error al guardar</Text>
            <Text style={[styles.alertaNombre, { color: '#7F1D1D' }]}>{errorGuardado}</Text>
          </View>
        )}

        {guardado && !guardando && !errorGuardado && (
          <View style={styles.estadoBanner}>
            {pendienteSync ? (
              <Text style={styles.estadoPendiente}>⏳ Pendiente de sincronización</Text>
            ) : (
              <Text style={styles.estadoGuardado}>✓ Asistencia guardada</Text>
            )}
          </View>
        )}

        <TouchableOpacity
          style={[styles.botonGuardar, guardando && { opacity: 0.6 }]}
          onPress={guardarAsistencia}
          disabled={guardando}
          activeOpacity={0.85}
        >
          {guardando ? (
            <ActivityIndicator color={GOLD} size="small" />
          ) : (
            <Text style={styles.botonGuardarTexto}>GUARDAR ASISTENCIA</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: CREAM },
  centrado:        { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: CREAM, gap: 8 },
  mutedTexto:      { color: MUTED, fontSize: 14, fontFamily: 'serif', fontStyle: 'italic' },
  header:          { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  labelHeader:     { fontSize: 10, letterSpacing: 2.5, color: GOLD, marginBottom: 4 },
  titulo:          { fontSize: 32, fontStyle: 'italic', fontFamily: 'serif', color: DARK, lineHeight: 36 },
  fecha:           { fontSize: 13, color: MUTED, marginTop: 4, fontStyle: 'italic', fontFamily: 'serif', textTransform: 'capitalize' },
  leyenda:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, gap: 12 },
  leyendaItem:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  leyendaDot:      { width: 8, height: 8, borderRadius: 4 },
  leyendaTexto:    { fontSize: 11, color: MUTED },
  contador:        { marginLeft: 'auto', fontSize: 12, color: DARK, fontWeight: '600', letterSpacing: 0.5 },
  fila:            { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  nombreJugador:   { flex: 1, fontSize: 15, color: DARK, marginRight: 12 },
  botonesFila:     { flexDirection: 'row', gap: 6 },
  botonEstado:     { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  botonEstadoTexto:{ fontSize: 12, fontWeight: '700' },
  footer:          { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, borderTopWidth: 1, borderTopColor: DIVIDER, gap: 8 },
  alertaBanner:    { backgroundColor: '#FEF3C7', borderLeftWidth: 3, borderLeftColor: '#F59E0B', borderRadius: 6, padding: 12, gap: 2 },
  alertaTitulo:    { fontSize: 12, fontWeight: '700', color: '#92400E', marginBottom: 2 },
  alertaNombre:    { fontSize: 13, color: '#78350F' },
  estadoBanner:    { alignItems: 'center' },
  estadoGuardado:  { fontSize: 13, color: VERDE, fontWeight: '600' },
  estadoPendiente: { fontSize: 13, color: GOLD, fontWeight: '600' },
  botonGuardar:    { backgroundColor: DARK, paddingVertical: 16, borderRadius: 4, alignItems: 'center' },
  botonGuardarTexto:{ color: GOLD, fontSize: 12, letterSpacing: 2.5, fontWeight: '600' },
})
