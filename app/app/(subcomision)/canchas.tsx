import { useCallback, useState } from 'react'
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AvatarPerfil } from '@/components/shared/Header'
import { GrillaGestor } from '@/components/tenis/GrillaGestor'
import { ComprobantesPendientes } from '@/components/tenis/ComprobantesPendientes'
import { Sanciones } from '@/components/tenis/Sanciones'
import { ReglasPrecios } from '@/components/tenis/ReglasPrecios'
import { ListadoReservas } from '@/components/tenis/ListadoReservas'
import { Canceladas } from '@/components/tenis/Canceladas'
import { Reportes } from '@/components/tenis/Reportes'
import { CarteleraTenis } from '@/components/tenis/CarteleraTenis'
import { Chip } from '@/components/tenis/ui'
import { useEsGestorTenis } from '@/hooks/useTenisGestor'
import { FEATURES } from '@/constants/features'
import { colors, fonts } from '@/constants/theme'
import type { TenisConfig } from '@/lib/tenis'

// Pestaña "Canchas" de la subcomisión de tenis (y admin), con FEATURES.tenis:
// grilla del día, listado de reservas, canceladas, comprobantes de invitados,
// infracciones / suspensiones, reportes, cartelera y reglas y precios. El gestor trabaja sólo desde acá (no hay panel web).

type Seccion = 'grilla' | 'reservas' | 'canceladas' | 'comprobantes' | 'sanciones' | 'reportes' | 'cartelera' | 'reglas'

const SECCIONES: { id: Seccion; label: string }[] = [
  { id: 'grilla', label: 'GRILLA' },
  { id: 'reservas', label: 'RESERVAS' },
  { id: 'canceladas', label: 'CANCELADAS' },
  { id: 'comprobantes', label: 'COMPROBANTES' },
  { id: 'sanciones', label: 'SANCIONES' },
  { id: 'reportes', label: 'REPORTES' },
  { id: 'cartelera', label: 'CARTELERA' },
  { id: 'reglas', label: 'REGLAS' },
]

export default function CanchasScreen() {
  const esGestor = useEsGestorTenis()
  const [seccion, setSeccion] = useState<Seccion>('grilla')
  const [config, setConfig] = useState<TenisConfig | null>(null)
  // La grilla vuelve a pedir la config después de guardar las reglas.
  const [version, setVersion] = useState(0)
  const onConfig = useCallback((c: TenisConfig) => setConfig(c), [])

  let cuerpo: React.ReactNode
  if (!FEATURES.tenis || esGestor === false) {
    cuerpo = <Text style={s.vacio}>Esta sección es para quien gestiona las canchas de tenis.</Text>
  } else if (esGestor === null) {
    cuerpo = <ActivityIndicator color={colors.oro} style={s.cargando} />
  } else {
    cuerpo = (
      <>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs} style={s.tabsWrap}>
          {SECCIONES.map(x => <Chip key={x.id} texto={x.label} activo={seccion === x.id} onPress={() => setSeccion(x.id)} />)}
        </ScrollView>
        {/* La grilla queda montada: trae la config que usa REGLAS. */}
        <View style={[s.flex, seccion !== 'grilla' && s.oculto]}>
          <GrillaGestor key={version} onConfig={onConfig} />
        </View>
        {seccion === 'reservas' && <ListadoReservas />}
        {seccion === 'canceladas' && <Canceladas />}
        {seccion === 'comprobantes' && <ComprobantesPendientes />}
        {seccion === 'sanciones' && <Sanciones />}
        {seccion === 'reportes' && <Reportes />}
        {seccion === 'cartelera' && <CarteleraTenis />}
        {seccion === 'reglas' && (
          config
            ? <ReglasPrecios config={config} onGuardado={() => setVersion(v => v + 1)} />
            : <ActivityIndicator color={colors.oro} style={s.cargando} />
        )}
      </>
    )
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.labelHeader}>SUBCOMISIÓN · TENIS</Text>
          <Text style={s.titulo}>Canchas</Text>
        </View>
        <AvatarPerfil />
      </View>
      <View style={s.separador} />
      {cuerpo}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: colors.fondo },
  header:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  labelHeader: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: colors.oro, marginBottom: 4 },
  titulo:      { fontFamily: fonts.titulo, fontSize: 32, color: colors.texto, lineHeight: 38 },
  separador:   { height: 1, backgroundColor: colors.borde, marginHorizontal: 20 },
  tabsWrap:    { flexGrow: 0 },
  tabs:        { gap: 8, paddingHorizontal: 20, paddingVertical: 12 },
  flex:        { flex: 1 },
  oculto:      { display: 'none' },
  cargando:    { marginVertical: 24 },
  vacio:       { fontFamily: fonts.cuerpo, fontSize: 15, fontStyle: 'italic', color: colors.muted, padding: 20 },
})
