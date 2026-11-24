import type { ReactNode } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, ScrollView } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { colors, fonts } from '@/constants/theme'
import { LEYENDA_TENIS, type DiaReserva } from '@/lib/tenis'

// Piezas chicas compartidas por las pantallas de tenis (socio, gestor y
// canchero), con los tokens de constants/theme.ts.

export function Chip({ texto, activo, onPress, disabled }: {
  texto: string; activo: boolean; onPress: () => void; disabled?: boolean
}) {
  return (
    <TouchableOpacity
      style={[s.chip, activo && s.chipActivo, disabled && s.deshabilitado]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ selected: activo, disabled }}
    >
      <Text style={[s.chipTexto, activo && s.chipTextoActivo]}>{texto}</Text>
    </TouchableOpacity>
  )
}

export function SelectorDia({ dias, fecha, onElegir }: {
  dias: DiaReserva[]; fecha: string; onElegir: (fecha: string) => void
}) {
  return (
    <View style={s.fila}>
      {dias.map(d => <Chip key={d.fecha} texto={d.etiqueta} activo={d.fecha === fecha} onPress={() => onElegir(d.fecha)} />)}
    </View>
  )
}

export function Leyenda() {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.leyenda}>
      {LEYENDA_TENIS.map(l => (
        <View key={l.etiqueta} style={[s.leyendaItem, { backgroundColor: l.fondo }]}>
          <Text style={[s.leyendaTexto, { color: l.texto }]}>{l.etiqueta}</Text>
        </View>
      ))}
      <View style={s.leyendaItem}>
        <Text style={s.leyendaFijo}>↻ Fijo</Text>
      </View>
    </ScrollView>
  )
}

export function Boton({ texto, onPress, cargando, disabled, variante = 'primario' }: {
  texto: string
  onPress: () => void
  cargando?: boolean
  disabled?: boolean
  variante?: 'primario' | 'secundario' | 'peligro'
}) {
  const estilo = variante === 'primario' ? s.botonPrimario : variante === 'peligro' ? s.botonPeligro : s.botonSecundario
  const color = variante === 'primario' ? colors.sobreOro : variante === 'peligro' ? colors.blanco : colors.oro
  return (
    <TouchableOpacity
      style={[s.boton, estilo, (disabled || cargando) && s.deshabilitado]}
      onPress={onPress}
      disabled={disabled || cargando}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || cargando, busy: cargando }}
    >
      {cargando ? <ActivityIndicator color={color} /> : <Text style={[s.botonTexto, { color }]}>{texto}</Text>}
    </TouchableOpacity>
  )
}

export function Titulo({ children }: { children: ReactNode }) {
  return <Text style={s.titulo} accessibilityRole="header">{children}</Text>
}

export function Aviso({ children, tipo = 'info' }: { children: ReactNode; tipo?: 'info' | 'error' }) {
  return (
    <View accessibilityRole={tipo === 'error' ? 'alert' : undefined}>
      <Text style={tipo === 'error' ? s.avisoError : s.avisoInfo}>{children}</Text>
    </View>
  )
}

// Barra superior de los modales de tenis: título y cerrar (44 pt).
export function BarraModal({ titulo, onCerrar }: { titulo: string; onCerrar: () => void }) {
  return (
    <View style={s.barra}>
      <Text style={s.barraTitulo} accessibilityRole="header">{titulo}</Text>
      <TouchableOpacity onPress={onCerrar} style={s.cerrar} accessibilityRole="button" accessibilityLabel="Cerrar">
        <Feather name="x" size={24} color={colors.texto} />
      </TouchableOpacity>
    </View>
  )
}

export const estilosTenis = StyleSheet.create({
  input:       { minHeight: 44, borderWidth: 1, borderColor: colors.bordeRealce, borderRadius: 4, paddingHorizontal: 12, color: colors.texto, fontFamily: fonts.cuerpo, fontSize: 16, backgroundColor: colors.card },
  label:       { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1.5, color: colors.textoSecundario, marginTop: 12, marginBottom: 6 },
  card:        { backgroundColor: colors.card, borderRadius: 6, borderWidth: 1, borderColor: colors.borde, padding: 14, gap: 4 },
  textoCard:   { fontFamily: fonts.cuerpo, fontSize: 15, color: colors.texto },
  mutedCard:   { fontFamily: fonts.cuerpo, fontSize: 13, color: colors.muted },
  fila:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filaScroll:  { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  sheet:       { flex: 1, backgroundColor: colors.fondo },
  sheetCuerpo: { padding: 20, paddingBottom: 60, gap: 4 },
  vacio:       { fontFamily: fonts.cuerpo, fontSize: 15, fontStyle: 'italic', color: colors.muted, paddingVertical: 8 },
})

const s = StyleSheet.create({
  barra:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.borde },
  barraTitulo:     { fontFamily: fonts.label, fontSize: 14, letterSpacing: 2, color: colors.texto },
  cerrar:          { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  fila:            { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
  chip:            { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.bordeRealce, backgroundColor: colors.card },
  chipActivo:      { backgroundColor: colors.oro, borderColor: colors.oro },
  chipTexto:       { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, color: colors.texto },
  chipTextoActivo: { color: colors.sobreOro },
  deshabilitado:   { opacity: 0.45 },
  leyenda:         { gap: 6, paddingVertical: 6 },
  leyendaItem:     { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4 },
  leyendaTexto:    { fontFamily: fonts.label, fontSize: 11 },
  leyendaFijo:     { fontFamily: fonts.label, fontSize: 11, color: colors.texto },
  boton:           { minHeight: 48, borderRadius: 4, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, marginTop: 12 },
  botonPrimario:   { backgroundColor: colors.oro },
  botonSecundario: { borderWidth: 1, borderColor: colors.oro },
  botonPeligro:    { backgroundColor: colors.rojoUrgente },
  botonTexto:      { fontFamily: fonts.label, fontSize: 14, letterSpacing: 2 },
  titulo:          { fontFamily: fonts.titulo, fontSize: 20, letterSpacing: 1, color: colors.texto, marginTop: 20, marginBottom: 4 },
  avisoInfo:       { fontFamily: fonts.cuerpo, fontSize: 14, color: colors.textoSecundario, marginVertical: 4 },
  avisoError:      { fontFamily: fonts.cuerpo, fontSize: 15, color: colors.rojoTexto, marginVertical: 4 },
})
