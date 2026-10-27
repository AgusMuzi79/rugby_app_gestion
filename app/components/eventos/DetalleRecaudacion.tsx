import { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { fonts } from '@/constants/theme'
import { montoSugeridoDe } from '@/lib/montoSugerido'
import type { EventoItem } from '@/hooks/useEventos'
import { useEgresosEvento } from '@/hooks/useEgresos'
import { useCobrosSubcomision } from '@/hooks/useCobrosSubcomision'
import { ResumenBalance } from './ResumenBalance'
import { CobrosPanel } from './CobrosPanel'
import { EgresosPanel } from './EgresosPanel'
import { DIVIDER, FONDO, MUTED, ORO, ROJO, ROJO_TEXTO, TEXTO, formatFechaLarga, formatMonto } from './estilo'

// Detalle de una recaudación de Subcomisión: resumen Cobrado / Egresos / Neto
// y un selector "Cobros | Egresos". Cobros = quién pagó, por división;
// Egresos = mismo panel que el Manager. Con el evento cerrado todo queda en
// sólo lectura (la RLS de 20261019000000 aplica la misma regla).

type Pestana = 'cobros' | 'egresos'

export function DetalleRecaudacion({
  ev, cerrando, onCerrar, onVolver,
}: {
  ev: EventoItem; cerrando: boolean; onCerrar: () => void; onVolver: () => void
}) {
  const [pestana, setPestana] = useState<Pestana>('cobros')
  const egresos  = useEgresosEvento(ev)
  const cobros   = useCobrosSubcomision(ev)
  const montoSug = montoSugeridoDe(ev.descripcion)
  const activo   = ev.estado === 'activo'

  function confirmarCierre() {
    Alert.alert(
      'Cerrar evento',
      '¿Cerrar este evento? Ya no se podrán registrar pagos ni egresos.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Cerrar', style: 'destructive', onPress: onCerrar },
      ],
    )
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={onVolver} style={s.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={ORO} />
        </TouchableOpacity>
        <Text style={s.topLabel}>EVENTO · RECAUDACIÓN</Text>
        {!activo && (
          <View style={s.cerradoBadge}>
            <Text style={s.cerradoTexto}>CERRADO</Text>
          </View>
        )}
      </View>

      <View style={s.nombreWrap}>
        <Text style={s.nombre}>{ev.nombre}</Text>
        <Text style={s.meta}>
          {[
            ev.divisionNombre ?? 'Todo el club',
            ev.fecha ? formatFechaLarga(ev.fecha) : null,
            montoSug !== null ? `${formatMonto(montoSug)} por jugador` : null,
          ].filter(Boolean).join('  ·  ')}
        </Text>
      </View>
      <View style={s.separador} />

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <ResumenBalance balance={egresos.balance} />

          <View style={s.tabRow}>
            {(['cobros', 'egresos'] as Pestana[]).map(p => {
              const sel = pestana === p
              return (
                <TouchableOpacity
                  key={p}
                  style={[s.tabBtn, sel && s.tabBtnActivo]}
                  onPress={() => setPestana(p)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.tabTexto, sel && s.tabTextoActivo]}>
                    {p === 'cobros' ? 'COBROS' : 'EGRESOS'}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {pestana === 'cobros'
            ? <CobrosPanel estado={cobros} onGuardado={egresos.recargar} />
            : <EgresosPanel estado={egresos} />
          }

          {activo && (
            <TouchableOpacity
              style={[s.botonCerrar, cerrando && s.botonCerrarOff]}
              onPress={confirmarCierre}
              disabled={cerrando}
              activeOpacity={0.85}
            >
              {cerrando
                ? <ActivityIndicator color={ROJO} size="small" />
                : <Text style={s.botonCerrarTexto}>CERRAR EVENTO</Text>
              }
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: FONDO },
  flex:      { flex: 1 },

  topBar:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, gap: 8 },
  backBtn:      { padding: 4 },
  topLabel:     { flex: 1, fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: ORO },
  cerradoBadge: { backgroundColor: DIVIDER, borderRadius: 2, paddingHorizontal: 8, paddingVertical: 3 },
  cerradoTexto: { fontFamily: fonts.label, fontSize: 12, color: MUTED, fontWeight: '700', letterSpacing: 1 },

  nombreWrap: { paddingHorizontal: 20, paddingBottom: 12, paddingTop: 4, gap: 6 },
  nombre:     { fontFamily: fonts.titulo, fontSize: 28, color: TEXTO, lineHeight: 34 },
  meta:       { fontFamily: fonts.label, fontSize: 13, color: MUTED, letterSpacing: 0.5 },
  separador:  { height: 1, backgroundColor: DIVIDER, marginHorizontal: 20 },

  scroll: { padding: 16, paddingBottom: 48, gap: 14 },

  tabRow:         { flexDirection: 'row', gap: 24, borderBottomWidth: 1, borderBottomColor: DIVIDER },
  tabBtn:         { paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActivo:   { borderBottomColor: ORO },
  tabTexto:       { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: MUTED, fontWeight: '700' },
  tabTextoActivo: { color: TEXTO },

  botonCerrar:      { marginTop: 16, borderWidth: 1.5, borderColor: ROJO, borderRadius: 3, paddingVertical: 14, alignItems: 'center' },
  botonCerrarOff:   { opacity: 0.6 },
  botonCerrarTexto: { fontFamily: fonts.label, color: ROJO_TEXTO, fontSize: 13, letterSpacing: 2.5, fontWeight: '700' },
})
