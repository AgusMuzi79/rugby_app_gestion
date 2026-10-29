import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRef } from 'react'
import { useScrollToTop } from '@react-navigation/native'
import { useLocalSearchParams } from 'expo-router'
import { useAsistencia, EstadoAsistencia, JugadorConEstado, DivisionOpcion } from '@/hooks/useAsistencia'
import { useColaOffline } from '@/hooks/useSincronizacionOffline'
import { etiquetaEntrenamiento, type EntrenamientoHoy } from '@/lib/entrenamientoHoy'
import { nombresSinMarcar, textoSinMarcar } from '@/lib/marcadoAsistencia'
import { horaGuardado } from '@/lib/plantelGuardado'
import { ErrorCarga } from '@/components/shared/ErrorCarga'
import { useAnuncioAccesible } from '@/components/shared/useAnuncioAccesible'
import { colors, fonts } from '@/constants/theme'
import { AvatarPerfil } from '@/components/shared/Header'

// ─── Tokens ───────────────────────────────────────────────────────────────────

const VERDE  = '#4A7C59'
const ROJO   = colors.rojoUrgente  // #C0392B
const DORADO = colors.oro           // #E8B53C

// `nombre`: lo que lee el lector de pantalla ("Presente, Juan Pérez").
const BADGES: { key: EstadoAsistencia; label: string; nombre: string; bg: string; textColor: string }[] = [
  { key: 'presente',    label: 'PRES', nombre: 'Presente',    bg: VERDE,  textColor: '#FFFFFF' },
  { key: 'ausente',     label: 'AUS',  nombre: 'Ausente',     bg: ROJO,   textColor: '#FFFFFF' },
  { key: 'justificado', label: 'JUST', nombre: 'Justificado', bg: DORADO,  textColor: '#000000' },
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

function SelectorDivision({
  divisiones,
  divisionId,
  onSeleccionar,
}: {
  divisiones: DivisionOpcion[]
  divisionId: string | null
  onSeleccionar: (id: string) => void
}) {
  if (divisiones.length < 2) return null
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.divisionChips}
      accessibilityRole="radiogroup"
      accessibilityLabel="División"
    >
      {divisiones.map(div => {
        const activo = div.id === divisionId
        return (
          <TouchableOpacity
            key={div.id}
            style={[s.divisionChip, activo && s.divisionChipActivo]}
            onPress={() => onSeleccionar(div.id)}
            activeOpacity={0.8}
            accessibilityRole="radio"
            accessibilityState={{ selected: activo, checked: activo }}
            accessibilityLabel={`División ${div.nombre}`}
          >
            <Text style={[s.divisionChipTexto, activo && s.divisionChipTextoActivo]}>
              {div.nombre.toUpperCase()}
            </Text>
          </TouchableOpacity>
        )
      })}
    </ScrollView>
  )
}

// Doble turno: el entrenador elige a qué entrenamiento de hoy va la lista.
function SelectorEntrenamiento({
  entrenamientos,
  eventoId,
  onSeleccionar,
}: {
  entrenamientos: EntrenamientoHoy[]
  eventoId: string | null
  onSeleccionar: (id: string) => void
}) {
  if (entrenamientos.length < 2) return null
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.divisionChips}
      accessibilityRole="radiogroup"
      accessibilityLabel="Entrenamiento de hoy"
    >
      {entrenamientos.map((ev, i) => {
        const activo = ev.id === eventoId
        const etiqueta = etiquetaEntrenamiento(ev, i)
        return (
          <TouchableOpacity
            key={ev.id}
            style={[s.divisionChip, activo && s.divisionChipActivo]}
            onPress={() => onSeleccionar(ev.id)}
            activeOpacity={0.8}
            accessibilityRole="radio"
            accessibilityState={{ selected: activo, checked: activo }}
            accessibilityLabel={`Entrenamiento ${etiqueta}`}
          >
            <Text style={[s.divisionChipTexto, activo && s.divisionChipTextoActivo]}>
              ENTRENAMIENTO {etiqueta.toUpperCase()}
            </Text>
          </TouchableOpacity>
        )
      })}
    </ScrollView>
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
      <View
        style={s.badgesRow}
        accessibilityRole="radiogroup"
        accessibilityLabel={`Asistencia de ${item.nombre_completo}`}
      >
        {BADGES.map(badge => {
          const activo = item.estado === badge.key
          return (
            <TouchableOpacity
              key={badge.key}
              // badge.bg and badge.textColor are constants from the BADGES array — truly dynamic per item
              style={[s.badge, activo ? { backgroundColor: badge.bg, borderColor: badge.bg } : s.badgeInactivo]}
              // Feedback háptico (Haptics.selectionAsync) cuando expo-haptics esté en el binario (Tanda 3, build nativo).
              onPress={() => onMarca(item.id, badge.key)}
              activeOpacity={0.75}
              accessibilityRole="radio"
              accessibilityState={{ selected: activo, checked: activo }}
              accessibilityLabel={`${badge.nombre}, ${item.nombre_completo}`}
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
  // Si la cola ya se vació (volvió la señal), la asistencia llegó: "guardada".
  const pendientesCola = useColaOffline(st => st.pendientes)
  const noEnviadas = useColaOffline(st => st.noEnviadas)
  // Desde el Inicio llega el entrenamiento de hoy elegido (y su división).
  const params = useLocalSearchParams<{ eventoId?: string; divisionId?: string }>()
  const {
    jugadores,
    loading,
    guardando,
    guardado,
    pendienteSync,
    errorGuardado,
    alertas,
    fecha,
    divisiones,
    divisionId,
    divisionNombre,
    sinDivision,
    errorCarga,
    listaGuardadaEn,
    recargar,
    marcados,
    entrenamientos,
    eventoId,
    seleccionarDivision,
    seleccionarEntrenamiento,
    marcarEstado,
    marcarTodos,
    guardarAsistencia,
  } = useAsistencia({ eventoId: params.eventoId, divisionId: params.divisionId })

  const presentes = jugadores.filter(j => j.estado === 'presente').length
  const ausentes  = jugadores.filter(j => j.estado === 'ausente').length
  const justifs   = jugadores.filter(j => j.estado === 'justificado').length
  const todosMarcados = marcados === jugadores.length
  // GUARDAR no se puede tocar mientras guarda, carga o no hay lista.
  const guardarBloqueado = guardando || loading || !!errorCarga

  // Resultado del último guardado: se ve abajo y se anuncia al lector de pantalla.
  const estado: { tipo: 'error' | 'pendiente' | 'ok'; texto: string; anuncio: string } | null =
    guardando ? null
    : errorGuardado ? { tipo: 'error', texto: `✕ ${errorGuardado}`, anuncio: errorGuardado }
    : !guardado ? null
    : pendienteSync && pendientesCola > 0
      ? {
          tipo: 'pendiente',
          texto: `⏳ Sin señal: guardada en el teléfono. Se envía sola cuando vuelva la conexión${pendientesCola > 1 ? ` (${pendientesCola} pendientes)` : ''}.`,
          anuncio: 'Sin señal: asistencia guardada en el teléfono. Se envía sola cuando vuelva la conexión.',
        }
      : {
          tipo: 'ok',
          texto: `✓ Asistencia guardada — ${marcados}/${jugadores.length} marcados`,
          anuncio: `Asistencia guardada, ${marcados} de ${jugadores.length} marcados`,
        }
  useAnuncioAccesible(estado?.anuncio ?? null)

  // Si queda alguien sin marcar, se avisa quiénes antes de guardar.
  function onGuardar() {
    const faltan = nombresSinMarcar(jugadores)
    if (faltan.length === 0) { void guardarAsistencia(); return }
    Alert.alert('Asistencia incompleta', textoSinMarcar(faltan), [
      { text: 'Volver', style: 'cancel' },
      { text: 'Guardar igual', onPress: () => { void guardarAsistencia() } },
    ])
  }

  if (sinDivision) {
    return (
      <SafeAreaView style={s.centrado} edges={['top']}>
        <Text style={s.mutedTexto}>Sin división asignada.</Text>
        <Text style={s.mutedTexto}>Contactá a la Subcomisión.</Text>
      </SafeAreaView>
    )
  }

  // Falló la lectura de las divisiones y no hay copia en el teléfono: no es
  // "sin división" (antes mandaba a reclamarle a la Subcomisión).
  if (!divisionId && errorCarga) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <ErrorCarga mensaje={errorCarga} onReintentar={recargar} />
      </SafeAreaView>
    )
  }

  if (!divisionId) {
    return (
      <SafeAreaView style={s.centrado} edges={['top']}>
        <ActivityIndicator color={colors.oro} size="large" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <View style={s.headerTop}>
          <View style={s.headerLeft}>
            <Text style={s.seccion}>SECCIÓN · CANCHA</Text>
            <Text style={s.titulo}>Toma de asistencia</Text>
          </View>
          <AvatarPerfil />
        </View>
        <Text style={s.headerMeta}>
          {divisionNombre.toUpperCase()} · {fechaFormateada(fecha).toUpperCase()} · CANCHA PRINCIPAL
        </Text>
      </View>

      <SelectorDivision
        divisiones={divisiones}
        divisionId={divisionId}
        onSeleccionar={seleccionarDivision}
      />

      <SelectorEntrenamiento
        entrenamientos={entrenamientos}
        eventoId={eventoId}
        onSeleccionar={seleccionarEntrenamiento}
      />

      <View style={s.divider} />

      {loading ? (
        <View style={s.lista}>
          <ActivityIndicator color={colors.oro} style={s.loadingInline} />
        </View>
      ) : errorCarga ? (
        <View style={s.lista}>
          <ErrorCarga mensaje={errorCarga} onReintentar={recargar} />
        </View>
      ) : (
        <>
          {listaGuardadaEn !== null && (
            <View style={s.notaGuardada} accessibilityRole="text">
              <Text style={s.statusPendiente}>
                Sin señal: lista guardada al {horaGuardado(listaGuardadaEn)}. Marcá y guardá: se envía sola cuando vuelva la conexión.
              </Text>
            </View>
          )}

          {/* ── Contadores ─────────────────────────────────────────────────── */}
          <View style={s.contadores}>
            <ContadorBox label="PRESENTES" count={presentes} color={colors.confirmacion}  />
            <ContadorBox label="AUSENTES"  count={ausentes}  color={colors.rojoTexto}   />
            <ContadorBox label="JUSTIF."   count={justifs}   color={DORADO} />
          </View>

          {/* Un toque para todos; después se marcan sólo los ausentes. */}
          {jugadores.length > 0 && (
            <TouchableOpacity
              style={[s.todosBtn, todosMarcados && s.todosBtnInactivo]}
              onPress={marcarTodos}
              disabled={todosMarcados}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Marcar presentes a todos los que faltan marcar"
              accessibilityState={{ disabled: todosMarcados }}
            >
              <Text style={s.todosTexto}>✓ TODOS PRESENTES</Text>
            </TouchableOpacity>
          )}

          {/* ── Lista de jugadores ───────────────────────────────────────────── */}
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
            style={s.lista}
            contentContainerStyle={s.listContent}
          />
        </>
      )}

      {/* Guardadas sin señal que fallaron varias veces por un error que no es de
          red: no se reintentan más (siguen guardadas en el teléfono). */}
      {noEnviadas > 0 && (
        <View style={s.statusBar} accessibilityRole="alert">
          <Text style={s.statusError}>
            ✕ {noEnviadas === 1 ? 'Una asistencia guardada sin señal no se pudo enviar' : `${noEnviadas} asistencias guardadas sin señal no se pudieron enviar`}. Volvé a tomarla y guardala con conexión.
          </Text>
        </View>
      )}

      {/* ── Estado ─────────────────────────────────────────────────────────── */}
      {/* Siempre montada: la live region de Android sólo avisa cuando cambia. */}
      <View style={estado ? s.statusBar : null} accessibilityLiveRegion="polite">
        {estado && (
          <Text
            style={estado.tipo === 'error' ? s.statusError : estado.tipo === 'pendiente' ? s.statusPendiente : s.statusOk}
            accessibilityLabel={estado.anuncio}
          >
            {estado.texto}
          </Text>
        )}
      </View>

      {/* GUARDAR fijo abajo, al alcance del pulgar, con el avance de la lista. */}
      <View style={s.footer}>
        <TouchableOpacity
          style={[s.guardarFooter, guardarBloqueado && s.guardarBtnGuardando]}
          onPress={onGuardar}
          disabled={guardarBloqueado}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Guardar asistencia, ${marcados} de ${jugadores.length} marcados`}
          accessibilityState={{ disabled: guardarBloqueado, busy: guardando }}
        >
          {guardando
            ? <ActivityIndicator color={colors.sobreOro} size="small" />
            : <Text style={s.guardarFooterTexto}>GUARDAR · {marcados}/{jugadores.length}</Text>
          }
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const FONDO   = colors.fondo
const DIVIDER = colors.borde

const s = StyleSheet.create({
  root:     { flex: 1, backgroundColor: FONDO },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: FONDO, gap: 8 },
  mutedTexto: {
    fontFamily: fonts.titulo,
    fontSize: 18,
    color: '#9A9080',
    textAlign: 'center',
  },

  // Header
  header:    { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14 },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  headerLeft: { flex: 1 },
  seccion: {
    fontFamily: fonts.label,
    fontSize: 12,
    letterSpacing: 3,
    color: colors.oro,
    marginBottom: 6,
  },
  titulo: {
    fontFamily: fonts.titulo,
    fontSize: 28,
    color: colors.texto,
    lineHeight: 34,
  },
  headerMeta: {
    fontFamily: fonts.label,
    fontSize: 13,
    letterSpacing: 1.5,
    color: colors.muted,
  },

  // GUARDAR fijo abajo
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: DIVIDER,
    backgroundColor: FONDO,
  },
  guardarFooter: {
    backgroundColor: colors.oro,
    minHeight: 52,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  guardarBtnGuardando: { opacity: 0.55 },
  guardarFooterTexto: {
    fontFamily: fonts.label,
    fontSize: 15,
    letterSpacing: 2,
    color: colors.sobreOro,
  },

  // TODOS PRESENTES
  todosBtn: {
    marginHorizontal: 20,
    marginBottom: 8,
    minHeight: 44,
    borderWidth: 1.5,
    borderColor: colors.confirmacion,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  todosBtnInactivo: { opacity: 0.45 },
  todosTexto: {
    fontFamily: fonts.label,
    fontSize: 14,
    letterSpacing: 2,
    color: colors.confirmacion,
  },

  divider: { height: 1, backgroundColor: DIVIDER, marginHorizontal: 20 },
  loadingInline: { marginTop: 60 },

  // Selector de división
  divisionChips:      { paddingHorizontal: 20, paddingBottom: 12, gap: 8 },
  divisionChip: {
    minHeight: 44, justifyContent: 'center',
    borderWidth: 1, borderColor: DIVIDER, borderRadius: 3,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  divisionChipActivo: { backgroundColor: colors.oro, borderColor: colors.oro },
  divisionChipTexto: {
    fontFamily: fonts.label, fontSize: 13, letterSpacing: 1.5, color: '#A89E8C',
  },
  divisionChipTextoActivo: { color: colors.sobreOro, fontWeight: '700' },

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
    fontSize: 11,
    letterSpacing: 2,
    color: '#8A8070',
    marginTop: 2,
  },

  // Player rows
  lista: { flex: 1 },
  notaGuardada: { paddingHorizontal: 20, paddingTop: 12 },
  listContent: { paddingBottom: 8 },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  numero: {
    fontFamily: fonts.label,
    fontSize: 13,
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
    fontSize: 17,
    color: colors.texto,
  },
  alertaInline: {
    fontFamily: fonts.label,
    fontSize: 12,
    letterSpacing: 1.5,
    color: colors.rojoTexto,
    marginTop: 3,
  },
  separator: {
    height: 1,
    backgroundColor: DIVIDER,
    marginHorizontal: 20,
  },

  // Badges
  // Segmentos de 44 pt con 8 pt entre sí (antes ~24 pt a 5 pt: con guantes se
  // marcaba el estado equivocado).
  badgesRow: { flexDirection: 'row', gap: 8 },
  badge: {
    minWidth: 48,
    minHeight: 44,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1.5,
  },
  badgeInactivo: { borderColor: '#C5BEA8', backgroundColor: 'transparent' },
  badgeTexto: {
    fontFamily: fonts.label,
    fontSize: 14,
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
    fontSize: 13,
    letterSpacing: 1,
    color: colors.confirmacion,
  },
  statusPendiente: {
    fontFamily: fonts.label,
    fontSize: 13,
    letterSpacing: 1,
    color: colors.oroHondo,
  },
  statusError: {
    fontFamily: fonts.label,
    fontSize: 13,
    letterSpacing: 1,
    color: colors.rojoTexto,
  },
})
