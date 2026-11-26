import { useMemo, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native'
import { colors, fonts } from '@/constants/theme'
import {
  bloquesPorCancha, esBloque, estiloItem, filasGrilla, inicioReal, isoArgentina,
  type Cancha, type ItemGrilla, type TenisConfig,
} from '@/lib/tenis'
import { FILA_H, HORA_W, anchoColumna, configDelDia, lineaAhora, nombresBloque, reservasPorCancha } from '@/lib/tenisGrilla'

// Grilla del día como la de OnDepor en el teléfono: todas las canchas entran a
// lo ancho (sin scroll lateral), encabezado fijo con la cancha y cuántas
// reservas tiene, filas altas de 30 minutos y bloques redondeados con el color
// de su tipo y los nombres de todos los jugadores (↻ = bloque fijo). Hoy, una
// línea roja marca la hora. Las celdas libres se tocan para reservar (o
// bloquear, en el gestor). La usan el socio, el gestor y el canchero.

const LINEA_NOMBRE = 11 // alto de una línea de nombre (fontSize 9)

export function GrillaCanchas({
  fecha, config, horario = null, canchas, items, ahoraMs, conDetalle = false, reservable = true,
  onPressItem, onPressLibre,
}: {
  fecha:    string
  config:   TenisConfig
  // Horario de ese día (payload `horario`); sin él, el de la config.
  // abierto = false: ese día las canchas no abren.
  horario?: { desde: string; hasta: string; abierto?: boolean } | null
  canchas:  Cancha[]
  items:    ItemGrilla[]
  ahoraMs:  number
  // Staff: además de los nombres, la hora real de inicio en el bloque.
  conDetalle?:   boolean
  // false: el día se ve pero no se reserva (fuera de la anticipación).
  reservable?:   boolean
  onPressItem?:  (item: ItemGrilla) => void
  onPressLibre?: (canchaId: string, hora: string) => void
}) {
  const ventana = useWindowDimensions()
  const [ancho, setAncho] = useState<number | null>(null)
  const cfg = useMemo(() => configDelDia(config, horario), [config, horario])
  const filas = useMemo(() => filasGrilla(cfg), [cfg])
  const porCancha = useMemo(() => bloquesPorCancha(items, canchas, fecha, cfg), [items, canchas, fecha, cfg])
  const conteo = useMemo(() => reservasPorCancha(items, canchas), [items, canchas])

  if (horario?.abierto === false) {
    return <Text style={s.vacio} accessibilityRole="text">Cerrado: las canchas no abren este día.</Text>
  }
  if (canchas.length === 0) {
    return <Text style={s.vacio}>No hay canchas habilitadas.</Text>
  }

  // Hasta medir el contenedor, el ancho de la pantalla menos el margen típico.
  const colW = anchoColumna(ancho ?? ventana.width - 40, canchas.length)
  const linea = lineaAhora(fecha, ahoraMs, cfg, FILA_H)
  const tocaLibre = reservable && !!onPressLibre

  return (
    <View onLayout={e => setAncho(e.nativeEvent.layout.width)}>
      <ScrollView
        style={{ maxHeight: Math.max(320, ventana.height * 0.7) }}
        stickyHeaderIndices={[0]}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        <View style={s.filaEncabezado}>
          <View style={{ width: HORA_W }} />
          {canchas.map(c => {
            const n = conteo.porCancha[c.id] ?? 0
            return (
              <View key={c.id} style={[s.encabezadoCancha, { width: colW }]} accessible accessibilityRole="header"
                accessibilityLabel={`Cancha ${c.nombre}, ${n} ${n === 1 ? 'reserva' : 'reservas'}`}>
                <Text style={s.cancha} numberOfLines={1}>{c.nombre}</Text>
                <Text style={s.cantidad} numberOfLines={2}>{n} {n === 1 ? 'reserva' : 'reservas'}</Text>
              </View>
            )
          })}
        </View>

        <View style={s.cuerpo}>
          <View style={{ width: HORA_W }}>
            {filas.map(h => <Text key={h} style={s.hora}>{h}</Text>)}
          </View>
          {canchas.map(c => {
            const bloques = porCancha[c.id] ?? []
            const ocupadas = new Set<number>()
            for (const b of bloques) for (let i = b.fila; i < b.fila + b.filas; i++) ocupadas.add(i)
            return (
              <View key={c.id} style={[s.columna, { width: colW, height: filas.length * FILA_H }]}>
                {filas.map((h, i) => {
                  const pasada = Date.parse(isoArgentina(fecha, h)) <= ahoraMs
                  const libre = !ocupadas.has(i) && !pasada && tocaLibre
                  return libre ? (
                    <TouchableOpacity
                      key={h}
                      style={[s.celda, s.celdaLibre]}
                      onPress={() => onPressLibre?.(c.id, h)}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={`Cancha ${c.nombre}, ${h}, libre`}
                    />
                  ) : (
                    <View key={h} style={[s.celda, pasada && s.celdaPasada]} />
                  )
                })}
                {bloques.map((b, i) => {
                  const est = estiloItem(b)
                  const nombres = nombresBloque(b)
                  const hora = esBloque(b) ? null : inicioReal(b.inicio, cfg.margen_inicio_min)
                  const alto = b.filas * FILA_H - 2
                  const conHora = conDetalle && !!hora
                  const lineas = Math.max(1, Math.floor((alto - 6) / LINEA_NOMBRE) - (conHora ? 1 : 0))
                  const contenido = (
                    <>
                      {conHora && <Text style={[s.bloqueHora, { color: est.texto }]} numberOfLines={1}>{hora}</Text>}
                      <Text style={[s.bloqueTexto, { color: est.texto }]} numberOfLines={lineas}>
                        {b.recurrente ? '↻ ' : ''}{nombres.join('\n')}
                      </Text>
                    </>
                  )
                  const estilo = [
                    s.bloque,
                    { top: b.fila * FILA_H + 1, height: alto, backgroundColor: est.fondo },
                    b.mio && s.bloqueMio,
                  ]
                  const label = `Cancha ${c.nombre}, ${est.etiqueta}${hora ? `, arranca ${hora}` : ''}${b.recurrente ? ', fijo' : ''}, ${nombres.join(', ')}`
                  return onPressItem ? (
                    <TouchableOpacity
                      key={`${b.inicio}-${i}`}
                      style={estilo}
                      onPress={() => onPressItem(b)}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel={label}
                    >
                      {contenido}
                    </TouchableOpacity>
                  ) : (
                    <View key={`${b.inicio}-${i}`} style={estilo} accessible accessibilityLabel={label}>{contenido}</View>
                  )
                })}
              </View>
            )
          })}
          {linea !== null && (
            <View pointerEvents="none" style={[s.lineaAhora, { top: linea }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
          )}
        </View>
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  vacio:            { fontFamily: fonts.cuerpo, fontSize: 15, fontStyle: 'italic', color: colors.muted, paddingVertical: 8 },
  filaEncabezado:   { flexDirection: 'row', backgroundColor: colors.fondo, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.borde },
  encabezadoCancha: { alignItems: 'center', paddingHorizontal: 1 },
  cancha:           { fontFamily: fonts.label, fontSize: 13, color: colors.texto },
  cantidad:         { fontFamily: fonts.cuerpo, fontSize: 9, lineHeight: 10, textAlign: 'center', color: colors.textoSecundario },
  cuerpo:           { flexDirection: 'row', position: 'relative' },
  hora:             { height: FILA_H, fontFamily: fonts.mono, fontSize: 10, color: colors.muted, paddingTop: 2 },
  columna:          { position: 'relative', borderLeftWidth: 1, borderLeftColor: colors.borde },
  celda:            { height: FILA_H, borderBottomWidth: 1, borderBottomColor: colors.borde },
  celdaLibre:       { backgroundColor: colors.card },
  celdaPasada:      { opacity: 0.4 },
  bloque:           { position: 'absolute', left: 1, right: 1, borderRadius: 6, paddingHorizontal: 2, paddingVertical: 3, overflow: 'hidden' },
  bloqueMio:        { borderWidth: 2, borderColor: colors.oro },
  bloqueTexto:      { fontFamily: fonts.label, fontSize: 9, lineHeight: LINEA_NOMBRE },
  bloqueHora:       { fontFamily: fonts.mono, fontSize: 9, lineHeight: LINEA_NOMBRE },
  lineaAhora:       { position: 'absolute', left: HORA_W - 4, right: 0, height: 2, backgroundColor: colors.rojoUrgente },
})
