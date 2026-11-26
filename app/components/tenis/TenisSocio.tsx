import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { View, Text, ActivityIndicator, Alert, StyleSheet } from 'react-native'
import { colors, fonts } from '@/constants/theme'
import { useTenisSocio } from '@/hooks/useTenisSocio'
import { ErrorCarga } from '@/components/shared/ErrorCarga'
import {
  CONFIG_DEFECTO, ESTADOS_RESERVA, diasReservables, etiquetaDiaCorta, fechaArgentina, horaArgentina,
  inicioReal, jugadoresParaEditar, puedeCancelar, puedeEditar, montoCargo, type Disponibilidad, type MiReserva,
} from '@/lib/tenis'
import { formatMonto } from '@/lib/formatoMonto'
import { GrillaCanchas } from './GrillaCanchas'
import { FormReserva, type EdicionReserva } from './FormReserva'
import { Boton, Titulo, estilosTenis } from './ui'
import { NavegadorDia, SelectorVista, type VistaTenis } from './NavegadorDia'
import { DisponibilidadSemana } from './DisponibilidadSemana'
import { diasVista, esDiaReservable, reservasPorCancha } from '@/lib/tenisGrilla'
import { NovedadesTenis } from './NovedadesTenis'

// Sección "Tenis" de la Agenda del socio (FEATURES.tenis): la grilla del día
// (se ven `dias_vista` días y se reserva hasta `anticipacion_dias`), la vista
// semanal de disponibilidad, el formulario de reserva y "Mis reservas" con editar y
// cancelar (titular, hasta 3 h antes). Las reglas (límites, precios, suspensión) las aplica el
// servidor; acá se muestran sus mensajes.

export interface TenisSocioRef {
  refetch: () => void
}

// editarInicial: id de una reserva a editar apenas carga (botón EDITAR de la
// Agenda). onCambio: avisa que se reservó, editó o canceló (la Agenda recarga).
export const TenisSocio = forwardRef<TenisSocioRef, { editarInicial?: string | null; onCambio?: () => void }>(function TenisSocio(
  { editarInicial = null, onCambio }, ref,
) {
  const [ahoraMs, setAhoraMs] = useState(() => Date.now())
  const [fecha, setFecha] = useState(() => fechaArgentina(Date.now()))
  const { disp, reservas, loading, error, refetch, reservar, editar, cancelar } = useTenisSocio(fecha)
  const [form, setForm] = useState<{ cancha: string | null; hora: string | null; edicion?: EdicionReserva } | null>(null)
  // Al cambiar de día con el formulario abierto (edición) la disponibilidad
  // vuelve a null mientras carga: el formulario sigue con las últimas canchas.
  const ultimaDisp = useRef<Disponibilidad | null>(null)
  if (disp) ultimaDisp.current = disp
  const base = disp ?? ultimaDisp.current
  const editarAtendido = useRef<string | null>(null)
  const [cancelando, setCancelando] = useState<string | null>(null)

  // La hora avanza sola: las celdas que pasan dejan de ofrecerse.
  useEffect(() => {
    const t = setInterval(() => setAhoraMs(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  useImperativeHandle(ref, () => ({ refetch: () => { setAhoraMs(Date.now()); refetch() } }), [refetch])

  const config = base?.config ?? CONFIG_DEFECTO
  const dias = useMemo(() => diasReservables(ahoraMs, config.anticipacion_dias), [ahoraMs, config.anticipacion_dias])
  // Grilla: se miran más días de los que se reservan (los demás, sólo ver).
  const [vista, setVista] = useState<VistaTenis>('dia')
  const diasVer = useMemo(() => diasVista(ahoraMs, config.dias_vista), [ahoraMs, config.dias_vista])
  const reservable = (disp?.reservable ?? true) && esDiaReservable(fecha, ahoraMs, config.anticipacion_dias)

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
            else onCambio?.()
          },
        },
      ],
    )
  }

  function abrirEdicion(r: MiReserva) {
    setFecha(fechaArgentina(r.inicio))
    setForm({
      cancha: r.cancha_id,
      hora: horaArgentina(r.inicio),
      edicion: { reservaId: r.id, modalidad: r.modalidad, jugadores: jugadoresParaEditar(r), comentario: r.comentario ?? null },
    })
  }

  // Pedido de la Agenda: abrir la edición de esa reserva una sola vez.
  useEffect(() => {
    if (!editarInicial || editarAtendido.current === editarInicial) return
    const r = reservas.find(x => x.id === editarInicial)
    if (!r) return
    editarAtendido.current = editarInicial
    if (puedeEditar(r, Date.now(), config.cancelacion_horas)) abrirEdicion(r)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editarInicial, reservas])

  const activas = reservas.filter(r => ['pendiente_comprobante', 'confirmada'].includes(r.estado) && Date.parse(r.fin) > ahoraMs)

  return (
    <View style={s.root}>
      <Titulo>TENIS</Titulo>
      <NovedadesTenis />
      <Text style={s.subtitulo}>Tocá un horario libre para reservar. Hasta {config.anticipacion_dias} días antes.</Text>
      <SelectorVista vista={vista} onCambiar={setVista} />

      {vista === 'semana' ? (
        <DisponibilidadSemana
          desde={diasVer[0]}
          dias={diasVer.length}
          ahoraMs={ahoraMs}
          onElegirDia={f => { setFecha(f); setVista('dia') }}
        />
      ) : (
      <>
      <NavegadorDia
        dias={diasVer}
        fecha={fecha}
        ahoraMs={ahoraMs}
        reservas={disp ? reservasPorCancha(disp.items, disp.canchas).total : null}
        canchas={base?.canchas.length ?? 0}
        cerrado={disp?.horario?.abierto === false}
        onCambiar={setFecha}
      />
      {loading && !disp ? (
        <ActivityIndicator color={colors.oro} style={s.cargando} />
      ) : error && !disp ? (
        <ErrorCarga mensaje={error} onReintentar={refetch} />
      ) : disp ? (
        <>
          {!reservable && disp.horario?.abierto !== false && (
            <Text style={s.soloVer}>Este día se puede mirar pero todavía no reservar. Se puede reservar hasta {config.anticipacion_dias} días antes.</Text>
          )}
          <GrillaCanchas
            fecha={fecha}
            config={config}
            horario={disp.horario}
            canchas={disp.canchas}
            items={disp.items}
            ahoraMs={ahoraMs}
            reservable={reservable}
            onPressLibre={(cancha, hora) => setForm({ cancha, hora })}
          />
          {reservable && disp.horario?.abierto !== false && (
            <Boton texto="RESERVAR CANCHA" variante="secundario" onPress={() => setForm({ cancha: disp.canchas[0]?.id ?? null, hora: null })} />
          )}
        </>
      ) : null}
      </>
      )}

      <Text style={estilosTenis.label}>MIS RESERVAS</Text>
      {error && disp && <ErrorCarga mensaje={error} onReintentar={refetch} />}
      {activas.length === 0 && !loading && !error && <Text style={estilosTenis.vacio}>No tenés reservas de tenis.</Text>}
      {activas.map(r => {
        // Lo decide el servidor (titular, confirmada y hasta 3 h antes); se vuelve a mirar el
        // reloj por si la pantalla quedó abierta desde que se cargó.
        const sePuede = r.puede_cancelar && puedeCancelar(r.inicio, ahoraMs, config.cancelacion_horas)
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
                <>
                  {puedeEditar(r, ahoraMs, config.cancelacion_horas) && (
                    <Boton texto="EDITAR RESERVA" variante="secundario" onPress={() => abrirEdicion(r)} />
                  )}
                  <Boton texto="CANCELAR RESERVA" variante="secundario" cargando={cancelando === r.id} onPress={() => pedirCancelacion(r)} />
                </>
              ) : (
                <Text style={estilosTenis.mutedCard}>Ya no se puede cancelar: faltan menos de {config.cancelacion_horas} horas.</Text>
              )
            )}
          </View>
        )
      })}

      {base && form && (
        <FormReserva
          visible
          onCerrar={() => setForm(null)}
          fecha={fecha}
          canchas={base.canchas}
          config={config}
          items={disp?.items ?? []}
          // Otro día en edición: spinner mientras carga; si falló, el error con
          // REINTENTAR dentro del formulario (no un spinner para siempre).
          cargandoItems={!disp && (loading || !error)}
          errorItems={!disp && !loading ? error : null}
          onReintentarItems={refetch}
          ahoraMs={ahoraMs}
          canchaInicial={form.cancha}
          horaInicial={form.hora}
          edicion={form.edicion}
          dias={dias}
          onCambiarFecha={setFecha}
          onConfirmar={async d => {
            const edicion = form.edicion
            const res = edicion ? await editar(edicion.reservaId, d) : await reservar(d)
            if (res.ok) onCambio?.()
            return res
          }}
        />
      )}
    </View>
  )
})

const s = StyleSheet.create({
  root:          { marginTop: 8 },
  subtitulo:     { fontFamily: fonts.cuerpo, fontSize: 14, color: colors.textoSecundario },
  soloVer:       { fontFamily: fonts.cuerpo, fontSize: 14, color: colors.textoSecundario, marginBottom: 6 },
  cargando:      { marginVertical: 24 },
  reserva:       { marginBottom: 10 },
  reservaTitulo: { fontFamily: fonts.label, fontSize: 15, letterSpacing: 1, color: colors.oro },
})
