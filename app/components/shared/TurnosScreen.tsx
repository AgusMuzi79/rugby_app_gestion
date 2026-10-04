import { useState } from 'react'
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, Alert,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Header } from '@/components/shared/Header'
import {
  useTurnos, type DiaTurnos, type FranjaTurno, type TurnoFijo, type ResultadoAccion,
} from '@/hooks/useTurnos'
import { colors, fonts } from '@/constants/theme'

// Pantalla de turnos del gimnasio. La comparten (socio) y (cliente-gimnasio).

const DIAS_LARGO = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

function fechaCorta(fecha: string): string {
  const [, mm, dd] = fecha.split('-')
  return `${dd}/${mm}`
}

function etiquetaDia(dia: DiaTurnos): string {
  return `${DIAS_LARGO[dia.dia_semana] ?? ''} ${fechaCorta(dia.fecha)}`.toUpperCase()
}

function lugares(n: number): string {
  return n === 1 ? 'Queda 1 lugar' : `Quedan ${n} lugares`
}

// ─── Fila de franja ───────────────────────────────────────────────────────────

function FranjaRow({
  franja, fecha, esFijo, ocupado, onReservar, onCancelar, onHacerFijo,
}: {
  franja:      FranjaTurno
  fecha:       string
  esFijo:      boolean
  ocupado:     boolean
  onReservar:  (f: FranjaTurno, fecha: string) => void
  onCancelar:  (f: FranjaTurno, fecha: string) => void
  onHacerFijo: (f: FranjaTurno) => void
}) {
  const horario = `${franja.hora_desde} – ${franja.hora_hasta}`

  // Estado visible, en orden de precedencia.
  let estado: string
  let estilo = s.estadoNeutro
  if (franja.reservada) { estado = 'Reservado'; estilo = s.estadoOk }
  else if (franja.cerrado) estado = 'Cerrado'
  else if (franja.pasada) estado = 'Pasó el horario'
  else if (franja.disponibles === 0) estado = 'Completo'
  else { estado = 'Reservá'; estilo = s.estadoLibre }

  const puedeCancelar = franja.reservada && !franja.pasada && franja.reserva_id !== null
  const puedeReservar = !franja.reservada && !franja.cerrado && !franja.pasada && franja.disponibles > 0
  const puedeFijo     = !esFijo && !franja.cerrado

  return (
    <View style={s.franja}>
      <TouchableOpacity
        style={s.franjaMain}
        activeOpacity={0.75}
        disabled={ocupado || !(puedeCancelar || puedeReservar)}
        onPress={() => (puedeCancelar ? onCancelar(franja, fecha) : onReservar(franja, fecha))}
      >
        <View style={{ flex: 1 }}>
          <Text style={s.horario}>{horario}</Text>
          {!franja.cerrado && (
            <Text style={s.lugares}>{lugares(franja.disponibles)}</Text>
          )}
          {esFijo && <Text style={s.fijoTag}>TURNO FIJO</Text>}
        </View>
        <Text style={[s.estado, estilo]}>{estado.toUpperCase()}</Text>
      </TouchableOpacity>

      {puedeFijo && (
        <TouchableOpacity disabled={ocupado} onPress={() => onHacerFijo(franja)} activeOpacity={0.75}>
          <Text style={s.linkFijo}>HACER TURNO FIJO</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function TurnosScreen() {
  const insets = useSafeAreaInsets()
  const {
    dias, semanas, limiteSemanal, fijos, loading, error,
    refetch, reservar, cancelar, crearFijo, cancelarFijo,
  } = useTurnos()
  const [ocupado, setOcupado] = useState(false)

  // Corre una acción; el motivo de un rechazo se muestra en un Alert.
  async function correr(accion: () => Promise<ResultadoAccion>) {
    setOcupado(true)
    const r = await accion()
    setOcupado(false)
    if (!r.ok) Alert.alert('No se pudo completar', r.motivo ?? 'Probá de nuevo.')
  }

  const fijoIds = new Set(fijos.map(f => f.franja_id))

  function onReservar(f: FranjaTurno, fecha: string) {
    correr(() => reservar(f.franja_id, fecha))
  }

  function onCancelar(f: FranjaTurno, fecha: string) {
    Alert.alert(
      'Cancelar reserva',
      `¿Cancelás tu turno del ${fechaCorta(fecha)} de ${f.hora_desde} a ${f.hora_hasta}?`,
      [
        { text: 'No', style: 'cancel' },
        { text: 'Cancelá', style: 'destructive', onPress: () => correr(() => cancelar(f.reserva_id as string)) },
      ],
    )
  }

  function onHacerFijo(f: FranjaTurno) {
    Alert.alert(
      'Turno fijo',
      `Se te reservará este horario (${f.hora_desde} a ${f.hora_hasta}) todas las semanas. Si faltás varias veces seguidas, se libera. ¿Confirmás?`,
      [
        { text: 'No', style: 'cancel' },
        { text: 'Confirmar', onPress: () => correr(() => crearFijo(f.franja_id)) },
      ],
    )
  }

  function onCancelarFijo(t: TurnoFijo) {
    Alert.alert(
      'Cancelar turno fijo',
      'Se cancela el turno fijo y también las reservas futuras que tenga. ¿Confirmás?',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Cancelá', style: 'destructive', onPress: () => correr(() => cancelarFijo(t.turno_fijo_id)) },
      ],
    )
  }

  const usados = semanas[0]?.dias_usados ?? 0
  const diasConFranjas = dias.filter(d => d.franjas.length > 0)

  const encabezado = (
    <View style={s.encabezado}>
      <View style={s.banner}>
        <Text style={s.bannerText}>
          {limiteSemanal === null
            ? `Esta semana usaste ${usados} ${usados === 1 ? 'día' : 'días'}`
            : `Usaste ${usados} de ${limiteSemanal} días esta semana`}
        </Text>
      </View>

      <Text style={s.seccion}>MIS TURNOS FIJOS</Text>
      {fijos.length === 0 ? (
        <Text style={s.vacio}>No tenés turnos fijos.</Text>
      ) : (
        fijos.map(t => (
          <View key={t.turno_fijo_id} style={s.fijoCard}>
            <View style={{ flex: 1 }}>
              <Text style={s.horario}>
                {DIAS_LARGO[t.dia_semana ?? 0] ?? ''} {t.hora_desde} – {t.hora_hasta}
              </Text>
              {t.faltas_consecutivas > 0 && (
                <Text style={s.fijoAviso}>
                  {t.faltas_consecutivas === 1
                    ? 'Faltaste 1 vez seguida'
                    : `Faltaste ${t.faltas_consecutivas} veces seguidas`}
                </Text>
              )}
            </View>
            <TouchableOpacity disabled={ocupado} onPress={() => onCancelarFijo(t)} activeOpacity={0.75}>
              <Text style={s.linkCancelar}>CANCELAR</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      <Text style={s.seccion}>RESERVAR TURNO</Text>
    </View>
  )

  return (
    <View style={s.root}>
      <View style={{ paddingTop: insets.top }}>
        <Header />
      </View>

      {loading && dias.length === 0 && !error ? (
        <ActivityIndicator color={colors.oro} style={{ marginTop: 40 }} />
      ) : error ? (
        <View style={s.centro}>
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity style={s.reintentar} onPress={refetch} activeOpacity={0.75}>
            <Text style={s.reintentarText}>REINTENTAR</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={diasConFranjas}
          keyExtractor={d => d.fecha}
          contentContainerStyle={s.listContent}
          ListHeaderComponent={encabezado}
          ListEmptyComponent={<Text style={s.vacio}>Todavía no hay turnos cargados</Text>}
          renderItem={({ item }) => (
            <View style={s.dia}>
              <Text style={s.diaTitulo}>{etiquetaDia(item)}</Text>
              {item.franjas.map(f => (
                <FranjaRow
                  key={f.franja_id}
                  franja={f}
                  fecha={item.fecha}
                  esFijo={fijoIds.has(f.franja_id)}
                  ocupado={ocupado}
                  onReservar={onReservar}
                  onCancelar={onCancelar}
                  onHacerFijo={onHacerFijo}
                />
              ))}
            </View>
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
  root:        { flex: 1, backgroundColor: '#15110A' },
  listContent: { paddingHorizontal: 20, paddingBottom: 60 },
  encabezado:  { gap: 10, paddingTop: 16 },
  centro:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },

  banner: {
    borderWidth: 1, borderColor: colors.oro, borderRadius: 4,
    paddingVertical: 14, paddingHorizontal: 16, backgroundColor: colors.tinta,
  },
  bannerText: {
    fontFamily: fonts.label, fontSize: 15, letterSpacing: 1, color: '#15110A', textAlign: 'center',
  },

  seccion: {
    fontFamily: fonts.label, fontSize: 12, letterSpacing: 2.5,
    color: colors.oroHondo, marginTop: 14,
  },
  vacio: { fontFamily: fonts.cuerpo, fontSize: 15, fontStyle: 'italic', color: '#8E8574', paddingVertical: 8 },

  fijoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderRadius: 4, padding: 14,
    backgroundColor: '#1C1710', borderColor: '#2C2418',
  },
  fijoAviso: { fontFamily: fonts.cuerpo, fontSize: 13, color: colors.rojoUrgente, marginTop: 2 },

  dia:       { marginTop: 14, gap: 8 },
  diaTitulo: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: colors.oro },

  franja: {
    borderWidth: 1, borderRadius: 4, padding: 14, gap: 10,
    backgroundColor: '#1C1710', borderColor: '#2C2418',
  },
  franjaMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  horario:    { fontFamily: fonts.titulo, fontSize: 18, color: '#F3EFE4' },
  lugares:    { fontFamily: fonts.cuerpo, fontSize: 14, color: '#8E8574', marginTop: 2 },
  fijoTag:    { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.5, color: colors.oroHondo, marginTop: 4 },

  estado:       { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1.5 },
  estadoLibre:  { color: colors.oro },
  estadoOk:     { color: '#2ECC71' },
  estadoNeutro: { color: '#8E8574' },

  linkFijo:     { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1.5, color: colors.oroHondo },
  linkCancelar: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1.5, color: colors.rojoUrgente },

  errorText:      { fontFamily: fonts.cuerpo, fontSize: 16, color: '#F3EFE4', textAlign: 'center' },
  reintentar:     { borderWidth: 1, borderColor: colors.oro, borderRadius: 4, paddingVertical: 12, paddingHorizontal: 24 },
  reintentarText: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: colors.oro },
})
