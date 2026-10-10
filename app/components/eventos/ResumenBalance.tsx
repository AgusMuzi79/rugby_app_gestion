import { View, Text, StyleSheet } from 'react-native'
import { fonts } from '@/constants/theme'
import type { BalanceEvento } from '@/lib/balanceEvento'
import { CARD, DIVIDER, MUTED, ROJO, TEXTO, VERDE, formatMonto } from './estilo'

// Tarjeta Cobrado / Egresos / Neto de un evento financiero.
export function ResumenBalance({ balance }: { balance: BalanceEvento }) {
  const { totalCobrado, totalEgresos, neto } = balance
  return (
    <View style={s.card}>
      <View style={s.item}>
        <Text style={[s.val, s.valTexto]} numberOfLines={1} adjustsFontSizeToFit>{formatMonto(totalCobrado)}</Text>
        <Text style={s.label}>COBRADO</Text>
      </View>
      <View style={s.div} />
      <View style={s.item}>
        <Text style={[s.val, s.valRojo]} numberOfLines={1} adjustsFontSizeToFit>{formatMonto(totalEgresos)}</Text>
        <Text style={s.label}>EGRESOS</Text>
      </View>
      <View style={s.div} />
      <View style={s.item}>
        <Text style={[s.val, neto < 0 ? s.valRojo : s.valVerde]} numberOfLines={1} adjustsFontSizeToFit>
          {formatMonto(neto)}
        </Text>
        <Text style={s.label}>NETO</Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  card:     { flexDirection: 'row', borderWidth: 1, borderColor: DIVIDER, borderRadius: 4, backgroundColor: CARD, paddingVertical: 14, paddingHorizontal: 8 },
  item:     { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 4 },
  div:      { width: 1, backgroundColor: DIVIDER, marginVertical: 4 },
  label:    { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1.5, color: MUTED },
  val:      { fontFamily: fonts.cuerpo, fontSize: 17, fontWeight: '700' },
  valTexto: { color: TEXTO },
  valVerde: { color: VERDE },
  valRojo:  { color: ROJO },
})
