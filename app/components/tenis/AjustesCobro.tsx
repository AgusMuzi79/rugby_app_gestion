import { useState } from 'react'
import { View, Text, Alert, StyleSheet } from 'react-native'
import { colors, fonts } from '@/constants/theme'
import { accionesTenis, type AjusteCobro } from '@/hooks/useTenisGestor'
import { etiquetaDiaCorta, fechaArgentina, inicioReal } from '@/lib/tenis'
import { formatMonto } from '@/lib/formatoMonto'
import { Aviso, Boton, estilosTenis } from './ui'

// "Ajustes pendientes": plata que el club tiene que devolver (alguien que pagó
// y salió de la reserva al editarla o corregirla, o un cobrado cuyo turno quedó
// más barato) o cobrar (quedó más caro). Se marca cuando ya se resolvió en el
// club. Va arriba de los comprobantes pendientes (gestor y canchero).

export function AjustesCobro({ lista, onCambio }: { lista: AjusteCobro[]; onCambio: () => void }) {
  const [resolviendo, setResolviendo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (lista.length === 0) return null

  function resolver(a: AjusteCobro) {
    const accion = a.monto > 0 ? `le devolviste ${formatMonto(a.monto)} a ${a.nombre}` : `le cobraste ${formatMonto(-a.monto)} a ${a.nombre}`
    Alert.alert('Ajuste resuelto', `¿Confirmás que ya ${accion}?`, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí', onPress: async () => {
          setResolviendo(a.id)
          setError(null)
          const r = await accionesTenis.ajusteResolver(a.id)
          setResolviendo(null)
          if (!r.ok) setError(r.mensaje)
          else onCambio()
        },
      },
    ])
  }

  return (
    <View style={s.root}>
      <Text style={estilosTenis.label}>AJUSTES PENDIENTES</Text>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {lista.map(a => (
        <View key={a.id} style={[estilosTenis.card, s.card]}>
          <Text style={s.titulo}>{a.monto > 0 ? `Devolver ${formatMonto(a.monto)}` : `Cobrar ${formatMonto(-a.monto)}`}</Text>
          <Text style={estilosTenis.textoCard}>
            {a.nombre}{a.numero_socio ? ` · socio ${a.numero_socio}` : a.dni ? ` · DNI ${a.dni}` : ''}
          </Text>
          <Text style={estilosTenis.mutedCard}>
            {a.motivo === 'jugador_quitado' ? 'Pagó y salió de la reserva' : 'Pagó y le cambiaron el turno'} · Cancha {a.cancha} · {etiquetaDiaCorta(fechaArgentina(a.inicio))} {inicioReal(a.inicio)}
          </Text>
          <Boton texto="YA ESTÁ RESUELTO" variante="secundario" cargando={resolviendo === a.id} onPress={() => resolver(a)} />
        </View>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  root:   { marginBottom: 12 },
  card:   { marginBottom: 12 },
  titulo: { fontFamily: fonts.label, fontSize: 16, letterSpacing: 1, color: colors.oro },
})
