import { useState } from 'react'
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native'
import { colors, fonts } from '@/constants/theme'
import { ErrorCarga } from '@/components/shared/ErrorCarga'
import { compartirCsv, useReporte } from '@/hooks/useTenisGestion'
import {
  REPORTES, columnasReporte, csvReporte, etiquetaColumna, metricaReporte, rangoPorDefecto, type FilaReporte, type TipoReporte,
} from '@/lib/tenisGestion'
import { RangoFechas } from './ListadoReservas'
import { Aviso, Chip, estilosTenis } from './ui'

// Los 7 reportes de OnDepor (`tenis_reporte`): uso por mes / día / hora,
// general, por tipo de reserva y rankings de reservas y de cancelaciones. Una
// tabla simple con barra en la columna principal, y exportar a CSV.

function valorCelda(v: FilaReporte[string], col: string): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number' && (col === 'porcentaje' || col === 'cumplimiento' || col === 'uso')) return `${Math.round(v * 10) / 10} %`
  return String(v)
}

export function Reportes() {
  const [tipo, setTipo] = useState<TipoReporte>('uso_mensual')
  const [rango, setRango] = useState(() => rangoPorDefecto(Date.now(), -30))
  const [errorAccion, setErrorAccion] = useState<string | null>(null)
  const { datos: filas, loading, error, refetch } = useReporte(tipo, rango.desde, rango.hasta, true)

  const columnas = columnasReporte(filas)
  const metrica = metricaReporte(tipo, filas)
  const maximo = metrica ? Math.max(1, ...filas.map(f => (typeof f[metrica] === 'number' ? f[metrica] as number : 0))) : 1
  // Porcentajes contra 100; el resto contra el máximo de la tabla.
  const tope = metrica === 'porcentaje' || metrica === 'uso' ? Math.max(100, maximo) : maximo
  const etiqueta = columnas.find(c => c !== metrica) ?? null

  async function exportar() {
    setErrorAccion(null)
    const c = await compartirCsv(`reporte-tenis_${tipo}_${rango.desde}_${rango.hasta}`, csvReporte(filas))
    if (!c.ok) setErrorAccion(c.mensaje)
  }

  return (
    <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
      <Text style={estilosTenis.label}>REPORTE</Text>
      <View style={estilosTenis.fila}>
        {REPORTES.map(r => <Chip key={r.tipo} texto={r.label.toUpperCase()} activo={tipo === r.tipo} onPress={() => setTipo(r.tipo)} />)}
      </View>
      <RangoFechas desde={rango.desde} hasta={rango.hasta} onCambio={setRango} />
      <View style={s.acciones}>
        <Chip texto="EXPORTAR" activo={false} disabled={filas.length === 0} onPress={exportar} />
      </View>
      {errorAccion && <Aviso tipo="error">{errorAccion}</Aviso>}
      {error && <ErrorCarga mensaje={error} onReintentar={refetch} />}
      {loading && <ActivityIndicator color={colors.oro} style={s.cargando} />}
      {!loading && !error && filas.length === 0 && <Text style={estilosTenis.vacio}>No hay datos en ese rango.</Text>}

      {!loading && metrica && etiqueta && filas.length > 0 && (
        <View style={[estilosTenis.card, s.barras]}>
          {filas.slice(0, 30).map((f, i) => {
            const v = typeof f[metrica] === 'number' ? f[metrica] as number : 0
            return (
              <View key={i} style={s.barraFila} accessible accessibilityLabel={`${valorCelda(f[etiqueta], etiqueta)}: ${valorCelda(v, metrica)}`}>
                <Text style={s.barraEtiqueta} numberOfLines={1}>{valorCelda(f[etiqueta], etiqueta)}</Text>
                <View style={s.barraTrack}>
                  <View style={[s.barra, { width: `${Math.min(100, (v / tope) * 100)}%` }]} />
                </View>
                <Text style={s.barraValor}>{valorCelda(v, metrica)}</Text>
              </View>
            )
          })}
        </View>
      )}

      {!loading && filas.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View style={s.tabla}>
            <View style={[s.tablaFila, s.tablaEncabezado]}>
              {columnas.map(c => <Text key={c} style={[s.celda, s.celdaEncabezado]}>{etiquetaColumna(c)}</Text>)}
            </View>
            {filas.map((f, i) => (
              <View key={i} style={s.tablaFila}>
                {columnas.map(c => <Text key={c} style={s.celda}>{valorCelda(f[c], c)}</Text>)}
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  contenido:       { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 60, gap: 4 },
  acciones:        { flexDirection: 'row', gap: 8, marginTop: 8 },
  cargando:        { marginVertical: 24 },
  barras:          { marginTop: 12, gap: 8 },
  barraFila:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barraEtiqueta:   { width: 96, fontFamily: fonts.cuerpo, fontSize: 13, color: colors.texto },
  barraTrack:      { flex: 1, height: 12, borderRadius: 6, backgroundColor: colors.borde, overflow: 'hidden' },
  barra:           { height: 12, borderRadius: 6, backgroundColor: colors.oro },
  barraValor:      { minWidth: 56, textAlign: 'right', fontFamily: fonts.cuerpo, fontSize: 13, color: colors.textoSecundario },
  tabla:           { marginTop: 12, borderWidth: 1, borderColor: colors.borde, borderRadius: 6 },
  tablaFila:       { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.borde },
  tablaEncabezado: { backgroundColor: colors.card },
  celda:           { width: 120, paddingHorizontal: 8, paddingVertical: 8, fontFamily: fonts.cuerpo, fontSize: 13, color: colors.texto },
  celdaEncabezado: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1, color: colors.textoSecundario },
})
