import { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { colors, fonts } from '@/constants/theme'
import { LEYENDA_TENIS, fechaArgentina } from '@/lib/tenis'
import { fechaLarga } from '@/lib/tenisGrilla'

// Barra de arriba de la grilla (como OnDepor): día anterior / siguiente, "Hoy",
// la fecha larga, "N reservas · 8 canchas" y los colores (se despliegan).
// `dias` = los días que se pueden mirar, en orden.

export function NavegadorDia({ dias, fecha, ahoraMs, reservas, canchas, onCambiar }: {
  dias:      string[]
  fecha:     string
  ahoraMs:   number
  reservas:  number | null
  canchas:   number
  onCambiar: (fecha: string) => void
}) {
  const [colores, setColores] = useState(false)
  const i = dias.indexOf(fecha)
  const anterior = i > 0 ? dias[i - 1] : null
  const siguiente = i >= 0 && i < dias.length - 1 ? dias[i + 1] : null
  const hoy = fechaArgentina(ahoraMs)

  return (
    <View style={s.root}>
      <View style={s.fila}>
        <Flecha icono="chevron-left" label="Día anterior" destino={anterior} onCambiar={onCambiar} />
        <View style={s.centro}>
          <Text style={s.fecha} accessibilityRole="header" numberOfLines={1}>{fechaLarga(fecha)}</Text>
          <Text style={s.resumen} numberOfLines={1}>
            {reservas === null ? '' : `${reservas} ${reservas === 1 ? 'reserva' : 'reservas'} · `}{canchas} canchas
          </Text>
        </View>
        <Flecha icono="chevron-right" label="Día siguiente" destino={siguiente} onCambiar={onCambiar} />
      </View>
      <View style={s.fila}>
        <TouchableOpacity
          style={[s.boton, fecha === hoy && s.deshabilitado]}
          onPress={() => onCambiar(hoy)}
          disabled={fecha === hoy || !dias.includes(hoy)}
          accessibilityRole="button"
          accessibilityLabel="Ir a hoy"
        >
          <Text style={s.botonTexto}>Hoy</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.boton}
          onPress={() => setColores(v => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: colores }}
        >
          <Text style={s.botonTexto}>{colores ? 'Ocultar colores' : 'Ver colores'}</Text>
        </TouchableOpacity>
      </View>
      {colores && (
        <View style={s.leyenda}>
          {LEYENDA_TENIS.map(l => (
            <View key={l.etiqueta} style={[s.leyendaItem, { backgroundColor: l.fondo }]}>
              <Text style={[s.leyendaTexto, { color: l.texto }]}>{l.etiqueta}</Text>
            </View>
          ))}
          <View style={s.leyendaItem}><Text style={s.leyendaFijo}>↻ Fijo</Text></View>
        </View>
      )}
    </View>
  )
}

function Flecha({ icono, label, destino, onCambiar }: {
  icono: 'chevron-left' | 'chevron-right'; label: string; destino: string | null; onCambiar: (f: string) => void
}) {
  return (
    <TouchableOpacity
      style={[s.flecha, !destino && s.deshabilitado]}
      onPress={() => destino && onCambiar(destino)}
      disabled={!destino}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !destino }}
    >
      <Feather name={icono} size={24} color={colors.texto} />
    </TouchableOpacity>
  )
}

// "Día | Semana" arriba de la grilla.
export type VistaTenis = 'dia' | 'semana'

export function SelectorVista({ vista, onCambiar }: { vista: VistaTenis; onCambiar: (v: VistaTenis) => void }) {
  const opciones: { v: VistaTenis; texto: string }[] = [{ v: 'dia', texto: 'Día' }, { v: 'semana', texto: 'Semana' }]
  return (
    <View style={s.segmento} accessibilityRole="tablist">
      {opciones.map(o => (
        <TouchableOpacity
          key={o.v}
          style={[s.segmentoOpcion, vista === o.v && s.segmentoActivo]}
          onPress={() => onCambiar(o.v)}
          accessibilityRole="tab"
          accessibilityState={{ selected: vista === o.v }}
        >
          <Text style={[s.segmentoTexto, vista === o.v && s.segmentoTextoActivo]}>{o.texto}</Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  root:                { marginVertical: 8, gap: 6 },
  fila:                { flexDirection: 'row', alignItems: 'center', gap: 8 },
  centro:              { flex: 1, alignItems: 'center' },
  fecha:               { fontFamily: fonts.label, fontSize: 17, color: colors.texto },
  resumen:             { fontFamily: fonts.cuerpo, fontSize: 13, color: colors.textoSecundario },
  flecha:              { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 1, borderColor: colors.bordeRealce },
  boton:               { minHeight: 36, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.bordeRealce, backgroundColor: colors.card },
  botonTexto:          { fontFamily: fonts.label, fontSize: 13, color: colors.texto },
  deshabilitado:       { opacity: 0.4 },
  leyenda:             { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  leyendaItem:         { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4 },
  leyendaTexto:        { fontFamily: fonts.label, fontSize: 11 },
  leyendaFijo:         { fontFamily: fonts.label, fontSize: 11, color: colors.texto },
  segmento:            { flexDirection: 'row', alignSelf: 'flex-start', borderRadius: 20, borderWidth: 1, borderColor: colors.bordeRealce, overflow: 'hidden', marginTop: 8 },
  segmentoOpcion:      { minHeight: 40, minWidth: 88, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, backgroundColor: colors.card },
  segmentoActivo:      { backgroundColor: colors.oro },
  segmentoTexto:       { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, color: colors.texto },
  segmentoTextoActivo: { color: colors.sobreOro },
})
