import type { ReactNode } from 'react'
import { Modal, View, Text, TouchableOpacity, StatusBar, ActivityIndicator, StyleSheet, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { colors, fonts } from '@/constants/theme'
import type { Cancha, ItemGrilla, TenisConfig } from '@/lib/tenis'
import { BARRA_PANTALLA_COMPLETA_H, FILA_H_COMPACTA, fechaLarga, layoutPantallaCompleta } from '@/lib/tenisGrilla'
import { GrillaCanchas } from './GrillaCanchas'

// Grilla del día "acostada" para la gestora y el canchero: la app está fija en
// vertical y no se suman módulos nativos (sale por OTA), así que la vista se
// gira 90° con un transform y se usa con el teléfono de costado. Entran las 8
// canchas más anchas, más horas y los nombres completos. Arriba, una barra
// chica con el día anterior / siguiente y ✕. `children`: los modales que se
// abren desde la grilla (detalle, reserva, bloqueo), así se ven encima.

export function GrillaPantallaCompleta({
  fecha, dias, onCambiar, onCerrar, cargando = false, reservas, config, horario, canchas, items, ahoraMs, conDetalle,
  onPressItem, onPressLibre, children,
}: {
  fecha:     string
  // Días que se pueden mirar, en orden (con uno solo no hay flechas).
  dias:      string[]
  onCambiar?: (fecha: string) => void
  onCerrar:  () => void
  // Cambiando de día: la grilla nueva todavía no llegó.
  cargando?: boolean
  reservas:  number | null
  config:    TenisConfig
  horario?:  { desde: string; hasta: string; abierto?: boolean } | null
  canchas:   Cancha[]
  items:     ItemGrilla[]
  ahoraMs:   number
  conDetalle?:   boolean
  onPressItem?:  (item: ItemGrilla) => void
  onPressLibre?: (canchaId: string, hora: string) => void
  children?: ReactNode
}) {
  const ventana = useWindowDimensions()
  const seguro = useSafeAreaInsets()
  const l = layoutPantallaCompleta(ventana, seguro)
  const i = dias.indexOf(fecha)
  const anterior = i > 0 ? dias[i - 1] : null
  const siguiente = i >= 0 && i < dias.length - 1 ? dias[i + 1] : null
  const conFlechas = !!onCambiar && dias.length > 1

  return (
    <Modal visible animationType="fade" onRequestClose={onCerrar} statusBarTranslucent>
      <StatusBar hidden />
      <View style={s.fondo}>
        <View style={[s.vista, l.vista, {
          paddingTop: l.relleno.top, paddingRight: l.relleno.right, paddingBottom: l.relleno.bottom, paddingLeft: l.relleno.left,
        }]}>
          <View style={s.barra}>
            {conFlechas && <Flecha icono="chevron-left" label="Día anterior" destino={anterior} onCambiar={onCambiar} />}
            <Text style={s.fecha} numberOfLines={1} accessibilityRole="header">
              {fechaLarga(fecha)}
              {reservas !== null && <Text style={s.resumen}>{` · ${reservas} ${reservas === 1 ? 'reserva' : 'reservas'}`}</Text>}
            </Text>
            {conFlechas && <Flecha icono="chevron-right" label="Día siguiente" destino={siguiente} onCambiar={onCambiar} />}
            <TouchableOpacity style={s.boton} onPress={onCerrar} accessibilityRole="button" accessibilityLabel="Salir de pantalla completa">
              <Feather name="x" size={22} color={colors.texto} />
            </TouchableOpacity>
          </View>
          {cargando ? <ActivityIndicator color={colors.oro} style={s.cargando} /> : (
          <GrillaCanchas
            fecha={fecha}
            config={config}
            horario={horario}
            canchas={canchas}
            items={items}
            ahoraMs={ahoraMs}
            conDetalle={conDetalle}
            onPressItem={onPressItem}
            onPressLibre={onPressLibre}
            ancho={l.ancho}
            altoMax={l.alto}
            filaH={FILA_H_COMPACTA}
          />
          )}
        </View>
      </View>
      {children}
    </Modal>
  )
}

function Flecha({ icono, label, destino, onCambiar }: {
  icono: 'chevron-left' | 'chevron-right'; label: string; destino: string | null; onCambiar?: (f: string) => void
}) {
  return (
    <TouchableOpacity
      style={[s.boton, !destino && s.deshabilitado]}
      onPress={() => destino && onCambiar?.(destino)}
      disabled={!destino}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !destino }}
    >
      <Feather name={icono} size={22} color={colors.texto} />
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  fondo:         { flex: 1, backgroundColor: colors.fondo },
  vista:         { position: 'absolute', backgroundColor: colors.fondo, transform: [{ rotate: '90deg' }] },
  barra:         { height: BARRA_PANTALLA_COMPLETA_H, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  fecha:         { flex: 1, fontFamily: fonts.label, fontSize: 15, color: colors.texto },
  resumen:       { fontFamily: fonts.cuerpo, fontSize: 13, color: colors.textoSecundario },
  boton:         { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, borderWidth: 1, borderColor: colors.bordeRealce },
  deshabilitado: { opacity: 0.4 },
  cargando:      { marginTop: 24 },
})
