import { useState } from 'react'
import { View, Text, TextInput, ScrollView, ActivityIndicator, RefreshControl, StyleSheet } from 'react-native'
import { colors } from '@/constants/theme'
import { ErrorCarga } from '@/components/shared/ErrorCarga'
import { canceladasParaExportar, compartirCsv, useCanceladas, type FiltrosCanceladas } from '@/hooks/useTenisGestion'
import { CANCELADO_POR, avisoExportacion, csvCanceladas, etiquetaAnticipacion, lineaReserva, rangoPorDefecto, type CanceladoPor } from '@/lib/tenisGestion'
import { HistorialReserva } from './HistorialReserva'
import { Paginador, RangoFechas } from './ListadoReservas'
import { Aviso, Chip, estilosTenis } from './ui'

// Reservas canceladas (`tenis_canceladas_listar`): motivo,
// quién canceló y con cuánta anticipación ("3 h antes", "Después del inicio").
// Por defecto, los últimos 30 días.

export function Canceladas() {
  const [filtros, setFiltros] = useState<FiltrosCanceladas>(() => ({
    ...rangoPorDefecto(Date.now(), -30), q: '', motivo: '', canceladoPor: null,
  }))
  const [q, setQ] = useState('')
  const [motivo, setMotivo] = useState('')
  const [pagina, setPagina] = useState(0)
  const [historial, setHistorial] = useState<string | null>(null)
  const [exportando, setExportando] = useState(false)
  const [errorAccion, setErrorAccion] = useState<string | null>(null)
  const [avisoExport, setAvisoExport] = useState<string | null>(null)
  const { datos, loading, error, refetch } = useCanceladas(filtros, pagina)

  function filtrar(cambio: Partial<FiltrosCanceladas>) {
    setFiltros(f => ({ ...f, ...cambio }))
    setPagina(0)
  }

  async function exportar() {
    setExportando(true)
    setErrorAccion(null)
    setAvisoExport(null)
    try {
      const r = await canceladasParaExportar(filtros)
      if (r.ok) {
        const c = await compartirCsv(`canceladas-tenis_${filtros.desde}_${filtros.hasta}`, csvCanceladas(r.data.items))
        if (!c.ok) setErrorAccion(c.mensaje)
        else setAvisoExport(avisoExportacion(r.data.items.length, r.data.total, 'cancelaciones'))
      } else setErrorAccion(r.mensaje)
    } catch {
      setErrorAccion('No se pudo exportar. Probá de nuevo.')
    } finally {
      setExportando(false)
    }
  }

  return (
    <ScrollView
      contentContainerStyle={s.contenido}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={colors.oro} />}
    >
      <TextInput
        style={estilosTenis.input}
        value={q}
        onChangeText={setQ}
        onEndEditing={() => { if (q !== filtros.q) filtrar({ q }) }}
        placeholder="Buscar por nombre, DNI o nº de socio"
        placeholderTextColor={colors.muted}
        returnKeyType="search"
        accessibilityLabel="Buscar canceladas por nombre, DNI o número de socio"
      />
      <Text style={estilosTenis.label}>MOTIVO</Text>
      <TextInput
        style={estilosTenis.input}
        value={motivo}
        onChangeText={setMotivo}
        onEndEditing={() => { if (motivo !== filtros.motivo) filtrar({ motivo }) }}
        placeholder="Lluvia, mantenimiento…"
        placeholderTextColor={colors.muted}
        accessibilityLabel="Filtrar por motivo"
      />
      <RangoFechas desde={filtros.desde} hasta={filtros.hasta} onCambio={filtrar} />
      <Text style={estilosTenis.label}>CANCELÓ</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilosTenis.filaScroll}>
        <Chip texto="TODOS" activo={!filtros.canceladoPor} onPress={() => filtrar({ canceladoPor: null })} />
        {(Object.keys(CANCELADO_POR) as CanceladoPor[]).map(k => (
          <Chip key={k} texto={CANCELADO_POR[k].toUpperCase()} activo={filtros.canceladoPor === k} onPress={() => filtrar({ canceladoPor: k })} />
        ))}
      </ScrollView>
      <View style={s.acciones}>
        <Chip texto={exportando ? 'EXPORTANDO…' : 'EXPORTAR'} activo={false} disabled={exportando} onPress={exportar} />
      </View>

      {avisoExport && <Aviso>{avisoExport}</Aviso>}
      {errorAccion && <Aviso tipo="error">{errorAccion}</Aviso>}
      {error && <ErrorCarga mensaje={error} onReintentar={refetch} />}
      {loading && datos.items.length === 0 && <ActivityIndicator color={colors.oro} style={s.cargando} />}
      {!loading && !error && datos.items.length === 0 && <Text style={estilosTenis.vacio}>No hay cancelaciones con estos filtros.</Text>}
      {datos.items.length > 0 && <Text style={estilosTenis.mutedCard}>{datos.total} canceladas</Text>}

      {datos.items.map(r => (
        <View key={r.reserva_id} style={[estilosTenis.card, s.fila]}>
          <Text style={estilosTenis.textoCard}>{lineaReserva(r)}</Text>
          <Text style={estilosTenis.mutedCard}>
            {etiquetaAnticipacion(r.anticipacion_min)}
            {r.cancelado_por ? ` · ${r.cancelado_por}` : r.cancelado_por_tipo ? ` · ${CANCELADO_POR[r.cancelado_por_tipo]}` : ''}
          </Text>
          <Text style={estilosTenis.mutedCard}>Motivo: {r.motivo ?? 'sin motivo'}</Text>
          <View style={s.acciones}>
            <Chip texto="HISTORIAL" activo={false} onPress={() => setHistorial(r.reserva_id)} />
          </View>
        </View>
      ))}
      <Paginador pagina={pagina} total={datos.total} onPagina={setPagina} />
      {historial && <HistorialReserva reservaId={historial} onCerrar={() => setHistorial(null)} />}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  contenido: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 60, gap: 4 },
  acciones:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  cargando:  { marginVertical: 24 },
  fila:      { marginTop: 8 },
})
