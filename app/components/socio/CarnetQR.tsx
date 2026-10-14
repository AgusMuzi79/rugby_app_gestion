import { memo, useEffect, useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { secondsUntilRefresh } from '@/lib/totp-client'
import { colors, fonts } from '@/constants/theme'

// QR del carnet. Memoizado sobre `value` (qrContent): sólo se vuelve a dibujar
// el SVG cuando cambia el código TOTP (cada 60s), no con cada render del padre.
export const QRCarnet = memo(function QRCarnet({ value }: { value: string }) {
  return (
    <QRCode
      value={value}
      size={210}
      // Negro sobre blanco fijo, fuera de los tokens: el lector necesita el
      // máximo contraste y un rediseño no debe tocarlo.
      backgroundColor="#FFFFFF"
      color="#000000"
    />
  )
})

// "Se renueva en Ns" + barra de progreso, con su propio intervalo: el tick de
// cada segundo re-renderiza sólo este componente, no toda la pantalla del carnet.
export function CuentaRegresivaQR() {
  const [secondsLeft, setSecondsLeft] = useState(secondsUntilRefresh)

  useEffect(() => {
    const timer = setInterval(() => setSecondsLeft(secondsUntilRefresh()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <>
      <View style={s.countdownRow}>
        <Text style={s.countdownLabel}>Se renueva en</Text>
        <Text style={s.countdownNum}>{secondsLeft}s</Text>
      </View>
      <View style={s.progressTrack}>
        {/* width is truly dynamic (secondsLeft changes every tick) — must remain inline */}
        <View style={[s.progressFill, { width: `${(secondsLeft / 60) * 100}%` }]} />
      </View>
    </>
  )
}

const s = StyleSheet.create({
  countdownRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 },
  countdownLabel: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase', color: colors.muted },
  countdownNum:   { fontFamily: fonts.titulo, fontSize: 23, color: colors.texto },

  progressTrack: { width: '100%', height: 3, borderRadius: 2, overflow: 'hidden', backgroundColor: colors.borde },
  progressFill:  { height: '100%', backgroundColor: colors.oro, borderRadius: 2 },
})
