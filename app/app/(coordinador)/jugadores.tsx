import { useEffect, useState } from 'react'
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
import {
  useJugadoresDivision,
  type DivisionCoordinador,
  type JugadorDivision,
} from '@/hooks/useJugadoresDivision'
import { useMoverJugador } from '@/hooks/useMoverJugador'
import { ModalMoverJugador, etiquetaDivision } from '@/components/coordinador/ModalMoverJugador'
import { colors, fonts } from '@/constants/theme'

// ─── Tokens ───────────────────────────────────────────────────────────────────

const FONDO   = '#15110A'
const TEXTO   = '#F3EFE4'
const MUTED   = '#8E8574'
const DIVIDER = '#2C2418'
const ROJO    = colors.rojoUrgente
const VERDE   = '#22C55E'

// ─── FilaJugador ─────────────────────────────────────────────────────────────

function FilaJugador({ jugador, onMover }: { jugador: JugadorDivision; onMover: (j: JugadorDivision) => void }) {
  const edadTexto = jugador.edad !== null ? `${jugador.edad} años` : 'Sin fecha de nacimiento'

  return (
    <View style={s.fila}>
      <View style={s.filaInfo}>
        <Text style={s.nombre} numberOfLines={1}>{jugador.nombre_completo}</Text>
        <View style={s.metaRow}>
          <Text style={s.meta}>{edadTexto}</Text>
          {jugador.fueraDeRango && (
            <View
              style={s.fueraRango}
              accessibilityLabel="Edad fuera del rango de la división"
            >
              <Text style={s.fueraRangoTexto}>FUERA DE RANGO</Text>
            </View>
          )}
        </View>
      </View>
      <TouchableOpacity
        style={s.moverBtn}
        onPress={() => onMover(jugador)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`Mover a ${jugador.nombre_completo} a otra división`}
      >
        <Text style={s.moverBtnTexto}>Mover a…</Text>
      </TouchableOpacity>
    </View>
  )
}

// ─── SelectorDivision ────────────────────────────────────────────────────────

interface SelectorProps {
  divisiones: DivisionCoordinador[]
  seleccionada: string | null
  onSeleccionar: (id: string) => void
}

function SelectorDivision({ divisiones, seleccionada, onSeleccionar }: SelectorProps) {
  if (divisiones.length <= 1) return null
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={s.selectorScroll}
      contentContainerStyle={s.selectorContent}
    >
      {divisiones.map(d => {
        const activa = d.id === seleccionada
        return (
          <TouchableOpacity
            key={d.id}
            style={[s.pill, activa && s.pillActiva]}
            onPress={() => onSeleccionar(d.id)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected: activa }}
            accessibilityLabel={`Ver jugadores de ${etiquetaDivision(d)}`}
          >
            <Text style={[s.pillTexto, activa && s.pillTextoActivo]}>{etiquetaDivision(d)}</Text>
          </TouchableOpacity>
        )
      })}
    </ScrollView>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function JugadoresCoordinadorScreen() {
  const {
    divisiones, divisionSeleccionada, jugadores,
    loading, loadingJugadores, error, sinDivisiones,
    seleccionarDivision, recargar,
  } = useJugadoresDivision()
  const { mover, moviendo, error: errorMover, limpiarError } = useMoverJugador()

  const [jugadorAMover, setJugadorAMover] = useState<JugadorDivision | null>(null)
  const [exito, setExito] = useState<string | null>(null)

  useEffect(() => {
    if (!exito) return
    const t = setTimeout(() => setExito(null), 4000)
    return () => clearTimeout(t)
  }, [exito])

  const destinos = divisionSeleccionada
    ? divisiones.filter(d => d.id !== divisionSeleccionada.id && d.deporte === divisionSeleccionada.deporte)
    : []

  function abrirMover(j: JugadorDivision) {
    limpiarError()
    setExito(null)
    setJugadorAMover(j)
  }

  async function confirmarMover(destino: DivisionCoordinador) {
    if (!jugadorAMover) return
    const ok = await mover(jugadorAMover.id, destino.id)
    if (!ok) return
    setExito(`${jugadorAMover.nombre_completo} pasó a ${etiquetaDivision(destino)}.`)
    setJugadorAMover(null)
    recargar()
  }

  if (loading) {
    return (
      <SafeAreaView style={s.centrado}>
        <ActivityIndicator color={colors.oro} size="large" />
      </SafeAreaView>
    )
  }

  if (sinDivisiones) {
    return (
      <SafeAreaView style={s.centrado}>
        <Text style={s.mutedTexto}>Sin divisiones asignadas.</Text>
        <Text style={s.mutedTexto}>Contactá a la Subcomisión.</Text>
      </SafeAreaView>
    )
  }

  const rango = divisionSeleccionada && (divisionSeleccionada.edad_min !== null || divisionSeleccionada.edad_max !== null)
    ? ` · ${divisionSeleccionada.edad_min ?? '—'} a ${divisionSeleccionada.edad_max ?? '—'} años`
    : ''

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.labelHeader}>COORDINADOR</Text>
        <Text style={s.titulo}>Jugadores</Text>
        {divisionSeleccionada ? (
          <Text style={s.subtitulo}>{etiquetaDivision(divisionSeleccionada)}{rango}</Text>
        ) : null}
      </View>

      <SelectorDivision
        divisiones={divisiones}
        seleccionada={divisionSeleccionada?.id ?? null}
        onSeleccionar={seleccionarDivision}
      />

      <View style={s.divider} />

      {exito && (
        <View style={s.exitoBanner} accessibilityRole="alert">
          <Text style={s.exitoTexto}>{exito}</Text>
        </View>
      )}

      {error && (
        <View style={s.errorBanner} accessibilityRole="alert">
          <Text style={s.errorTexto}>{error}</Text>
          <TouchableOpacity onPress={recargar} accessibilityRole="button" accessibilityLabel="Reintentar">
            <Text style={s.reintentar}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      )}

      {loadingJugadores && jugadores.length === 0 ? (
        <View style={s.centrado}>
          <ActivityIndicator color={colors.oro} size="large" />
        </View>
      ) : (
        <FlatList
          data={jugadores}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <FilaJugador jugador={item} onMover={abrirMover} />}
          ItemSeparatorComponent={() => <View style={s.divider} />}
          ListHeaderComponent={
            jugadores.length > 0
              ? <Text style={s.contador}>{jugadores.length} jugador{jugadores.length !== 1 ? 'es' : ''} activo{jugadores.length !== 1 ? 's' : ''}</Text>
              : null
          }
          contentContainerStyle={jugadores.length === 0 ? s.listaVacia : s.listaContent}
          ListEmptyComponent={
            error ? null : (
              <View style={s.emptyWrap}>
                <Text style={s.mutedTexto}>Sin jugadores activos en esta división.</Text>
              </View>
            )
          }
          onRefresh={recargar}
          refreshing={loadingJugadores}
        />
      )}

      <ModalMoverJugador
        jugador={jugadorAMover}
        origen={divisionSeleccionada}
        destinos={destinos}
        moviendo={moviendo}
        error={errorMover}
        onClose={() => setJugadorAMover(null)}
        onConfirmar={confirmarMover}
      />
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: FONDO },
  centrado:   { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: FONDO, gap: 8 },
  mutedTexto: { fontFamily: fonts.cuerpo, color: MUTED, fontSize: 16, fontStyle: 'italic' },

  header:      { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14 },
  labelHeader: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2.5, color: colors.oro, marginBottom: 4 },
  titulo:      { fontFamily: fonts.titulo, fontSize: 32, color: TEXTO },
  subtitulo:   { fontFamily: fonts.cuerpo, fontSize: 14, color: MUTED, marginTop: 4, letterSpacing: 0.3 },

  selectorScroll:  { flexGrow: 0, marginBottom: 12 },
  selectorContent: { paddingHorizontal: 20, gap: 8, flexDirection: 'row', alignItems: 'center' },
  pill:            { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: DIVIDER },
  pillActiva:      { backgroundColor: TEXTO, borderColor: TEXTO },
  pillTexto:       { fontFamily: fonts.cuerpo, fontSize: 15, color: MUTED },
  pillTextoActivo: { color: colors.oro },

  divider: { height: 1, backgroundColor: DIVIDER, marginHorizontal: 20 },

  contador: { fontFamily: fonts.label, fontSize: 14, color: TEXTO, fontWeight: '600', letterSpacing: 0.5, paddingHorizontal: 20, paddingVertical: 10 },

  fila:            { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 13, gap: 12 },
  filaInfo:        { flex: 1 },
  nombre:          { fontFamily: fonts.cuerpo, fontSize: 17, color: TEXTO },
  metaRow:         { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  meta:            { fontFamily: fonts.label, fontSize: 13, color: MUTED },
  fueraRango:      { borderWidth: 1, borderColor: colors.oroHondo, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1 },
  fueraRangoTexto: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 0.8, color: colors.oroHondo },
  moverBtn:        { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 4, borderWidth: 1.5, borderColor: DIVIDER },
  moverBtnTexto:   { fontFamily: fonts.label, fontSize: 14, color: colors.oro, letterSpacing: 0.5 },

  exitoBanner: { marginHorizontal: 20, marginTop: 10, backgroundColor: '#0F2A18', borderLeftWidth: 3, borderLeftColor: VERDE, borderRadius: 4, padding: 12 },
  exitoTexto:  { fontFamily: fonts.cuerpo, fontSize: 15, color: '#A7F3C0' },
  errorBanner: { marginHorizontal: 20, marginTop: 10, backgroundColor: '#2A1010', borderLeftWidth: 3, borderLeftColor: ROJO, borderRadius: 4, padding: 12, gap: 6 },
  errorTexto:  { fontFamily: fonts.cuerpo, fontSize: 15, color: '#FFAAAA' },
  reintentar:  { fontFamily: fonts.label, fontSize: 14, color: colors.oro, letterSpacing: 0.5 },

  listaVacia:   { flex: 1 },
  listaContent: { paddingBottom: 16 },
  emptyWrap:    { alignItems: 'center', paddingVertical: 48 },
})
