import { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { colors, fonts } from '@/constants/theme'
import { useNovedadesTenis } from '@/hooks/useTenisSocio'
import { estilosTenis } from './ui'

// Novedades de tenis en la hoja del socio (cartelera de la gestora): las
// destacadas primero. Plegada muestra sólo la primera; tocar el encabezado
// las muestra todas. Sin novedades (o si no cargan) no ocupa lugar: no es lo
// principal de la pantalla.

export function NovedadesTenis() {
  const { novedades, error } = useNovedadesTenis()
  const [abierta, setAbierta] = useState(false)

  if (error || novedades.length === 0) return null
  const visibles = abierta ? novedades : novedades.slice(0, 1)
  const resto = novedades.length - 1

  return (
    <View style={s.root}>
      <TouchableOpacity
        style={s.encabezado}
        onPress={() => setAbierta(a => !a)}
        disabled={resto === 0}
        accessibilityRole="button"
        accessibilityState={{ expanded: abierta }}
        accessibilityLabel={abierta ? 'Mostrar menos novedades' : `Novedades de tenis: ${novedades.length}`}
      >
        <Text style={[estilosTenis.label, s.label]}>NOVEDADES</Text>
        {resto > 0 && (
          <>
            <Text style={s.mas}>{abierta ? 'VER MENOS' : `VER TODAS (${novedades.length})`}</Text>
            <Feather name={abierta ? 'chevron-up' : 'chevron-down'} size={18} color={colors.oro} />
          </>
        )}
      </TouchableOpacity>
      {visibles.map(n => (
        <View key={n.id} style={[estilosTenis.card, s.card, n.destacada && s.destacada]}>
          {n.destacada && <Text style={s.marca}>DESTACADA</Text>}
          {!!n.titulo && <Text style={s.titulo}>{n.titulo}</Text>}
          {!!n.texto && <Text style={estilosTenis.textoCard} numberOfLines={abierta ? undefined : 3}>{n.texto}</Text>}
        </View>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  root:       { marginTop: 8 },
  encabezado: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  label:      { flex: 1, marginTop: 0, marginBottom: 0 },
  mas:        { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, color: colors.oro },
  card:       { marginBottom: 8 },
  destacada:  { borderColor: colors.oro },
  marca:      { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1.5, color: colors.oro },
  titulo:     { fontFamily: fonts.label, fontSize: 16, letterSpacing: 0.5, color: colors.texto },
})
