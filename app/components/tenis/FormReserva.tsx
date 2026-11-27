import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, TextInput, Modal, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, StyleSheet, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { colors, fonts } from '@/constants/theme'
import {
  duracionModalidad, duracionTexto, etiquetaDiaCorta, horaDeMinutos, iniciosLibres, inicioReal, isoArgentina,
  itemsSinReserva, jugadoresRequeridos, minutosDeHora, resumenPrecio,
  type Cancha, type DiaReserva, type ItemGrilla, type JugadorEntrada, type Modalidad, type ResultadoReserva, type ResumenPrecio, type TenisConfig,
} from '@/lib/tenis'
import {
  COMENTARIO_MAX, claveCotizacion, elegidoADesignar, esEntradaADesignar, normalizarComentario, titularSocioCotizable, type Cotizacion,
} from '@/lib/tenisReserva'
import type { ResultadoTenis } from '@/hooks/useTenisRpc'
import { cotizarTenis } from '@/hooks/useTenisSocio'
import { AvisoSanciones } from './AvisoSanciones'
import { BuscadorJugador, type JugadorElegido } from './BuscadorJugador'
import { Aviso, BarraModal, Boton, Chip, SelectorDia, Titulo, estilosTenis } from './ui'

// Formulario de reserva: cancha, singles o dobles, horario libre y jugadores
// (socios del padrón o invitados). El titular es quien reserva (socio) o se
// elige (reserva telefónica del gestor, `staff`). El precio lo calcula el
// servidor y se muestra al confirmar.
// Con `edicion` el socio titular cambia una reserva suya: arranca con su día,
// modalidad, horario, cancha y jugadores; puede cambiar de día (`dias` +
// `onCambiarFecha`, la grilla la recarga el padre: `cargandoItems` mientras
// tanto) y su propio turno cuenta como libre. Sin aviso de sanciones (ya lo
// aceptó al reservar). Si la grilla del día nuevo no carga, `errorItems` se
// muestra en el formulario con REINTENTAR (`onReintentarItems`).
// Como en OnDepor: un jugador puede ser "Socio a designar" (se elige después,
// editando la reserva), el invitado puede ir sin DNI y el socio deja un
// comentario opcional y ve el precio (`tenis_cotizar`) antes de confirmar. La
// telefónica también lleva comentario y, con un titular socio, cotiza a su nombre.

export interface EdicionReserva {
  reservaId: string
  modalidad: Modalidad
  jugadores: JugadorElegido[]
  comentario?: string | null
}

export interface DatosReserva {
  canchaId:  string
  inicio:    string
  modalidad: Modalidad
  jugadores: JugadorEntrada[]
  titular?:  JugadorEntrada
  // p_comentario (socio y telefónica).
  comentario?: string | null
}

export function FormReserva({
  visible, onCerrar, fecha, canchas, config, items, ahoraMs, canchaInicial, horaInicial, staff = false, onConfirmar,
  edicion, dias, onCambiarFecha, cargandoItems = false, errorItems = null, onReintentarItems,
}: {
  visible:       boolean
  onCerrar:      () => void
  fecha:         string
  canchas:       Cancha[]
  config:        TenisConfig
  items:         ItemGrilla[]
  ahoraMs:       number
  canchaInicial: string | null
  horaInicial:   string | null
  staff?:        boolean
  onConfirmar:   (d: DatosReserva) => Promise<ResultadoTenis<ResultadoReserva>>
  edicion?:        EdicionReserva
  dias?:           DiaReserva[]
  onCambiarFecha?: (fecha: string) => void
  cargandoItems?:  boolean
  errorItems?:     string | null
  onReintentarItems?: () => void
}) {
  // Arranca con los datos de la reserva editada desde el primer render: el
  // recorte de jugadores por modalidad corre antes que el efecto de abajo.
  const [canchaId,  setCanchaId]  = useState<string | null>(canchaInicial)
  const [modalidad, setModalidad] = useState<Modalidad>(edicion?.modalidad ?? 'singles')
  const [hora,      setHora]      = useState<string | null>(horaInicial)
  const [titular,   setTitular]   = useState<JugadorElegido | null>(null)
  const [jugadores, setJugadores] = useState<JugadorElegido[]>(edicion?.jugadores ?? [])
  const [comentario, setComentario] = useState(edicion?.comentario ?? '')
  const [enviando,  setEnviando]  = useState(false)
  // Guard sincrónico: un doble toque en "ENTENDIDO, CONFIRMAR" llega antes de
  // que `enviando` se vuelva a renderizar y no debe mandar la reserva dos veces.
  const enviandoRef = useRef(false)
  const [error,     setError]     = useState<string | null>(null)
  const [resultado, setResultado] = useState<ResultadoReserva | null>(null)
  // Socio: antes de reservar se muestra el aviso de sanciones (el staff no).
  const [avisando,  setAvisando]  = useState(false)

  // Cada vez que se abre arranca limpio con la celda tocada.
  useEffect(() => {
    if (!visible) return
    setCanchaId(canchaInicial); setHora(horaInicial); setModalidad(edicion?.modalidad ?? 'singles')
    setTitular(null); setJugadores(edicion?.jugadores ?? []); setComentario(edicion?.comentario ?? '')
    setError(null); setResultado(null); setAvisando(false)
  }, [visible, canchaInicial, horaInicial, edicion])

  const reservaEditada = edicion?.reservaId
  const itemsVisibles = useMemo(() => itemsSinReserva(items, reservaEditada), [items, reservaEditada])

  // El socio sólo ve horarios que no dejan huecos inutilizables (optimizador);
  // la reserva telefónica del staff no lo aplica.
  const libres = useMemo(
    () => (canchaId ? iniciosLibres(itemsVisibles, canchaId, fecha, modalidad, config, ahoraMs, { optimizador: !staff }) : []),
    [itemsVisibles, canchaId, fecha, modalidad, config, ahoraMs, staff],
  )
  // Si el horario elegido ya no entra (p. ej. pasó a dobles), se deselecciona.
  // Mientras se carga otro día no se decide nada.
  useEffect(() => {
    if (!cargandoItems && !errorItems && hora && !libres.includes(hora)) setHora(null)
  }, [libres, hora, cargandoItems, errorItems])

  const requeridos = jugadoresRequeridos(modalidad)
  useEffect(() => {
    setJugadores(js => js.slice(0, requeridos))
  }, [requeridos])

  const cancha = canchas.find(c => c.id === canchaId)
  const excluir = [...jugadores.map(j => j.clave), ...(titular ? [titular.clave] : [])]
  const completo = !!canchaId && !!hora && !cargandoItems && !errorItems && jugadores.length === requeridos && (!staff || !!titular)

  // Cotización: medio segundo después del último cambio de cancha, horario o
  // jugadores; sólo vale la respuesta del pedido vigente. La telefónica cotiza
  // a nombre del titular elegido, sólo si es socio del padrón (el precio
  // depende de él, no de quien carga la reserva).
  const titularCot = staff ? titularSocioCotizable(titular?.entrada) : null
  const cotiza = !staff || !!titularCot
  const pedidoCotizacion = cotiza && completo && canchaId && hora
    ? {
        canchaId, inicio: isoArgentina(fecha, hora), modalidad, jugadores: jugadores.map(j => j.entrada),
        reservaId: staff ? null : reservaEditada ?? null, titularSocioId: titularCot,
      }
    : null
  const claveCot = pedidoCotizacion ? claveCotizacion(pedidoCotizacion) : null
  const pedidoCotRef = useRef(pedidoCotizacion)
  pedidoCotRef.current = pedidoCotizacion
  const [cotizacion, setCotizacion] = useState<{ clave: string; data: Cotizacion | null; error: string | null } | null>(null)
  useEffect(() => {
    const args = pedidoCotRef.current
    if (!claveCot || !args) return
    let vigente = true
    const t = setTimeout(async () => {
      const r = await cotizarTenis(args).catch(() => ({ ok: false as const, mensaje: 'No se pudo calcular el precio.' }))
      if (vigente) setCotizacion({ clave: claveCot, data: r.ok ? r.data : null, error: r.ok ? null : r.mensaje })
    }, 500)
    return () => { vigente = false; clearTimeout(t) }
  }, [claveCot])
  const cotActual = cotizacion && cotizacion.clave === claveCot ? cotizacion : null
  const resumenCot = cotActual?.data ? resumenPrecio(cotActual.data) : null

  function pedirConfirmacion() {
    if (!completo || enviando) return
    if (staff || edicion) void confirmar()
    else setAvisando(true)
  }

  async function confirmar() {
    setAvisando(false)
    if (!completo || !canchaId || !hora || enviandoRef.current) return
    enviandoRef.current = true
    setEnviando(true)
    setError(null)
    let r: Awaited<ReturnType<typeof onConfirmar>>
    try {
      r = await onConfirmar({
        canchaId,
        inicio: isoArgentina(fecha, hora),
        modalidad,
        jugadores: jugadores.map(j => j.entrada),
        titular: titular?.entrada,
        comentario: normalizarComentario(comentario),
      })
    } finally {
      enviandoRef.current = false
      setEnviando(false)
    }
    if (r.ok) setResultado(r.data)
    else setError(r.mensaje)
  }

  const fin = hora ? horaDeMinutos(minutosDeHora(hora) + duracionModalidad(modalidad, config)) : null
  const resumen = resultado ? resumenPrecio(resultado) : null

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCerrar}>
      <SafeAreaView style={estilosTenis.sheet}>
        <BarraModal titulo={staff ? 'RESERVA TELEFÓNICA' : edicion ? 'EDITAR RESERVA' : 'RESERVAR CANCHA'} onCerrar={onCerrar} />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={estilosTenis.sheetCuerpo} keyboardShouldPersistTaps="handled">
            {resumen && resultado ? (
              <View accessibilityLiveRegion="polite">
                <Titulo>{edicion ? '¡Reserva cambiada!' : '¡Reserva hecha!'}</Titulo>
                <Text style={estilosTenis.textoCard}>
                  Cancha {cancha?.nombre} · {etiquetaDiaCorta(fecha)} · arranca a las {hora ? inicioReal(hora, config.margen_inicio_min) : ''}
                </Text>
                <View style={[estilosTenis.card, s.espacio]}>
                  <LineasPrecio resumen={resumen} />
                </View>
                <Aviso>Se paga en el club antes de entrar a la cancha. Si alguien no se presenta, el turno completo se le cobra a quien reservó.</Aviso>
                <Boton texto="LISTO" onPress={onCerrar} />
              </View>
            ) : (
              <>
                {edicion && dias && onCambiarFecha && (
                  <>
                    <Text style={estilosTenis.label}>DÍA</Text>
                    <SelectorDia dias={dias} fecha={fecha} onElegir={onCambiarFecha} />
                  </>
                )}
                <Text style={estilosTenis.label}>CANCHA</Text>
                <View style={estilosTenis.fila}>
                  {canchas.map(c => (
                    <Chip key={c.id} texto={c.nombre} activo={c.id === canchaId} onPress={() => setCanchaId(c.id)} />
                  ))}
                </View>

                <Text style={estilosTenis.label}>MODALIDAD</Text>
                <View style={estilosTenis.fila}>
                  <Chip texto={`SINGLES · ${duracionTexto(config.singles_min).toUpperCase()}`} activo={modalidad === 'singles'} onPress={() => setModalidad('singles')} />
                  <Chip texto={`DOBLES · ${duracionTexto(config.dobles_min).toUpperCase()}`} activo={modalidad === 'dobles'} onPress={() => setModalidad('dobles')} />
                </View>

                <Text style={estilosTenis.label}>HORARIO · {etiquetaDiaCorta(fecha)}</Text>
                {cargandoItems ? (
                  <ActivityIndicator color={colors.oro} style={s.espacio} />
                ) : errorItems ? (
                  <>
                    <Aviso tipo="error">{errorItems}</Aviso>
                    {onReintentarItems && <Boton texto="REINTENTAR" variante="secundario" onPress={onReintentarItems} />}
                  </>
                ) : libres.length === 0 ? (
                  <Text style={estilosTenis.vacio}>{canchaId ? 'No quedan horarios libres en esta cancha ese día.' : 'Elegí una cancha.'}</Text>
                ) : (
                  <View style={estilosTenis.fila}>
                    {libres.map(h => <Chip key={h} texto={h} activo={h === hora} onPress={() => setHora(h)} />)}
                  </View>
                )}
                {hora && fin && (
                  <Aviso>Arranca a las {inicioReal(hora, config.margen_inicio_min)} (se barre la cancha) y termina a las {fin}.</Aviso>
                )}

                {staff && (
                  <>
                    <Text style={estilosTenis.label}>TITULAR (QUIEN LLAMÓ)</Text>
                    {titular ? (
                      <FilaJugador nombre={titular.nombre} onQuitar={() => setTitular(null)} />
                    ) : (
                      <BuscadorJugador excluir={excluir} onElegir={setTitular} />
                    )}
                  </>
                )}

                <Text style={estilosTenis.label}>
                  {staff ? 'JUGADORES' : 'CON QUIÉN JUGÁS'} ({jugadores.length}/{requeridos})
                </Text>
                {jugadores.map(j => (
                  <FilaJugador
                    key={j.clave}
                    nombre={j.nombre}
                    aDesignar={esEntradaADesignar(j.entrada)}
                    onQuitar={() => setJugadores(js => js.filter(x => x.clave !== j.clave))}
                  />
                ))}
                {jugadores.length < requeridos && (
                  <>
                    <BuscadorJugador excluir={excluir} dniOpcional onElegir={j => setJugadores(js => [...js, j])} />
                    <Boton
                      texto="SOCIO A DESIGNAR"
                      variante="secundario"
                      onPress={() => setJugadores(js => (js.length < requeridos ? [...js, elegidoADesignar(js.map(x => x.clave))] : js))}
                    />
                    <Text style={estilosTenis.mutedCard}>
                      {staff
                        ? 'Guarda el lugar con precio socio; el jugador se corrige después desde la grilla.'
                        : 'Guarda el lugar con precio socio; elegís al jugador después editando la reserva.'}
                    </Text>
                  </>
                )}

                <Text style={estilosTenis.label}>COMENTARIO (OPCIONAL)</Text>
                <TextInput
                  style={[estilosTenis.input, s.comentario]}
                  value={comentario}
                  onChangeText={setComentario}
                  maxLength={COMENTARIO_MAX}
                  multiline
                  placeholder={staff ? 'Algo que el canchero tenga que saber' : 'Algo que la gestora tenga que saber'}
                  placeholderTextColor={colors.muted}
                  accessibilityLabel="Comentario de la reserva, opcional"
                />
                <Text style={s.contador}>{comentario.length}/{COMENTARIO_MAX}</Text>

                {cotiza && completo && (
                  <View style={[estilosTenis.card, s.espacio]} accessibilityLiveRegion="polite">
                    <Text style={estilosTenis.label}>PRECIO</Text>
                    {!cotActual ? (
                      <ActivityIndicator color={colors.oro} />
                    ) : resumenCot ? (
                      <LineasPrecio resumen={resumenCot} />
                    ) : (
                      <Text style={s.errorCot}>{cotActual.error}</Text>
                    )}
                  </View>
                )}

                {error && <Aviso tipo="error">{error}</Aviso>}
                <Boton texto={edicion ? 'GUARDAR CAMBIOS' : 'CONFIRMAR RESERVA'} onPress={pedirConfirmacion} cargando={enviando} disabled={!completo} />
                <Aviso>
                  {staff && !titularCot
                    ? 'El precio se calcula al confirmar: con Carnet Tenis el primer turno del día no se cobra.'
                    : 'Con Carnet Tenis el primer turno del día no se cobra. Se paga en el club antes de entrar.'}
                </Aviso>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
        <AvisoSanciones visible={avisando} onVolver={() => setAvisando(false)} onConfirmar={() => void confirmar()} />
      </SafeAreaView>
    </Modal>
  )
}

function LineasPrecio({ resumen }: { resumen: ResumenPrecio }) {
  return (
    <>
      {resumen.lineas.map((l, i) => (
        <View key={i} style={s.lineaPrecio}>
          <View style={{ flex: 1 }}>
            <Text style={estilosTenis.textoCard}>{l.nombre}</Text>
            {!!l.detalle && <Text style={estilosTenis.mutedCard}>{l.detalle}</Text>}
          </View>
          <Text style={s.monto}>{l.monto}</Text>
        </View>
      ))}
      <View style={[s.lineaPrecio, s.total]}>
        <Text style={s.totalTexto}>TOTAL</Text>
        <Text style={s.totalTexto}>{resumen.total}</Text>
      </View>
    </>
  )
}

// `aDesignar`: lugar guardado para un socio que se elige después.
export function FilaJugador({ nombre, onQuitar, aDesignar = false }: { nombre: string; onQuitar?: () => void; aDesignar?: boolean }) {
  return (
    <View style={s.filaJugador}>
      <Text style={[estilosTenis.textoCard, { flex: 1 }, aDesignar && s.aDesignar]}>{nombre}</Text>
      {aDesignar && <Text style={s.marcaDesignar}>A DESIGNAR</Text>}
      {onQuitar && (
        <TouchableOpacity onPress={onQuitar} style={s.quitar} accessibilityRole="button" accessibilityLabel={`Quitar a ${nombre}`}>
          <Feather name="x-circle" size={20} color={colors.muted} />
        </TouchableOpacity>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  espacio:     { marginTop: 12 },
  lineaPrecio: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  monto:       { fontFamily: fonts.mono, fontSize: 14, color: colors.texto },
  total:       { borderTopWidth: 1, borderTopColor: colors.borde, marginTop: 6, paddingTop: 8 },
  totalTexto:  { fontFamily: fonts.label, fontSize: 15, letterSpacing: 1, color: colors.oro, flex: 1 },
  filaJugador: { minHeight: 44, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.borde },
  quitar:      { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  aDesignar:   { fontStyle: 'italic', color: colors.textoSecundario },
  marcaDesignar: {
    fontFamily: fonts.label, fontSize: 11, letterSpacing: 1, color: colors.oro,
    borderWidth: 1, borderColor: colors.oro, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2,
  },
  comentario:  { minHeight: 72, textAlignVertical: 'top', paddingTop: 10 },
  contador:    { fontFamily: fonts.mono, fontSize: 12, color: colors.muted, alignSelf: 'flex-end' },
  errorCot:    { fontFamily: fonts.cuerpo, fontSize: 14, color: colors.rojoTexto },
})
