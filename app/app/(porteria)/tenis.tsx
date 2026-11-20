import { useState } from 'react'
import { View, Text, TextInput, ScrollView, ActivityIndicator, RefreshControl, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ErrorCarga } from '@/components/shared/ErrorCarga'
import { GrillaCanchas } from '@/components/tenis/GrillaCanchas'
import { DetalleItem } from '@/components/tenis/DetalleItem'
import { Aviso, Boton, Leyenda, Titulo, estilosTenis } from '@/components/tenis/ui'
import { accionesTenis, checkinTenis, useTenisGrilla, type Checkin } from '@/hooks/useTenisGestor'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'
import { FEATURES } from '@/constants/features'
import { colors, fonts } from '@/constants/theme'
import { normalizarDni } from '@/lib/entradaDni'
import {
  CONFIG_DEFECTO, RESULTADO_CHECKIN, fechaArgentina, horaArgentina, inicioReal, montoCargo, resultadoCheckin,
  type ItemGrilla,
} from '@/lib/tenis'

// Pestaña "Tenis" del Canchero (FEATURES.tenis): consulta por DNI si la
// persona tiene reserva ahora (de 15 min antes al final del turno), si pagó y
// si está suspendida; al dar ok queda registrado el ingreso. Debajo, la grilla
// de hoy: tocar una reserva permite marcar cobros, corregir jugadores o
// registrar una extensión.

// Colores del resultado (mismos que el escáner): blanco/#1A7A1A 5.46 ·
// #15110A/#E67E22 6.60 · blanco/#CC4127 4.82.
const NIVEL = {
  ok:    { bg: colors.exito,           fg: colors.blanco },
  aviso: { bg: colors.estadoPendiente, fg: colors.sobreOro },
  error: { bg: colors.rojoUrgente,     fg: colors.blanco },
} as const

function TarjetaCheckin({ c, onCobrado }: { c: Checkin; onCobrado: () => void }) {
  const res = resultadoCheckin(c.resultado)
  const ui = RESULTADO_CHECKIN[res]
  const color = NIVEL[ui.nivel]
  const [cobrando, setCobrando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cobrado, setCobrado] = useState(c.jugador?.cobrado ?? false)

  async function cobrar() {
    if (!c.jugador?.id) return
    setCobrando(true)
    const r = await accionesTenis.cobroMarcar(c.jugador.id, true)
    setCobrando(false)
    if (!r.ok) { setError(r.mensaje); return }
    setCobrado(true)
    onCobrado()
  }

  return (
    <View style={s.tarjeta} accessibilityLiveRegion="polite">
      <View style={[s.banda, { backgroundColor: color.bg }]} accessibilityRole="alert">
        <Text style={[s.bandaTexto, { color: color.fg }]}>{ui.titulo}</Text>
      </View>
      <View style={s.tarjetaCuerpo}>
        {c.persona && (
          <>
            <Text style={s.nombre}>{c.persona.nombre}</Text>
            <Text style={estilosTenis.mutedCard}>
              {c.persona.tipo === 'invitado' ? 'Invitado (no socio)' : 'Socio'}
              {c.persona.semaforo ? ` · Cuota: ${c.persona.semaforo}` : ''}
            </Text>
          </>
        )}
        {c.suspendido && <Text style={s.alerta}>Está suspendido: no puede jugar.</Text>}
        {c.reserva && (
          <Text style={estilosTenis.textoCard}>
            Cancha {c.reserva.cancha} · {inicioReal(c.reserva.inicio)} a {horaArgentina(c.reserva.fin)} · {c.reserva.modalidad === 'dobles' ? 'Dobles' : 'Singles'}
          </Text>
        )}
        {c.jugador && (
          <Text style={estilosTenis.textoCard}>
            {c.jugador.cargo === 0 ? 'Sin cargo' : `Cobrar ${montoCargo(c.jugador.cargo)}`}
            {c.jugador.cargo > 0 ? (cobrado ? ' · COBRADO' : ' · PENDIENTE') : ''}
          </Text>
        )}
        {res === 'comprobante_pendiente' && (
          <Aviso>El comprobante de pago todavía no fue revisado. Revisalo o cobrale en el momento.</Aviso>
        )}
        {c.jugador && c.jugador.cargo > 0 && !cobrado && !!c.jugador.id && (
          <Boton texto="MARCAR COBRADO" onPress={cobrar} cargando={cobrando} />
        )}
        {error && <Aviso tipo="error">{error}</Aviso>}
      </View>
    </View>
  )
}

export default function TenisCancheroScreen() {
  const [hoy] = useState(() => fechaArgentina(Date.now()))
  const [ahoraMs, setAhoraMs] = useState(() => Date.now())
  const { grilla, loading, error, refetch } = useTenisGrilla(hoy)
  useRefreshOnFocus(refetch)
  const [dni, setDni] = useState('')
  const [consultando, setConsultando] = useState(false)
  const [checkin, setCheckin] = useState<Checkin | null>(null)
  const [errorCheckin, setErrorCheckin] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<ItemGrilla | null>(null)

  async function consultar() {
    const d = normalizarDni(dni)
    if (d.length < 6) { setErrorCheckin('Revisá el DNI.'); return }
    setConsultando(true)
    setErrorCheckin(null)
    setCheckin(null)
    const r = await checkinTenis(d)
    setConsultando(false)
    if (!r.ok) { setErrorCheckin(r.mensaje); return }
    setCheckin(r.data)
    setDni('')
    refetch()
  }

  function recargar() {
    setAhoraMs(Date.now())
    refetch()
  }

  if (!FEATURES.tenis) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <Text style={estilosTenis.vacio}>Las reservas de tenis todavía no están habilitadas.</Text>
      </SafeAreaView>
    )
  }

  const config = grilla?.config ?? CONFIG_DEFECTO

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <Text style={s.labelHeader}>CANCHERO · TENIS</Text>
        <Text style={s.titulo}>Ingreso a canchas</Text>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={s.contenido}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={false} onRefresh={recargar} tintColor={colors.oro} />}
        >
          <Text style={estilosTenis.label}>DNI DEL JUGADOR</Text>
          <View style={s.filaDni}>
            <TextInput
              style={[estilosTenis.input, s.inputDni]}
              value={dni}
              onChangeText={t => setDni(normalizarDni(t))}
              keyboardType="number-pad"
              placeholder="Sin puntos"
              placeholderTextColor={colors.muted}
              accessibilityLabel="DNI del jugador"
              onSubmitEditing={consultar}
            />
          </View>
          <Boton texto="CONSULTAR" onPress={consultar} cargando={consultando} disabled={dni.length < 6} />
          {errorCheckin && <Aviso tipo="error">{errorCheckin}</Aviso>}
          {checkin && <TarjetaCheckin key={JSON.stringify(checkin)} c={checkin} onCobrado={refetch} />}

          <Titulo>HOY</Titulo>
          {loading && !grilla ? (
            <ActivityIndicator color={colors.oro} style={s.cargando} />
          ) : error && !grilla ? (
            <ErrorCarga mensaje={error} onReintentar={recargar} />
          ) : grilla ? (
            <>
              <Leyenda />
              <GrillaCanchas
                fecha={hoy}
                config={config}
                canchas={grilla.canchas}
                items={grilla.items}
                ahoraMs={ahoraMs}
                conDetalle
                onPressItem={setDetalle}
              />
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {detalle && grilla && (
        <DetalleItem
          item={detalle}
          canchaNombre={detalle.cancha_id ? grilla.canchas.find(c => c.id === detalle.cancha_id)?.nombre ?? '' : 'TODAS'}
          config={config}
          esGestor={false}
          onCerrar={() => setDetalle(null)}
          onCambio={refetch}
        />
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: colors.fondo },
  header:        { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.borde },
  labelHeader:   { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: colors.oro, marginBottom: 4 },
  titulo:        { fontFamily: fonts.titulo, fontSize: 28, color: colors.texto },
  contenido:     { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 60 },
  filaDni:       { flexDirection: 'row' },
  inputDni:      { flex: 1, fontSize: 22, fontFamily: fonts.mono },
  cargando:      { marginVertical: 24 },
  tarjeta:       { marginTop: 16, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: colors.borde, backgroundColor: colors.card },
  banda:         { paddingVertical: 14, paddingHorizontal: 16 },
  bandaTexto:    { fontFamily: fonts.label, fontSize: 18, letterSpacing: 1.5 },
  tarjetaCuerpo: { padding: 16, gap: 4 },
  nombre:        { fontFamily: fonts.titulo, fontSize: 22, color: colors.texto },
  alerta:        { fontFamily: fonts.label, fontSize: 15, color: colors.rojoTexto },
})
