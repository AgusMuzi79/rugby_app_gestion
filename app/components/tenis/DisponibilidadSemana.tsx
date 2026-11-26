import { useMemo, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, useWindowDimensions } from 'react-native'
import { calorTenis, colors, fonts } from '@/constants/theme'
import { ErrorCarga } from '@/components/shared/ErrorCarga'
import { useTenisSemana } from '@/hooks/useTenisSocio'
import { etiquetaDiaCorta, isoArgentina, minutosDeHora, horaDeMinutos, type Modalidad } from '@/lib/tenis'
import { HORA_W, lineaAhora, nivelCalor, paginar, textoDisponibles, type DiaSemana } from '@/lib/tenisGrilla'
import { Chip } from './ui'

// Vista "Semana" (como "Disponib." de OnDepor): tres días por pantalla, se
// pasa de a tres deslizando; cada media hora dice cuántas canchas tienen lugar
// para un turno de esa modalidad, con colores de calor (verde muchas, ámbar,
// naranja pocas, bordó completo). Tocar una celda abre ese día en la grilla.

const DIAS_POR_PAGINA = 3
const CELDA_H = 40

export function DisponibilidadSemana({ desde, dias, ahoraMs, onElegirDia }: {
  desde:       string
  dias:        number
  ahoraMs:     number
  onElegirDia: (fecha: string) => void
}) {
  const ventana = useWindowDimensions()
  const [ancho, setAncho] = useState<number | null>(null)
  const [modalidad, setModalidad] = useState<Modalidad>('singles')
  const { semana, loading, error, refetch } = useTenisSemana(desde, dias, modalidad)
  const paginas = useMemo(() => paginar(semana ?? [], DIAS_POR_PAGINA), [semana])

  const paginaW = ancho ?? ventana.width - 40
  const colW = Math.floor((paginaW - HORA_W) / DIAS_POR_PAGINA)

  return (
    <View onLayout={e => setAncho(e.nativeEvent.layout.width)}>
      <View style={s.modalidades}>
        <Chip texto="SINGLES" activo={modalidad === 'singles'} onPress={() => setModalidad('singles')} />
        <Chip texto="DOBLES" activo={modalidad === 'dobles'} onPress={() => setModalidad('dobles')} />
      </View>
      {loading && !semana ? (
        <ActivityIndicator color={colors.oro} style={s.cargando} />
      ) : error && !semana ? (
        <ErrorCarga mensaje={error} onReintentar={refetch} />
      ) : paginas.length === 0 ? (
        <Text style={s.vacio}>No hay horarios para mostrar.</Text>
      ) : (
        <ScrollView style={{ maxHeight: Math.max(320, ventana.height * 0.7) }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} nestedScrollEnabled>
            {paginas.map(p => (
              <Pagina key={p[0].fecha} dias={p} ancho={paginaW} colW={colW} ahoraMs={ahoraMs} onElegirDia={onElegirDia} />
            ))}
          </ScrollView>
        </ScrollView>
      )}
      {error && semana && <Text style={s.error}>{error}</Text>}
    </View>
  )
}

function Pagina({ dias, ancho, colW, ahoraMs, onElegirDia }: {
  dias: DiaSemana[]; ancho: number; colW: number; ahoraMs: number; onElegirDia: (fecha: string) => void
}) {
  // Las horas de la página: la unión de las de sus días (cada día tiene su horario).
  const horas = useMemo(
    () => [...new Set(dias.flatMap(d => d.slots.map(x => x.hora)))].sort(),
    [dias],
  )
  if (horas.length === 0) return <View style={{ width: ancho }} />
  const primera = horas[0]
  const cfgLinea = { hora_desde: primera, hora_hasta: horaDeMinutos(minutosDeHora(horas[horas.length - 1]) + 30), modulo_min: 30 }

  return (
    <View style={{ width: ancho }}>
      <View style={s.fila}>
        <View style={{ width: HORA_W }} />
        {dias.map(d => (
          <View key={d.fecha} style={[s.encabezado, { width: colW }]}>
            <Text style={s.dia} accessibilityRole="header">{etiquetaDiaCorta(d.fecha)}</Text>
            {!d.abierto ? <Text style={s.soloVer}>Cerrado</Text> : !d.reservable && <Text style={s.soloVer}>Sólo ver</Text>}
          </View>
        ))}
      </View>
      <View style={s.fila}>
        <View style={{ width: HORA_W }}>
          {horas.map(h => <Text key={h} style={s.hora}>{h}</Text>)}
        </View>
        {dias.map(d => {
          const porHora = new Map(d.slots.map(x => [x.hora, x]))
          const linea = lineaAhora(d.fecha, ahoraMs, cfgLinea, CELDA_H)
          return (
            <View key={d.fecha} style={{ width: colW }}>
              {horas.map(h => {
                const slot = porHora.get(h)
                if (!slot) return <View key={h} style={s.celdaVacia} />
                const pasada = Date.parse(isoArgentina(d.fecha, h)) <= ahoraMs
                const calor = calorTenis[nivelCalor(slot.libres, slot.total)]
                const txt = textoDisponibles(slot.libres)
                return (
                  <TouchableOpacity
                    key={h}
                    style={[s.celda, { backgroundColor: calor.fondo }, pasada && s.pasada]}
                    onPress={() => onElegirDia(d.fecha)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`${etiquetaDiaCorta(d.fecha)}, ${h}, ${txt}. Ver el día`}
                  >
                    <Text style={[s.celdaTexto, { color: calor.texto }]} numberOfLines={2}>{txt}</Text>
                  </TouchableOpacity>
                )
              })}
              {linea !== null && <View pointerEvents="none" style={[s.lineaAhora, { top: linea }]} />}
            </View>
          )
        })}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  modalidades: { flexDirection: 'row', gap: 8, marginVertical: 8 },
  cargando:    { marginVertical: 24 },
  vacio:       { fontFamily: fonts.cuerpo, fontSize: 15, fontStyle: 'italic', color: colors.muted, paddingVertical: 8 },
  error:       { fontFamily: fonts.cuerpo, fontSize: 14, color: colors.rojoTexto, marginTop: 8 },
  fila:        { flexDirection: 'row' },
  encabezado:  { alignItems: 'center', paddingBottom: 4 },
  dia:         { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, color: colors.texto },
  soloVer:     { fontFamily: fonts.cuerpo, fontSize: 10, color: colors.textoSecundario },
  hora:        { height: CELDA_H, fontFamily: fonts.mono, fontSize: 10, color: colors.muted, paddingTop: 2 },
  celda:       { height: CELDA_H - 2, marginBottom: 2, marginHorizontal: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  celdaVacia:  { height: CELDA_H },
  celdaTexto:  { fontFamily: fonts.label, fontSize: 11, textAlign: 'center' },
  pasada:      { opacity: 0.4 },
  lineaAhora:  { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: colors.rojoUrgente },
})
