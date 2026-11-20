import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import { View, Text, ActivityIndicator, Alert, StyleSheet } from 'react-native'
import { colors, fonts } from '@/constants/theme'
import { useTenisSocio } from '@/hooks/useTenisSocio'
import { ErrorCarga } from '@/components/shared/ErrorCarga'
import {
  CONFIG_DEFECTO, ESTADOS_RESERVA, diasReservables, etiquetaDiaCorta, fechaArgentina, horaArgentina,
  inicioReal, puedeCancelar, montoCargo, type MiReserva,
} from '@/lib/tenis'
import { formatMonto } from '@/lib/formatoMonto'
import { GrillaCanchas } from './GrillaCanchas'
import { FormReserva } from './FormReserva'
import { Boton, Leyenda, SelectorDia, Titulo, estilosTenis } from './ui'

// Sección "Tenis" de la Agenda del socio (FEATURES.tenis): día (hoy + 2), la
// grilla por cancha, el formulario de reserva y "Mis reservas" con cancelar
// (hasta 3 h antes). Las reglas (límites, precios, suspensión) las aplica el
// servidor; acá se muestran sus mensajes.

export interface TenisSocioRef {
  refetch: () => void
}

export const TenisSocio = forwardRef<TenisSocioRef>(function TenisSocio(_props, ref) {
  const [ahoraMs, setAhoraMs] = useState(() => Date.now())
  const [fecha, setFecha] = useState(() => fechaArgentina(Date.now()))
  const { disp, reservas, loading, error, refetch, reservar, cancelar } = useTenisSocio(fecha)
  const [form, setForm] = useState<{ cancha: string | null; hora: string | null } | null>(null)
  const [cancelando, setCancelando] = useState<string | null>(null)

  // La hora avanza sola: las celdas que pasan dejan de ofrecerse.
  useEffect(() => {
    const t = setInterval(() => setAhoraMs(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  useImperativeHandle(ref, () => ({ refetch: () => { setAhoraMs(Date.now()); refetch() } }), [refetch])

  const config = disp?.config ?? CONFIG_DEFECTO
  const dias = useMemo(() => diasReservables(ahoraMs, config.anticipacion_dias), [ahoraMs, config.anticipacion_dias])

  function pedirCancelacion(r: MiReserva) {
    Alert.alert(
      'Cancelar reserva',
      `¿Cancelás la cancha ${r.cancha} del ${etiquetaDiaCorta(fechaArgentina(r.inicio))} a las ${inicioReal(r.inicio, config.margen_inicio_min)}? Si ya pagaste, la devolución la hace la administración del club.`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Cancelá', style: 'destructive', onPress: async () => {
            setCancelando(r.id)
            const res = await cancelar(r.id, null)
            setCancelando(null)
            if (!res.ok) Alert.alert('No se pudo cancelar', res.mensaje)
          },
        },
      ],
    )
  }

  const activas = reservas.filter(r => ['pendiente_comprobante', 'confirmada'].includes(r.estado) && Date.parse(r.fin) > ahoraMs)

  return (
    <View style={s.root}>
      <Titulo>TENIS</Titulo>
      <Text style={s.subtitulo}>Tocá un horario libre para reservar. Hasta {config.anticipacion_dias} días antes.</Text>
      <SelectorDia dias={dias} fecha={fecha} onElegir={setFecha} />

      {loading && !disp ? (
        <ActivityIndicator color={colors.oro} style={s.cargando} />
      ) : error && !disp ? (
        <ErrorCarga mensaje={error} onReintentar={refetch} />
      ) : disp ? (
        <>
          <Leyenda />
          <GrillaCanchas
            fecha={fecha}
            config={config}
            canchas={disp.canchas}
            items={disp.items}
            ahoraMs={ahoraMs}
            onPressLibre={(cancha, hora) => setForm({ cancha, hora })}
          />
          <Boton texto="RESERVAR CANCHA" variante="secundario" onPress={() => setForm({ cancha: disp.canchas[0]?.id ?? null, hora: null })} />
        </>
      ) : null}

      <Text style={estilosTenis.label}>MIS RESERVAS</Text>
      {error && disp && <ErrorCarga mensaje={error} onReintentar={refetch} />}
      {activas.length === 0 && !loading && !error && <Text style={estilosTenis.vacio}>No tenés reservas de tenis.</Text>}
      {activas.map(r => {
        const sePuede = r.es_titular && puedeCancelar(r.inicio, ahoraMs, config.cancelacion_horas)
        return (
          <View key={r.id} style={[estilosTenis.card, s.reserva]}>
            <Text style={s.reservaTitulo}>
              {etiquetaDiaCorta(fechaArgentina(r.inicio))} · {inicioReal(r.inicio, config.margen_inicio_min)} a {horaArgentina(r.fin)}
            </Text>
            <Text style={estilosTenis.textoCard}>Cancha {r.cancha} · {r.modalidad === 'dobles' ? 'Dobles' : 'Singles'}</Text>
            <Text style={estilosTenis.mutedCard}>{ESTADOS_RESERVA[r.estado] ?? r.estado}</Text>
            {r.jugadores.map((j, i) => (
              <Text key={i} style={estilosTenis.mutedCard}>{j.nombre} · {montoCargo(j.cargo)}</Text>
            ))}
            {r.total !== null && <Text style={estilosTenis.textoCard}>Total {formatMonto(r.total)}</Text>}
            {r.es_titular && (
              sePuede ? (
                <Boton texto="CANCELAR RESERVA" variante="secundario" cargando={cancelando === r.id} onPress={() => pedirCancelacion(r)} />
              ) : (
                <Text style={estilosTenis.mutedCard}>Ya no se puede cancelar: faltan menos de {config.cancelacion_horas} horas.</Text>
              )
            )}
          </View>
        )
      })}

      {disp && form && (
        <FormReserva
          visible
          onCerrar={() => setForm(null)}
          fecha={fecha}
          canchas={disp.canchas}
          config={config}
          items={disp.items}
          ahoraMs={ahoraMs}
          canchaInicial={form.cancha}
          horaInicial={form.hora}
          onConfirmar={d => reservar(d)}
        />
      )}
    </View>
  )
})

const s = StyleSheet.create({
  root:          { marginTop: 8 },
  subtitulo:     { fontFamily: fonts.cuerpo, fontSize: 14, color: colors.textoSecundario },
  cargando:      { marginVertical: 24 },
  reserva:       { marginBottom: 10 },
  reservaTitulo: { fontFamily: fonts.label, fontSize: 15, letterSpacing: 1, color: colors.oro },
})
