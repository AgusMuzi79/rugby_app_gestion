import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, Modal, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, StyleSheet, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { colors, fonts } from '@/constants/theme'
import {
  duracionModalidad, duracionTexto, etiquetaDiaCorta, horaDeMinutos, iniciosLibres, inicioReal, isoArgentina,
  itemsSinReserva, jugadoresRequeridos, minutosDeHora, resumenPrecio,
  type Cancha, type DiaReserva, type ItemGrilla, type JugadorEntrada, type Modalidad, type ResultadoReserva, type TenisConfig,
} from '@/lib/tenis'
import type { ResultadoTenis } from '@/hooks/useTenisRpc'
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
// aceptó al reservar).

export interface EdicionReserva {
  reservaId: string
  modalidad: Modalidad
  jugadores: JugadorElegido[]
}

export interface DatosReserva {
  canchaId:  string
  inicio:    string
  modalidad: Modalidad
  jugadores: JugadorEntrada[]
  titular?:  JugadorEntrada
}

export function FormReserva({
  visible, onCerrar, fecha, canchas, config, items, ahoraMs, canchaInicial, horaInicial, staff = false, onConfirmar,
  edicion, dias, onCambiarFecha, cargandoItems = false,
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
}) {
  // Arranca con los datos de la reserva editada desde el primer render: el
  // recorte de jugadores por modalidad corre antes que el efecto de abajo.
  const [canchaId,  setCanchaId]  = useState<string | null>(canchaInicial)
  const [modalidad, setModalidad] = useState<Modalidad>(edicion?.modalidad ?? 'singles')
  const [hora,      setHora]      = useState<string | null>(horaInicial)
  const [titular,   setTitular]   = useState<JugadorElegido | null>(null)
  const [jugadores, setJugadores] = useState<JugadorElegido[]>(edicion?.jugadores ?? [])
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
    setTitular(null); setJugadores(edicion?.jugadores ?? []); setError(null); setResultado(null); setAvisando(false)
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
    if (!cargandoItems && hora && !libres.includes(hora)) setHora(null)
  }, [libres, hora, cargandoItems])

  const requeridos = jugadoresRequeridos(modalidad)
  useEffect(() => {
    setJugadores(js => js.slice(0, requeridos))
  }, [requeridos])

  const cancha = canchas.find(c => c.id === canchaId)
  const excluir = [...jugadores.map(j => j.clave), ...(titular ? [titular.clave] : [])]
  const completo = !!canchaId && !!hora && !cargandoItems && jugadores.length === requeridos && (!staff || !!titular)

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
                  <FilaJugador key={j.clave} nombre={j.nombre} onQuitar={() => setJugadores(js => js.filter(x => x.clave !== j.clave))} />
                ))}
                {jugadores.length < requeridos && (
                  <BuscadorJugador excluir={excluir} onElegir={j => setJugadores(js => [...js, j])} />
                )}

                {error && <Aviso tipo="error">{error}</Aviso>}
                <Boton texto={edicion ? 'GUARDAR CAMBIOS' : 'CONFIRMAR RESERVA'} onPress={pedirConfirmacion} cargando={enviando} disabled={!completo} />
                <Aviso>El precio se calcula al confirmar: con Carnet Tenis el primer turno del día no se cobra.</Aviso>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
        <AvisoSanciones visible={avisando} onVolver={() => setAvisando(false)} onConfirmar={() => void confirmar()} />
      </SafeAreaView>
    </Modal>
  )
}

export function FilaJugador({ nombre, onQuitar }: { nombre: string; onQuitar?: () => void }) {
  return (
    <View style={s.filaJugador}>
      <Text style={[estilosTenis.textoCard, { flex: 1 }]}>{nombre}</Text>
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
})
