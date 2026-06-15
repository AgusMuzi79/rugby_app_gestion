import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
} from 'react-native'
import { useRef } from 'react'
import { useScrollToTop } from '@react-navigation/native'
import { useAsistencia, EstadoAsistencia, JugadorConEstado } from '@/hooks/useAsistencia'
import { colors, fonts } from '@/constants/theme'

// ─── Tokens ───────────────────────────────────────────────────────────────────

const VERDE  = '#4A7C59'
const ROJO   = colors.rojoUrgente  // #C0392B
const DORADO = colors.oro           // #E8B53C

const BADGES: { key: EstadoAsistencia; label: string; bg: string; textColor: string }[] = [
  { key: 'presente',    label: 'PRES', bg: VERDE,  textColor: '#FFFFFF' },
  { key: 'ausente',     label: 'AUS',  bg: ROJO,   textColor: '#FFFFFF' },
  { key: 'justificado', label: 'JUST', bg: DORADO,  textColor: '#000000' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fechaFormateada(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ContadorBox({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <View style={[s.contadorBox, { borderColor: color }]}>
      <Text style={[s.contadorNum, { color }]}>{count}</Text>
      <Text style={s.contadorLabel}>{label}</Text>
    </View>
  )
}

function FilaJugador({
  item,
  index,
  alertas,
  onMarca,
}: {
  item: JugadorConEstado
  index: number
  alertas: string[]
  onMarca: (id: string, estado: EstadoAsistencia) => void
}) {
  const conAlerta = alertas.includes(item.nombre_completo)
  const numero    = String(index + 1).padStart(2, '0')

  return (
    <View style={s.fila}>
      <Text style={s.numero}>{numero}</Text>
      <View style={s.infoCol}>
        <Text style={s.nombre} numberOfLines={1}>{item.nombre_completo}</Text>
        {conAlerta && <Text style={s.alertaInline}>⚠ 4 AUSENCIAS</Text>}
      </View>
      <View style={s.badgesRow}>
        {BADGES.map(badge => {
          const activo = item.estado === badge.key
          return (
            <TouchableOpacity
              key={badge.key}
              // badge.bg and badge.textColor are constants from the BADGES array — truly dynamic per item
              style={[s.badge, activo ? { backgroundColor: badge.bg, borderColor: badge.bg } : s.badgeInactivo]}
              onPress={() => onMarca(item.id, badge.key)}
              activeOpacity={0.75}
            >
              <Text style={[s.badgeTexto, { color: activo ? badge.textColor : '#A09880' }]}>
                {badge.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AsistenciaScreen() {
  const scrollRef = useRef<FlatList>(null)
  useScrollToTop(scrollRef)
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

  const presentes = jugadores.filter(j => j.estado === 'presente').length
  const ausentes  = jugadores.filter(j => j.estado === 'ausente').length
  const justifs   = jugadores.filter(j => j.estado === 'justificado').length

  if (loading) {
    return (
      <SafeAreaView style={s.centrado}>
        <ActivityIndicator color={colors.oro} size="large" />
      </SafeAreaView>
    )
  }

  if (sinDivision) {
    return (
      <SafeAreaView style={s.centrado}>
        <Text style={s.mutedTexto}>Sin división asignada.</Text>
        <Text style={s.mutedTexto}>Contactá a la Subcomisión.</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={s.root}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <View style={s.headerTop}>
          <View style={s.headerLeft}>
            <Text style={s.seccion}>SECCIÓN · CANCHA</Text>
            <Text style={s.titulo}>Toma de asistencia</Text>
          </View>
          <TouchableOpacity
            style={[s.guardarBtn, guardando && s.guardarBtnGuardando]}
            onPress={guardarAsistencia}
            disabled={guardando}
            activeOpacity={0.8}
          >
            {guardando
              ? <ActivityIndicator color={colors.oro} size="small" />
              : <Text style={s.guardarTexto}>GUARDAR</Text>
            }
          </TouchableOpacity>
        </View>
        <Text style={s.headerMeta}>
          {divisionNombre.toUpperCase()} · {fechaFormateada(fecha).toUpperCase()} · CANCHA PRINCIPAL
        </Text>
      </View>

      <View style={s.divider} />

      {/* ── Contadores ─────────────────────────────────────────────────────── */}
      <View style={s.contadores}>
        <ContadorBox label="PRESENTES" count={presentes} color={VERDE}  />
        <ContadorBox label="AUSENTES"  count={ausentes}  color={ROJO}   />
        <ContadorBox label="JUSTIF."   count={justifs}   color={DORADO} />
      </View>

      {/* ── Lista de jugadores ─────────────────────────────────────────────── */}
      <FlatList
        ref={scrollRef}
        data={jugadores}
        keyExtractor={item => item.id}
        renderItem={({ item, index }) => (
          <FilaJugador
            item={item}
            index={index}
            alertas={alertas}
            onMarca={marcarEstado}
          />
        )}
        ItemSeparatorComponent={() => <View style={s.separator} />}
        contentContainerStyle={s.listContent}
      />

      {/* ── Estado ─────────────────────────────────────────────────────────── */}
      {(errorGuardado || (guardado && !guardando)) && (
        <View style={s.statusBar}>
          {errorGuardado && !guardando && (
            <Text style={s.statusError}>✕ {errorGuardado}</Text>
          )}
          {guardado && !guardando && !errorGuardado && (
            pendienteSync
              ? <Text style={s.statusPendiente}>⏳ Pendiente de sincronización</Text>
              : <Text style={s.statusOk}>✓ Asistencia guardada — {marcados}/{jugadores.length} marcados</Text>
          )}
        </View>
      )}

    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const FONDO   = '#15110A'
const DIVIDER = '#2C2418'

const s = StyleSheet.create({
  root:     { flex: 1, backgroundColor: FONDO },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: FONDO, gap: 8 },
  mutedTexto: {
    fontFamily: fonts.titulo,
    fontSize: 16,
    color: '#9A9080',
    textAlign: 'center',
  },

  // Header
  header:    { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14 },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerLeft: { flex: 1 },
  seccion: {
    fontFamily: fonts.label,
    fontSize: 9,
    letterSpacing: 3,
    color: colors.oro,
    marginBottom: 6,
  },
  titulo: {
    fontFamily: fonts.titulo,
    fontSize: 28,
    color: colors.tinta,
    lineHeight: 34,
  },
  headerMeta: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1.5,
    color: '#7A7060',
  },

  // GUARDAR button (header)
  guardarBtn: {
    borderWidth: 1,
    borderColor: colors.oro,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 2,
    marginTop: 4,
    minWidth: 72,
    alignItems: 'center',
  },
  guardarBtnGuardando: { opacity: 0.55 },
  guardarTexto: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.oro,
  },

  divider: { height: 1, backgroundColor: DIVIDER, marginHorizontal: 20 },

  // Contadores
  contadores: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 10,
  },
  contadorBox: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 2,
    paddingVertical: 12,
    alignItems: 'center',
  },
  contadorNum: {
    fontFamily: fonts.titulo,
    fontSize: 28,
    lineHeight: 34,
  },
  contadorLabel: {
    fontFamily: fonts.label,
    fontSize: 8,
    letterSpacing: 2,
    color: '#8A8070',
    marginTop: 2,
  },

  // Player rows
  listContent: { paddingBottom: 8 },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  numero: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 1,
    color: '#A89E8C',
    width: 28,
  },
  infoCol: {
    flex: 1,
    marginRight: 10,
  },
  nombre: {
    fontFamily: fonts.cuerpo,
    fontSize: 15,
    color: colors.tinta,
  },
  alertaInline: {
    fontFamily: fonts.label,
    fontSize: 9,
    letterSpacing: 1.5,
    color: colors.rojoUrgente,
    marginTop: 3,
  },
  separator: {
    height: 1,
    backgroundColor: DIVIDER,
    marginHorizontal: 20,
  },

  // Badges
  badgesRow: { flexDirection: 'row', gap: 5 },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 2,
    borderWidth: 1,
  },
  badgeInactivo: { borderColor: '#C5BEA8', backgroundColor: 'transparent' },
  badgeTexto: {
    fontFamily: fonts.label,
    fontSize: 9,
    letterSpacing: 1,
  },

  // Status bar
  statusBar: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: DIVIDER,
  },
  statusOk: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1,
    color: VERDE,
  },
  statusPendiente: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.oroHondo,
  },
  statusError: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.rojoUrgente,
  },
})
