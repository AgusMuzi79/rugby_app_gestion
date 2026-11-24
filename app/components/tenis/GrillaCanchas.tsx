import { useMemo } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native'
import { colors, fonts } from '@/constants/theme'
import {
  bloquesPorCancha, esBloque, estiloItem, filasGrilla, inicioReal, isoArgentina,
  type Cancha, type ItemGrilla, type ItemPosicionado, type TenisConfig,
} from '@/lib/tenis'

// Grilla del día: una columna por cancha y una fila cada 30 minutos (08:00 a
// 22:00). Cada reserva o bloque se pinta con el color de OnDepor de su tipo y
// ↻ si es un bloque fijo. Las celdas libres se tocan para reservar (o
// bloquear, en el gestor). La usan el socio, el gestor y el canchero.

const FILA_H  = 32
const COL_W   = 84
const HORA_W  = 52

// Sin detalle (socio) una reserva ajena muestra sólo su tipo, nunca nombres.
function textoBloque(it: ItemPosicionado, conDetalle: boolean): string {
  if (it.mio) return 'TU RESERVA'
  const estilo = estiloItem(it)
  if (esBloque(it)) return it.titulo || estilo.etiqueta
  if (!conDetalle) return estilo.etiqueta
  const titular = it.jugadores?.find(j => j.es_titular)?.nombre
  return titular ?? it.titulo ?? estilo.etiqueta
}

export function GrillaCanchas({
  fecha, config, canchas, items, ahoraMs, conDetalle = false, onPressItem, onPressLibre,
}: {
  fecha:    string
  config:   TenisConfig
  canchas:  Cancha[]
  items:    ItemGrilla[]
  ahoraMs:  number
  // El gestor y el canchero ven el titular; el socio sólo "Ocupada".
  conDetalle?:   boolean
  onPressItem?:  (item: ItemGrilla) => void
  onPressLibre?: (canchaId: string, hora: string) => void
}) {
  const filas = useMemo(() => filasGrilla(config), [config])
  const porCancha = useMemo(() => bloquesPorCancha(items, canchas, fecha, config), [items, canchas, fecha, config])

  if (canchas.length === 0) {
    return <Text style={s.vacio}>No hay canchas habilitadas.</Text>
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.contenedor}>
      <View>
        <View style={s.filaEncabezado}>
          <View style={{ width: HORA_W }} />
          {canchas.map(c => (
            <Text key={c.id} style={s.cancha} accessibilityRole="header">CANCHA {c.nombre}</Text>
          ))}
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
              <View key={c.id} style={[s.columna, { height: filas.length * FILA_H }]}>
                {filas.map((h, i) => {
                  const pasada = Date.parse(isoArgentina(fecha, h)) <= ahoraMs
                  const libre = !ocupadas.has(i) && !pasada && !!onPressLibre
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
                  const etiqueta = textoBloque(b, conDetalle)
                  const hora = esBloque(b) ? null : inicioReal(b.inicio, config.margen_inicio_min)
                  const contenido = (
                    <>
                      <Text style={[s.bloqueTexto, { color: est.texto }]} numberOfLines={b.filas > 1 ? 2 : 1}>
                        {b.recurrente ? '↻ ' : ''}{etiqueta}
                      </Text>
                      {hora && b.filas > 1 && <Text style={[s.bloqueHora, { color: est.texto }]}>{hora}</Text>}
                    </>
                  )
                  const estilo = [
                    s.bloque,
                    { top: b.fila * FILA_H + 1, height: b.filas * FILA_H - 2, backgroundColor: est.fondo },
                    b.mio && s.bloqueMio,
                  ]
                  const label = `Cancha ${c.nombre}, ${est.etiqueta}${hora ? `, arranca ${hora}` : ''}${b.recurrente ? ', fijo' : ''}`
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
        </View>
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  contenedor:     { paddingBottom: 8 },
  vacio:          { fontFamily: fonts.cuerpo, fontSize: 15, fontStyle: 'italic', color: colors.muted, paddingVertical: 8 },
  filaEncabezado: { flexDirection: 'row', marginBottom: 4 },
  cancha:         { width: COL_W, textAlign: 'center', fontFamily: fonts.label, fontSize: 11, letterSpacing: 1, color: colors.textoSecundario },
  cuerpo:         { flexDirection: 'row' },
  hora:           { height: FILA_H, fontFamily: fonts.mono, fontSize: 11, color: colors.muted, paddingTop: 2 },
  columna:        { width: COL_W, position: 'relative', borderLeftWidth: 1, borderLeftColor: colors.borde },
  celda:          { height: FILA_H, borderBottomWidth: 1, borderBottomColor: colors.borde },
  celdaLibre:     { backgroundColor: colors.card },
  celdaPasada:    { opacity: 0.4 },
  bloque:         { position: 'absolute', left: 2, right: 2, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2, justifyContent: 'center' },
  bloqueMio:      { borderWidth: 2, borderColor: colors.oro },
  bloqueTexto:    { fontFamily: fonts.label, fontSize: 11 },
  bloqueHora:     { fontFamily: fonts.mono, fontSize: 10 },
})
