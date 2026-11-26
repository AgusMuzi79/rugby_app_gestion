import { useState } from 'react'
import { View, Text, Modal, ScrollView, Alert, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, fonts } from '@/constants/theme'
import { accionesTenis } from '@/hooks/useTenisGestor'
import { accionesGestion } from '@/hooks/useTenisGestion'
import {
  ESTADOS_RESERVA, esBloque, estiloItem, etiquetaMotivo, horaArgentina, inicioReal, montoCargo, textoDiferenciaCobro,
  type ItemGrilla, type JugadorGrilla, type TenisConfig,
} from '@/lib/tenis'
import { formatMonto } from '@/lib/formatoMonto'
import { CorregirJugadores } from './CorregirJugadores'
import { HistorialReserva } from './HistorialReserva'
import { MotivoCancelacion } from './ListadoReservas'
import { Aviso, BarraModal, Boton, estilosTenis } from './ui'

// Detalle de un ítem de la grilla para el gestor y el canchero. Reserva:
// jugadores con su cargo, cobro y check-in; corregir jugadores y extensión.
// Gestor: cancelar la reserva (con motivo), ver su historial y cobrar el cargo
// del no-show. Bloque (sólo gestor): editar el fijo o borrarlo.

const COMPROBANTE: Record<string, string> = {
  pendiente: 'Comprobante pendiente de revisar',
  aprobado:  'Comprobante aprobado',
  rechazado: 'Comprobante rechazado',
}

export function DetalleItem({ item, canchaNombre, config, esGestor, onCerrar, onCambio, onEditarBloque }: {
  item:          ItemGrilla
  canchaNombre:  string
  config:        TenisConfig
  esGestor:      boolean
  onCerrar:      () => void
  onCambio:      () => void
  onEditarBloque?: (item: ItemGrilla) => void
}) {
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [corrigiendo, setCorrigiendo] = useState(false)
  const [viendoHistorial, setViendoHistorial] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const est = estiloItem(item)
  const bloque = esBloque(item)
  // Cargo del no-show por jugador (0 = no hay).
  const noShow = (j: JugadorGrilla) => j.cargo_no_show > 0 ? { cargo: j.cargo_no_show, cobrado: j.cargo_no_show_cobrado } : null

  async function correr(clave: string, accion: () => Promise<{ ok: true } | { ok: false; mensaje: string }>, cerrar = false) {
    setOcupado(clave)
    setError(null)
    const r = await accion()
    setOcupado(null)
    if (!r.ok) { setError(r.mensaje); return }
    onCambio()
    if (cerrar) onCerrar()
  }

  function marcarCobro(j: JugadorGrilla) {
    // Con cargo de no-show, el turno y el no-show se cobran por separado.
    const accion = () => correr(`cobro-${j.id}`, () => noShow(j)
      ? accionesGestion.cobroConcepto(j.id, !j.cobrado, 'turno')
      : accionesTenis.cobroMarcar(j.id, !j.cobrado), true)
    // DESHACER con una diferencia de cobro: el ajuste para staff no se cierra solo
    // (nadie lo saldó); queda en "Ajustes pendientes" y la reserva vuelve a deber el cargo.
    if (j.cobrado && j.diferencia !== 0) {
      Alert.alert(
        'Deshacer el cobro',
        `${j.nombre} tiene una diferencia de cobro. Si deshacés, queda debiendo el cargo entero y el ajuste sigue en "Ajustes pendientes" hasta que lo resuelvas o vuelvas a marcar el cobro. ¿Confirmás?`,
        [
          { text: 'No', style: 'cancel' },
          { text: 'Deshacer', style: 'destructive', onPress: accion },
        ],
      )
      return
    }
    accion()
  }

  function marcarNoShow(j: JugadorGrilla) {
    const ns = noShow(j)
    if (!ns) return
    const accion = () => correr(`ns-${j.id}`, () => accionesGestion.cobroConcepto(j.id, !ns.cobrado, 'no_show'), true)
    if (ns.cobrado) {
      Alert.alert('Deshacer el cobro del no-show', `${j.nombre} vuelve a deber ${formatMonto(ns.cargo)}. ¿Confirmás?`, [
        { text: 'No', style: 'cancel' },
        { text: 'Deshacer', style: 'destructive', onPress: accion },
      ])
      return
    }
    accion()
  }

  async function cancelarReserva(motivo: string): Promise<string | null> {
    if (!item.reserva_id) return null
    const r = await accionesGestion.cancelar(item.reserva_id, motivo || null)
    if (!r.ok) return r.mensaje
    setCancelando(false)
    onCambio()
    onCerrar()
    return null
  }

  // Cobrado con diferencia (se editó la reserva después de cobrar): marcar de
  // nuevo deja lo cobrado igual al cargo.
  function saldar(j: JugadorGrilla) {
    correr(`saldar-${j.id}`, () => accionesTenis.cobroMarcar(j.id, true), true)
  }

  function extender(minutos: number) {
    if (!item.reserva_id || !item.cancha_id) return
    const hasta = new Date(Date.parse(item.fin) + minutos * 60_000).toISOString()
    Alert.alert(
      'Extensión',
      `Se registra que siguen jugando en la cancha ${canchaNombre} hasta las ${horaArgentina(hasta)}. Se cobra como un turno más. ¿Confirmás?`,
      [
        { text: 'No', style: 'cancel' },
        { text: 'Confirmar', onPress: () => correr(`ext-${minutos}`, () => accionesTenis.extension(item.cancha_id as string, hasta, item.reserva_id as string), true) },
      ],
    )
  }

  function borrarBloque() {
    if (!item.bloque_id) return
    Alert.alert(
      'Borrar bloque',
      item.recurrente
        ? `Se borra "${item.titulo ?? est.etiqueta}" de todas las semanas. ¿Confirmás?`
        : `Se borra "${item.titulo ?? est.etiqueta}". ¿Confirmás?`,
      [
        { text: 'No', style: 'cancel' },
        { text: 'Borrar', style: 'destructive', onPress: () => correr('borrar', () => accionesTenis.bloqueBorrar(item.bloque_id as string), true) },
      ],
    )
  }

  const activa = item.estado === 'confirmada' || item.estado === 'jugada'
  const cancelable = esGestor && !!item.reserva_id && Date.parse(item.fin) > Date.now()
    && ['confirmada', 'pendiente_comprobante', 'pendiente_confirmacion'].includes(item.estado ?? '')

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onCerrar}>
      <SafeAreaView style={estilosTenis.sheet}>
        <BarraModal titulo={`CANCHA ${canchaNombre}`} onCerrar={onCerrar} />
        <ScrollView contentContainerStyle={estilosTenis.sheetCuerpo}>
          <View style={[s.tipo, { backgroundColor: est.fondo }]}>
            <Text style={[s.tipoTexto, { color: est.texto }]}>{item.recurrente ? '↻ ' : ''}{est.etiqueta}</Text>
          </View>
          {!!item.titulo && <Text style={s.titulo}>{item.titulo}</Text>}
          <Text style={estilosTenis.textoCard}>
            {bloque ? horaArgentina(item.inicio) : inicioReal(item.inicio, config.margen_inicio_min)} a {horaArgentina(item.fin)}
            {item.modalidad ? ` · ${item.modalidad === 'dobles' ? 'Dobles' : 'Singles'}` : ''}
          </Text>
          {!!item.estado && <Text style={estilosTenis.mutedCard}>{ESTADOS_RESERVA[item.estado] ?? item.estado}</Text>}
          {!!item.comprobante_estado && <Text style={estilosTenis.mutedCard}>{COMPROBANTE[item.comprobante_estado] ?? item.comprobante_estado}</Text>}

          {!!item.comentario?.trim() && <Text style={estilosTenis.textoCard}>Comentario: {item.comentario}</Text>}

          {!bloque && (
            <>
              <Text style={estilosTenis.label}>JUGADORES</Text>
              {(item.jugadores ?? []).map(j => (
                <View key={j.id || j.nombre} style={[estilosTenis.card, s.jugador]}>
                  <Text style={estilosTenis.textoCard}>{j.nombre}{j.es_titular ? ' · titular' : ''}</Text>
                  <Text style={estilosTenis.mutedCard}>
                    {montoCargo(j.cargo)}{etiquetaMotivo(j.motivo) ? ` · ${etiquetaMotivo(j.motivo)}` : ''}
                  </Text>
                  <Text style={j.check_in_at ? s.ok : estilosTenis.mutedCard}>
                    {j.check_in_at ? `Entró a las ${horaArgentina(j.check_in_at)}` : 'Todavía no entró'}
                  </Text>
                  {!!textoDiferenciaCobro(j) && <Text style={s.diferencia}>{textoDiferenciaCobro(j)}</Text>}
                  {!!textoDiferenciaCobro(j) && j.id !== '' && (
                    <Boton
                      texto={j.diferencia > 0 ? 'COBRÉ LA DIFERENCIA' : 'YA LE DEVOLVÍ LA DIFERENCIA'}
                      cargando={ocupado === `saldar-${j.id}`}
                      onPress={() => saldar(j)}
                    />
                  )}
                  {(j.cargo > 0 || j.cobrado) && j.id !== '' && (
                    <Boton
                      texto={j.cobrado ? 'COBRADO · DESHACER' : 'MARCAR COBRADO'}
                      variante={j.cobrado ? 'secundario' : 'primario'}
                      cargando={ocupado === `cobro-${j.id}`}
                      onPress={() => marcarCobro(j)}
                    />
                  )}
                  {!!noShow(j) && j.id !== '' && (
                    <>
                      <Text style={j.cargo_no_show_cobrado ? s.ok : s.diferencia}>
                        No se presentó: cargo de {formatMonto(j.cargo_no_show)} · {j.cargo_no_show_cobrado ? 'cobrado' : 'pendiente'}
                      </Text>
                      <Boton
                        texto={j.cargo_no_show_cobrado ? 'NO-SHOW COBRADO · DESHACER' : 'COBRÉ EL NO-SHOW'}
                        variante={j.cargo_no_show_cobrado ? 'secundario' : 'primario'}
                        cargando={ocupado === `ns-${j.id}`}
                        onPress={() => marcarNoShow(j)}
                      />
                    </>
                  )}
                </View>
              ))}
              {item.reserva_id && activa && (
                <>
                  <Boton texto="CORREGIR JUGADORES" variante="secundario" onPress={() => setCorrigiendo(true)} />
                  <Text style={estilosTenis.label}>EXTENSIÓN (SIGUEN EN CANCHA LIBRE)</Text>
                  <View style={estilosTenis.fila}>
                    <Boton texto="+30 MIN" variante="secundario" cargando={ocupado === 'ext-30'} onPress={() => extender(30)} />
                    <Boton texto="+1 H" variante="secundario" cargando={ocupado === 'ext-60'} onPress={() => extender(60)} />
                  </View>
                </>
              )}
              {item.reserva_id && <Boton texto="VER HISTORIAL" variante="secundario" onPress={() => setViendoHistorial(true)} />}
              {cancelable && <Boton texto="CANCELAR RESERVA" variante="peligro" onPress={() => setCancelando(true)} />}
            </>
          )}

          {bloque && esGestor && (
            <>
              {item.recurrente && onEditarBloque && (
                <Boton texto="EDITAR BLOQUE FIJO" variante="secundario" onPress={() => onEditarBloque(item)} />
              )}
              {item.bloque_id && <Boton texto="BORRAR BLOQUE" variante="peligro" cargando={ocupado === 'borrar'} onPress={borrarBloque} />}
            </>
          )}

          {error && <Aviso tipo="error">{error}</Aviso>}
        </ScrollView>
      </SafeAreaView>
      {corrigiendo && (
        <CorregirJugadores
          item={item}
          onCerrar={() => setCorrigiendo(false)}
          onGuardado={() => { setCorrigiendo(false); onCambio(); onCerrar() }}
        />
      )}
      {viendoHistorial && item.reserva_id && <HistorialReserva reservaId={item.reserva_id} onCerrar={() => setViendoHistorial(false)} />}
      {cancelando && (
        <MotivoCancelacion
          titulo="CANCELAR RESERVA"
          detalle={`Se cancela la reserva de la cancha ${canchaNombre} y el turno queda libre. Si corresponde devolver plata, la devolución es en efectivo por administración.`}
          onConfirmar={cancelarReserva}
          onCerrar={() => setCancelando(false)}
        />
      )}
    </Modal>
  )
}

const s = StyleSheet.create({
  tipo:      { alignSelf: 'flex-start', borderRadius: 4, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8 },
  tipoTexto: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1 },
  titulo:    { fontFamily: fonts.titulo, fontSize: 18, color: colors.texto },
  jugador:   { marginBottom: 8 },
  ok:        { fontFamily: fonts.cuerpo, fontSize: 13, color: colors.confirmacion },
  diferencia: { fontFamily: fonts.cuerpo, fontSize: 13, color: colors.oro },
})
