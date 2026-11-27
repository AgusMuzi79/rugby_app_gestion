import { useEffect, useState } from 'react'
import { View, Text, TextInput, Modal, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { colors } from '@/constants/theme'
import { ErrorCarga } from '@/components/shared/ErrorCarga'
import {
  LIMITE_PAGINA, accionesGestion, compartirCsv, reservasParaExportar, useCanchasTenis, useReservasListado,
  type FiltrosReservas,
} from '@/hooks/useTenisGestion'
import { ESTADOS_RESERVA } from '@/lib/tenis'
import { ORIGENES, avisoExportacion, csvReservas, lineaReserva, paginas, rangoPorDefecto, validarRango } from '@/lib/tenisGestion'
import { HistorialReserva } from './HistorialReserva'
import { Aviso, BarraModal, Boton, Chip, estilosTenis } from './ui'

// Listado de reservas de la gestora (`tenis_reservas_listar`), como el de
// OnDepor: búsqueda por nombre / DNI / nº de socio, rango de fechas (hoy a +7),
// cancha, origen y estado, paginado; historial y cancelar por fila; selección
// múltiple para cancelar varias (avisa a los jugadores) y exportar a CSV.

// ─── Piezas compartidas con Canceladas y Reportes ─────────────────────────────

export function RangoFechas({ desde, hasta, onCambio }: {
  desde: string; hasta: string; onCambio: (r: { desde: string; hasta: string }) => void
}) {
  const [d, setD] = useState(desde)
  const [h, setH] = useState(hasta)
  const [error, setError] = useState<string | null>(null)
  function aplicar() {
    const e = validarRango(d, h)
    setError(e)
    if (!e) onCambio({ desde: d, hasta: h })
  }
  return (
    <View>
      <View style={s.filaRango}>
        <View style={s.flex}>
          <Text style={estilosTenis.label}>DESDE</Text>
          <TextInput style={estilosTenis.input} value={d} onChangeText={setD} onEndEditing={aplicar} placeholder="AAAA-MM-DD"
            placeholderTextColor={colors.muted} accessibilityLabel="Desde (AAAA-MM-DD)" />
        </View>
        <View style={s.flex}>
          <Text style={estilosTenis.label}>HASTA</Text>
          <TextInput style={estilosTenis.input} value={h} onChangeText={setH} onEndEditing={aplicar} placeholder="AAAA-MM-DD"
            placeholderTextColor={colors.muted} accessibilityLabel="Hasta (AAAA-MM-DD)" />
        </View>
      </View>
      {error && <Aviso tipo="error">{error}</Aviso>}
    </View>
  )
}

export function Paginador({ pagina, total, onPagina }: { pagina: number; total: number; onPagina: (p: number) => void }) {
  const n = paginas(total, LIMITE_PAGINA)
  if (n <= 1) return null
  return (
    <View style={s.paginador}>
      <Chip texto="‹ ANTERIOR" activo={false} disabled={pagina === 0} onPress={() => onPagina(pagina - 1)} />
      <Text style={estilosTenis.mutedCard}>Página {pagina + 1} de {n}</Text>
      <Chip texto="SIGUIENTE ›" activo={false} disabled={pagina >= n - 1} onPress={() => onPagina(pagina + 1)} />
    </View>
  )
}

// Pide un motivo antes de cancelar (una o varias reservas).
export function MotivoCancelacion({ titulo, detalle, obligatorio, onConfirmar, onCerrar }: {
  titulo: string
  detalle: string
  obligatorio?: boolean
  onConfirmar: (motivo: string) => Promise<string | null> // mensaje de error o null
  onCerrar: () => void
}) {
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  async function confirmar() {
    if (obligatorio && !motivo.trim()) { setError('Escribí el motivo: les llega a los jugadores.'); return }
    setOcupado(true)
    setError(null)
    try {
      const e = await onConfirmar(motivo.trim())
      if (e) setError(e)
    } catch {
      setError('No se pudo cancelar. Probá de nuevo.')
    } finally {
      setOcupado(false)
    }
  }
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onCerrar}>
      <SafeAreaView style={estilosTenis.sheet}>
        <BarraModal titulo={titulo} onCerrar={onCerrar} />
        <View style={estilosTenis.sheetCuerpo}>
          <Text style={estilosTenis.textoCard}>{detalle}</Text>
          <Text style={estilosTenis.label}>MOTIVO{obligatorio ? '' : ' (OPCIONAL)'}</Text>
          <TextInput
            style={[estilosTenis.input, s.motivo]}
            value={motivo}
            onChangeText={setMotivo}
            placeholder="Lluvia, mantenimiento, lo pidió el titular…"
            placeholderTextColor={colors.muted}
            multiline
            maxLength={280}
            accessibilityLabel="Motivo de la cancelación"
          />
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Boton texto="CANCELAR RESERVA" variante="peligro" cargando={ocupado} onPress={confirmar} />
        </View>
      </SafeAreaView>
    </Modal>
  )
}

// ─── Listado ──────────────────────────────────────────────────────────────────

const ESTADOS_FILTRO = ['confirmada', 'jugada', 'no_show', 'cancelada', 'pendiente_comprobante', 'pendiente_confirmacion']
const CANCELABLE = ['confirmada', 'pendiente_comprobante', 'pendiente_confirmacion']

export function ListadoReservas() {
  const [filtros, setFiltros] = useState<FiltrosReservas>(() => ({
    ...rangoPorDefecto(Date.now()), q: '', canchaId: null, origen: null, estado: null,
  }))
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(0)
  const [verFiltros, setVerFiltros] = useState(false)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [historial, setHistorial] = useState<string | null>(null)
  const [cancelando, setCancelando] = useState<string[] | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [exportando, setExportando] = useState(false)
  const [errorAccion, setErrorAccion] = useState<string | null>(null)
  const canchas = useCanchasTenis()
  const { datos, loading, error, refetch } = useReservasListado(filtros, pagina)
  // Si al cancelar se achica el total, no quedarse en una página que ya no existe.
  useEffect(() => {
    const n = paginas(datos.total, LIMITE_PAGINA)
    if (!loading && pagina > 0 && pagina >= n) setPagina(Math.max(0, n - 1))
  }, [datos.total, loading, pagina])

  function filtrar(cambio: Partial<FiltrosReservas>) {
    setFiltros(f => ({ ...f, ...cambio }))
    setPagina(0)
    setSeleccion(new Set())
  }

  function alternar(id: string) {
    setSeleccion(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  async function exportar() {
    setExportando(true)
    setErrorAccion(null)
    setAviso(null)
    try {
      const r = await reservasParaExportar(filtros)
      if (r.ok) {
        const c = await compartirCsv(`reservas-tenis_${filtros.desde}_${filtros.hasta}`, csvReservas(r.data.items))
        if (!c.ok) setErrorAccion(c.mensaje)
        else setAviso(avisoExportacion(r.data.items.length, r.data.total, 'reservas'))
      } else setErrorAccion(r.mensaje)
    } catch {
      setErrorAccion('No se pudo exportar. Probá de nuevo.')
    } finally {
      setExportando(false)
    }
  }

  async function confirmarCancelacion(ids: string[], motivo: string): Promise<string | null> {
    if (ids.length === 1) {
      const r = await accionesGestion.cancelar(ids[0], motivo || null)
      if (!r.ok) return r.mensaje
      setAviso('Reserva cancelada.')
    } else {
      const r = await accionesGestion.cancelarVarias(ids, motivo)
      if (!r.ok) return r.mensaje
      setAviso(`Se cancelaron ${r.data.canceladas} reservas${r.data.omitidas ? ` (${r.data.omitidas} no se pudieron: ya jugadas o canceladas)` : ''}. Les avisamos a los jugadores.`)
    }
    setCancelando(null)
    setSeleccion(new Set())
    refetch()
    return null
  }

  const seleccionadas = [...seleccion]

  return (
    <View style={s.flex}>
      <ScrollView
        contentContainerStyle={s.contenido}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={colors.oro} />}
      >
        <TextInput
          style={estilosTenis.input}
          value={busqueda}
          onChangeText={setBusqueda}
          onSubmitEditing={() => filtrar({ q: busqueda })}
          onEndEditing={() => { if (busqueda !== filtros.q) filtrar({ q: busqueda }) }}
          placeholder="Buscar por nombre, DNI o nº de socio"
          placeholderTextColor={colors.muted}
          returnKeyType="search"
          accessibilityLabel="Buscar reservas por nombre, DNI o número de socio"
        />
        <RangoFechas desde={filtros.desde} hasta={filtros.hasta} onCambio={filtrar} />
        <View style={s.filaAcciones}>
          <Chip texto={verFiltros ? 'OCULTAR FILTROS' : 'MÁS FILTROS'} activo={verFiltros} onPress={() => setVerFiltros(v => !v)} />
          <Chip texto={exportando ? 'EXPORTANDO…' : 'EXPORTAR'} activo={false} disabled={exportando} onPress={exportar} />
        </View>
        {verFiltros && (
          <>
            <Text style={estilosTenis.label}>CANCHA</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilosTenis.filaScroll}>
              <Chip texto="TODAS" activo={!filtros.canchaId} onPress={() => filtrar({ canchaId: null })} />
              {canchas.map(c => <Chip key={c.id} texto={c.nombre} activo={filtros.canchaId === c.id} onPress={() => filtrar({ canchaId: c.id })} />)}
            </ScrollView>
            <Text style={estilosTenis.label}>ORIGEN</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilosTenis.filaScroll}>
              <Chip texto="TODOS" activo={!filtros.origen} onPress={() => filtrar({ origen: null })} />
              {Object.entries(ORIGENES).map(([k, v]) => (
                <Chip key={k} texto={v.toUpperCase()} activo={filtros.origen === k} onPress={() => filtrar({ origen: k })} />
              ))}
            </ScrollView>
            <Text style={estilosTenis.label}>ESTADO</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilosTenis.filaScroll}>
              <Chip texto="TODOS" activo={!filtros.estado} onPress={() => filtrar({ estado: null })} />
              {ESTADOS_FILTRO.map(k => (
                <Chip key={k} texto={(ESTADOS_RESERVA[k] ?? k).toUpperCase()} activo={filtros.estado === k} onPress={() => filtrar({ estado: k })} />
              ))}
            </ScrollView>
          </>
        )}

        {aviso && <Aviso>{aviso}</Aviso>}
        {errorAccion && <Aviso tipo="error">{errorAccion}</Aviso>}
        {error && <ErrorCarga mensaje={error} onReintentar={refetch} />}
        {loading && datos.items.length === 0 && <ActivityIndicator color={colors.oro} style={s.cargando} />}
        {!loading && !error && datos.items.length === 0 && <Text style={estilosTenis.vacio}>No hay reservas con estos filtros.</Text>}
        {datos.items.length > 0 && <Text style={estilosTenis.mutedCard}>{datos.total} reservas</Text>}

        {datos.items.map(r => {
          const cancelable = !!r.estado && CANCELABLE.includes(r.estado)
          const marcada = seleccion.has(r.reserva_id)
          return (
            <View key={r.reserva_id} style={[estilosTenis.card, s.fila, marcada && s.filaMarcada]}>
              <View style={s.filaTop}>
                {cancelable && (
                  <TouchableOpacity
                    onPress={() => alternar(r.reserva_id)}
                    style={s.check}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: marcada }}
                    accessibilityLabel="Seleccionar reserva"
                  >
                    <Feather name={marcada ? 'check-square' : 'square'} size={22} color={marcada ? colors.oro : colors.textoSecundario} />
                  </TouchableOpacity>
                )}
                <Text style={[estilosTenis.textoCard, s.flex]}>{lineaReserva(r)}</Text>
              </View>
              <Text style={estilosTenis.mutedCard}>
                {(r.origen && ORIGENES[r.origen]) || r.origen || '—'} · {(r.estado && ESTADOS_RESERVA[r.estado]) || r.estado || '—'}
              </Text>
              {!!r.comentario && <Text style={estilosTenis.mutedCard}>“{r.comentario}”</Text>}
              <View style={s.filaAcciones}>
                <Chip texto="HISTORIAL" activo={false} onPress={() => setHistorial(r.reserva_id)} />
                {cancelable && <Chip texto="CANCELAR" activo={false} onPress={() => { setAviso(null); setCancelando([r.reserva_id]) }} />}
              </View>
            </View>
          )
        })}
        <Paginador pagina={pagina} total={datos.total} onPagina={p => { setPagina(p); setSeleccion(new Set()) }} />
      </ScrollView>

      {seleccionadas.length > 0 && (
        <View style={s.barraSeleccion}>
          <Text style={[estilosTenis.textoCard, s.flex]}>{seleccionadas.length} seleccionadas</Text>
          <Boton texto="CANCELAR SELECCIONADAS" variante="peligro" onPress={() => { setAviso(null); setCancelando(seleccionadas) }} />
        </View>
      )}

      {historial && <HistorialReserva reservaId={historial} onCerrar={() => setHistorial(null)} />}
      {cancelando && (
        <MotivoCancelacion
          titulo={cancelando.length === 1 ? 'CANCELAR RESERVA' : `CANCELAR ${cancelando.length} RESERVAS`}
          detalle={cancelando.length === 1
            ? 'La reserva se cancela y el turno queda libre. Si corresponde devolver plata, la devolución es en efectivo por administración.'
            : 'Se cancelan todas las reservas seleccionadas y les avisamos a los jugadores por push y mail con este motivo.'}
          obligatorio={cancelando.length > 1}
          onConfirmar={m => confirmarCancelacion(cancelando, m)}
          onCerrar={() => setCancelando(null)}
        />
      )}
    </View>
  )
}

const s = StyleSheet.create({
  flex:           { flex: 1 },
  contenido:      { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 120, gap: 4 },
  filaRango:      { flexDirection: 'row', gap: 12 },
  filaAcciones:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  cargando:       { marginVertical: 24 },
  fila:           { marginTop: 8 },
  filaMarcada:    { borderColor: colors.oro },
  filaTop:        { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  check:          { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10, marginTop: -10 },
  paginador:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  motivo:         { minHeight: 96, textAlignVertical: 'top', paddingTop: 10 },
  barraSeleccion: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 12,
    borderTopWidth: 1, borderTopColor: colors.borde, backgroundColor: colors.card,
  },
})
