import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
} from 'react-native'
import { usePartido, RolEnMesa, PartidoEvento, JugadorPartido, ConteoMesa } from '@/hooks/usePartido'

const CREAM  = '#F5F0E8'
const GOLD   = '#C9A84C'
const DARK   = '#1A1A1A'
const DIVIDER= '#D1C9B8'
const MUTED  = '#7C7267'
const VERDE  = '#22C55E'
const ROJO   = '#EF4444'
const AZUL   = '#3B82F6'
const VIOLETA= '#8B5CF6'

const ROL_CONFIG: Record<RolEnMesa, { label: string; color: string }> = {
  capitan:       { label: 'C',  color: GOLD },
  titular:       { label: 'T',  color: AZUL },
  suplente:      { label: 'S',  color: VERDE },
  cuerpo_tecnico:{ label: 'CT', color: VIOLETA },
}

const ROLES: RolEnMesa[] = ['capitan', 'titular', 'suplente', 'cuerpo_tecnico']

function formatFecha(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

// ─── Selector de partidos ────────────────────────────────────────────────────

function SelectorPartidos({
  partidos,
  seleccionado,
  onSelect,
}: {
  partidos: PartidoEvento[]
  seleccionado: PartidoEvento | null
  onSelect: (p: PartidoEvento) => void
}) {
  if (partidos.length === 0) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyTexto}>Sin partidos programados (próximos 14 días).</Text>
        <Text style={styles.emptySubtexto}>El Coordinador debe cargarlos en el calendario.</Text>
      </View>
    )
  }

  return (
    <View style={styles.selectorBox}>
      <Text style={styles.sectionLabel}>SELECCIONAR PARTIDO</Text>
      {partidos.map(p => {
        const activo = seleccionado?.id === p.id
        return (
          <TouchableOpacity
            key={p.id}
            style={[styles.partidoCard, activo && styles.partidoCardActivo]}
            onPress={() => onSelect(p)}
            activeOpacity={0.8}
          >
            <View style={styles.partidoCardRow}>
              <View style={[styles.partidoDot, { backgroundColor: activo ? GOLD : DIVIDER }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.partidoRival, activo && { color: GOLD }]}>
                  vs {p.rival ?? 'Rival por confirmar'}
                </Text>
                <Text style={styles.partidoDetalle}>
                  {formatFecha(p.fecha)}{p.lugar ? ` · ${p.lugar}` : ''}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

// ─── Fila jugador asistencia ─────────────────────────────────────────────────

function FilaAsistencia({
  jugador,
  onToggle,
}: {
  jugador: JugadorPartido
  onToggle: (id: string) => void
}) {
  return (
    <TouchableOpacity style={styles.fila} onPress={() => onToggle(jugador.id)} activeOpacity={0.7}>
      <View style={[styles.checkbox, jugador.presente && styles.checkboxActivo]}>
        {jugador.presente && <Text style={styles.checkmark}>✓</Text>}
      </View>
      <Text style={[styles.nombreJugador, !jugador.presente && styles.nombreAusente]}>
        {jugador.nombre_completo}
      </Text>
      <Text style={[styles.estadoTexto, { color: jugador.presente ? VERDE : ROJO }]}>
        {jugador.presente ? 'Presente' : 'Ausente'}
      </Text>
    </TouchableOpacity>
  )
}

// ─── Fila jugador mesa ───────────────────────────────────────────────────────

function FilaMesa({
  jugador,
  onAsignar,
}: {
  jugador: JugadorPartido
  onAsignar: (id: string, rol: RolEnMesa) => void
}) {
  return (
    <View style={styles.fila}>
      <Text style={styles.nombreJugador} numberOfLines={1}>{jugador.nombre_completo}</Text>
      <View style={styles.rolesBotones}>
        {ROLES.map(rol => {
          const cfg = ROL_CONFIG[rol]
          const activo = jugador.rolEnMesa === rol
          return (
            <TouchableOpacity
              key={rol}
              style={[
                styles.rolBoton,
                activo
                  ? { backgroundColor: cfg.color, borderColor: cfg.color }
                  : { backgroundColor: 'transparent', borderColor: DIVIDER },
              ]}
              onPress={() => onAsignar(jugador.id, rol)}
              activeOpacity={0.75}
            >
              <Text style={[styles.rolBotonTexto, { color: activo ? '#fff' : MUTED }]}>
                {cfg.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

// ─── Conteo mesa ─────────────────────────────────────────────────────────────

function ConteoMesaBar({ conteo }: { conteo: ConteoMesa }) {
  const enCancha = conteo.capitan + conteo.titular
  return (
    <View style={styles.conteoRow}>
      <Text style={[styles.conteoItem, { color: GOLD }]}>C: {conteo.capitan}/1</Text>
      <Text style={[styles.conteoItem, { color: AZUL }]}>T: {conteo.titular}/14</Text>
      <Text style={[styles.conteoItem, { color: VERDE }]}>S: {conteo.suplente}/8</Text>
      <Text style={[styles.conteoItem, { color: VIOLETA }]}>CT: {conteo.cuerpo_tecnico}</Text>
      <Text style={[styles.conteoItem, { color: enCancha > 15 ? ROJO : MUTED }]}>
        Cancha: {enCancha}/15
      </Text>
    </View>
  )
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function PartidoScreen() {
  const {
    loading,
    divisionNombre,
    sinDivision,
    partidos,
    partidoSeleccionado,
    jugadores,
    paso,
    guardandoAsistencia,
    asistenciaGuardada,
    errorAsistencia,
    guardandoMesa,
    mesaGuardada,
    errorMesa,
    conteoMesa,
    seleccionarPartido,
    togglePresente,
    guardarAsistencia,
    asignarRol,
    guardarMesa,
  } = usePartido()

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

  const jugadoresPresentes = jugadores.filter(j => j.presente)

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.labelHeader}>ENTRENADOR · {divisionNombre.toUpperCase()}</Text>
        <Text style={styles.titulo}>Partido</Text>
      </View>
      <View style={styles.separador} />

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>

        {/* Selector partidos */}
        <SelectorPartidos
          partidos={partidos}
          seleccionado={partidoSeleccionado}
          onSelect={seleccionarPartido}
        />

        {/* Secciones — solo cuando hay partido seleccionado */}
        {partidoSeleccionado && (
          <>
            {/* ── PASO 1: ASISTENCIA ── */}
            <View style={styles.seccion}>
              <View style={styles.seccionHeader}>
                <Text style={styles.seccionLabel}>PASO 1 · ASISTENCIA</Text>
                {asistenciaGuardada && <Text style={styles.checkVerde}>✓</Text>}
              </View>
              <Text style={styles.seccionSub}>
                {jugadoresPresentes.length} presentes · {jugadores.length - jugadoresPresentes.length} ausentes
              </Text>

              {jugadores.map((j, i) => (
                <View key={j.id}>
                  {i > 0 && <View style={styles.filaDiv} />}
                  <FilaAsistencia jugador={j} onToggle={togglePresente} />
                </View>
              ))}

              {errorAsistencia && (
                <View style={[styles.banner, styles.bannerError]}>
                  <Text style={styles.bannerErrorTexto}>{errorAsistencia}</Text>
                </View>
              )}

              {asistenciaGuardada && !guardandoAsistencia && (
                <View style={styles.banner}>
                  <Text style={styles.bannerOkTexto}>✓ Asistencia confirmada</Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.boton, guardandoAsistencia && { opacity: 0.6 }]}
                onPress={guardarAsistencia}
                disabled={guardandoAsistencia}
                activeOpacity={0.85}
              >
                {guardandoAsistencia
                  ? <ActivityIndicator color={GOLD} size="small" />
                  : <Text style={styles.botonTexto}>CONFIRMAR ASISTENCIA</Text>}
              </TouchableOpacity>
            </View>

            {/* ── PASO 2: MESA ── */}
            <View style={[styles.seccion, paso === 'asistencia' && styles.seccionBloqueada]}>
              <View style={styles.seccionHeader}>
                <Text style={styles.seccionLabel}>PASO 2 · MESA DE PARTIDO</Text>
                {mesaGuardada && <Text style={styles.checkVerde}>✓</Text>}
              </View>

              {paso === 'asistencia' ? (
                <Text style={styles.mutedTexto}>Confirmá la asistencia primero.</Text>
              ) : (
                <>
                  {/* Leyenda roles */}
                  <View style={styles.leyendaRoles}>
                    {ROLES.map(r => (
                      <View key={r} style={styles.leyendaItem}>
                        <View style={[styles.leyendaDot, { backgroundColor: ROL_CONFIG[r].color }]} />
                        <Text style={styles.leyendaTexto}>
                          {r === 'cuerpo_tecnico' ? 'C.Téc.' : r.charAt(0).toUpperCase() + r.slice(1)}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <ConteoMesaBar conteo={conteoMesa} />

                  {jugadoresPresentes.length === 0 ? (
                    <Text style={styles.mutedTexto}>No hay jugadores presentes.</Text>
                  ) : (
                    jugadoresPresentes.map((j, i) => (
                      <View key={j.id}>
                        {i > 0 && <View style={styles.filaDiv} />}
                        <FilaMesa jugador={j} onAsignar={asignarRol} />
                      </View>
                    ))
                  )}

                  {errorMesa && (
                    <View style={[styles.banner, styles.bannerError]}>
                      <Text style={styles.bannerErrorTexto}>{errorMesa}</Text>
                    </View>
                  )}

                  {mesaGuardada && !guardandoMesa && (
                    <View style={styles.banner}>
                      <Text style={styles.bannerOkTexto}>✓ Mesa guardada</Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={[styles.boton, guardandoMesa && { opacity: 0.6 }]}
                    onPress={guardarMesa}
                    disabled={guardandoMesa}
                    activeOpacity={0.85}
                  >
                    {guardandoMesa
                      ? <ActivityIndicator color={GOLD} size="small" />
                      : <Text style={styles.botonTexto}>GUARDAR MESA</Text>}
                  </TouchableOpacity>
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: CREAM },
  centrado:          { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: CREAM, gap: 8 },
  mutedTexto:        { color: MUTED, fontSize: 14, fontFamily: 'serif', fontStyle: 'italic', textAlign: 'center' },
  header:            { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  labelHeader:       { fontSize: 10, letterSpacing: 2.5, color: GOLD, marginBottom: 4 },
  titulo:            { fontSize: 32, fontStyle: 'italic', fontFamily: 'serif', color: DARK, lineHeight: 36 },
  separador:         { height: 1, backgroundColor: DIVIDER, marginHorizontal: 20 },

  // Selector
  selectorBox:       { padding: 20, gap: 8 },
  sectionLabel:      { fontSize: 10, letterSpacing: 2, color: GOLD, marginBottom: 4 },
  emptyBox:          { padding: 20, gap: 6 },
  emptyTexto:        { color: MUTED, fontSize: 14, fontStyle: 'italic', fontFamily: 'serif' },
  emptySubtexto:     { color: MUTED, fontSize: 12 },
  partidoCard:       { borderWidth: 1, borderColor: DIVIDER, borderRadius: 8, padding: 12 },
  partidoCardActivo: { borderColor: GOLD, backgroundColor: '#FBF6EA' },
  partidoCardRow:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  partidoDot:        { width: 8, height: 8, borderRadius: 4 },
  partidoRival:      { fontSize: 15, color: DARK, fontWeight: '600' },
  partidoDetalle:    { fontSize: 12, color: MUTED, marginTop: 2 },

  // Secciones
  seccion:           { marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderColor: DIVIDER, borderRadius: 10, padding: 16, gap: 8 },
  seccionBloqueada:  { opacity: 0.45 },
  seccionHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seccionLabel:      { fontSize: 10, letterSpacing: 2, color: GOLD },
  seccionSub:        { fontSize: 12, color: MUTED },
  checkVerde:        { fontSize: 16, color: VERDE, fontWeight: '700' },

  // Filas
  fila:              { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  filaDiv:           { height: 1, backgroundColor: DIVIDER },
  checkbox:          { width: 22, height: 22, borderRadius: 4, borderWidth: 1.5, borderColor: DIVIDER, justifyContent: 'center', alignItems: 'center' },
  checkboxActivo:    { backgroundColor: VERDE, borderColor: VERDE },
  checkmark:         { color: '#fff', fontSize: 13, fontWeight: '700', lineHeight: 16 },
  nombreJugador:     { flex: 1, fontSize: 14, color: DARK },
  nombreAusente:     { color: MUTED, textDecorationLine: 'line-through' },
  estadoTexto:       { fontSize: 11, fontWeight: '600', width: 56, textAlign: 'right' },

  // Mesa roles
  rolesBotones:      { flexDirection: 'row', gap: 4 },
  rolBoton:          { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  rolBotonTexto:     { fontSize: 10, fontWeight: '700' },

  // Leyenda
  leyendaRoles:      { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  leyendaItem:       { flexDirection: 'row', alignItems: 'center', gap: 4 },
  leyendaDot:        { width: 8, height: 8, borderRadius: 4 },
  leyendaTexto:      { fontSize: 11, color: MUTED },

  // Conteo
  conteoRow:         { flexDirection: 'row', gap: 10, flexWrap: 'wrap', paddingVertical: 4 },
  conteoItem:        { fontSize: 11, fontWeight: '600' },

  // Banners y botón
  banner:            { alignItems: 'center', paddingVertical: 6 },
  bannerError:       { backgroundColor: '#FEF2F2', borderLeftWidth: 3, borderLeftColor: ROJO, borderRadius: 6, padding: 12, alignItems: 'flex-start' },
  bannerErrorTexto:  { fontSize: 13, color: '#991B1B' },
  bannerOkTexto:     { fontSize: 13, color: VERDE, fontWeight: '600' },
  boton:             { backgroundColor: DARK, paddingVertical: 14, borderRadius: 4, alignItems: 'center', marginTop: 4 },
  botonTexto:        { color: GOLD, fontSize: 11, letterSpacing: 2.5, fontWeight: '600' },
})
