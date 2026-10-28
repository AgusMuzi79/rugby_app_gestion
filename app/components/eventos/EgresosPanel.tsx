import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  AccessibilityInfo,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { fonts } from '@/constants/theme'
import { DatePickerField } from '@/components/ui/DatePickerField'
import type { Egreso, EgresosEventoState } from '@/hooks/useEgresos'
import { CARD, DIVIDER, MUTED, ORO, ROJO, SOBRE_ORO, TEXTO, formatFechaLarga, formatMonto } from './estilo'

// Formulario + lista de egresos de un evento (Manager y Subcomisión).
// Recibe el estado de useEgresosEvento; con el evento cerrado oculta el
// formulario y el borrado.

function FilaEgreso({
  egreso, editable, borrando, onBorrar,
}: {
  egreso: Egreso; editable: boolean; borrando: boolean; onBorrar: (e: Egreso) => void
}) {
  return (
    <View style={s.fila}>
      <View style={s.filaTextos}>
        <Text style={s.filaConcepto} numberOfLines={2}>{egreso.concepto}</Text>
        <Text style={s.filaFecha}>{formatFechaLarga(egreso.fecha)}</Text>
      </View>
      <Text style={s.filaMonto}>{formatMonto(egreso.monto)}</Text>
      {editable && (
        borrando
          ? <ActivityIndicator color={MUTED} size="small" style={s.filaAccion} />
          : (
            <TouchableOpacity
              onPress={() => onBorrar(egreso)}
              activeOpacity={0.7}
              style={s.filaAccion}
              accessibilityRole="button"
              accessibilityLabel={`Borrar egreso ${egreso.concepto}`}
            >
              <Ionicons name="trash-outline" size={18} color={MUTED} />
            </TouchableOpacity>
          )
      )}
    </View>
  )
}

export function EgresosPanel({ estado }: { estado: EgresosEventoState }) {
  const {
    editable, cargando, egresos,
    form, setForm, guardando, errorGuardado, agregarEgreso,
    borrandoId, borrarEgreso,
  } = estado

  function confirmarBorrado(e: Egreso) {
    Alert.alert('Borrar egreso', `¿Borrar "${e.concepto}" (${formatMonto(e.monto)})?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: () => { borrarEgreso(e.id) } },
    ])
  }

  return (
    <View style={s.wrap}>
      {editable ? (
        <View style={s.formCard}>
          <Text style={s.seccionLabel}>NUEVO EGRESO</Text>

          <View style={s.campo}>
            <Text style={s.campoLabel}>CONCEPTO</Text>
            <TextInput
              style={s.input}
              value={form.concepto}
              onChangeText={v => setForm(f => ({ ...f, concepto: v }))}
              placeholder="Micro, comida, insumos…"
              placeholderTextColor={MUTED}
              maxLength={120}
            />
          </View>

          <View style={s.campo}>
            <Text style={s.campoLabel}>MONTO</Text>
            <View style={s.montoWrap}>
              <Text style={s.montoSimbolo}>$</Text>
              <TextInput
                style={s.montoInput}
                value={form.monto}
                onChangeText={v => setForm(f => ({ ...f, monto: v }))}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={MUTED}
                maxLength={14}
              />
            </View>
          </View>

          <DatePickerField
            label="FECHA"
            value={form.fecha}
            onChange={v => setForm(f => ({ ...f, fecha: v }))}
            maximumDate={new Date()}
          />

          {errorGuardado && (
            <View style={s.bannerError} accessibilityRole="alert" accessibilityLiveRegion="polite">
              <Text style={s.bannerErrorTexto}>{errorGuardado}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[s.botonPrincipal, guardando && s.botonPrincipalOff]}
            onPress={async () => {
              if (await agregarEgreso()) AccessibilityInfo.announceForAccessibility('Egreso agregado')
            }}
            disabled={guardando}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ disabled: guardando, busy: guardando }}
          >
            {guardando
              ? <ActivityIndicator color={SOBRE_ORO} size="small" />
              : <Text style={s.botonPrincipalTexto}>AGREGAR EGRESO</Text>
            }
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.bannerInfo}>
          <Text style={s.bannerInfoTexto}>
            Evento cerrado: los egresos quedan sólo para consulta.
          </Text>
          {errorGuardado && (
            <Text style={s.bannerErrorTexto} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {errorGuardado}
            </Text>
          )}
        </View>
      )}

      <View style={s.seccionHeader}>
        <Text style={s.seccionLabel}>EGRESOS CARGADOS</Text>
        <Text style={s.seccionConteo}>{egresos.length}</Text>
      </View>

      {cargando ? (
        <ActivityIndicator color={ORO} style={s.loader} />
      ) : egresos.length === 0 ? (
        <Text style={s.emptyTexto}>Sin egresos cargados.</Text>
      ) : (
        <View>
          {egresos.map((e, i) => (
            <View key={e.id}>
              {i > 0 && <View style={s.filaDiv} />}
              <FilaEgreso
                egreso={e}
                editable={editable}
                borrando={borrandoId === e.id}
                onBorrar={confirmarBorrado}
              />
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { gap: 14 },

  seccionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  seccionLabel:  { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: ORO },
  seccionConteo: { fontFamily: fonts.cuerpo, fontSize: 15, color: MUTED, fontWeight: '600' },
  emptyTexto:    { fontFamily: fonts.cuerpo, color: MUTED, fontSize: 16, fontStyle: 'italic' },
  loader:        { marginTop: 12 },

  // Formulario
  formCard:     { borderWidth: 1, borderColor: DIVIDER, borderRadius: 4, backgroundColor: CARD, padding: 16, gap: 16 },
  campo:        { gap: 8 },
  campoLabel:   { fontFamily: fonts.label, fontSize: 12, letterSpacing: 2, color: MUTED },
  input:        { fontFamily: fonts.cuerpo, fontSize: 17, color: TEXTO, borderBottomWidth: 1.5, borderBottomColor: DIVIDER, paddingVertical: 6, paddingHorizontal: 0 },
  montoWrap:    { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1.5, borderBottomColor: ORO },
  montoSimbolo: { fontFamily: fonts.label, fontSize: 17, color: MUTED, marginRight: 6 },
  montoInput:   { flex: 1, fontFamily: fonts.cuerpo, fontSize: 17, fontWeight: '700', color: TEXTO, paddingVertical: 6, paddingHorizontal: 0 },

  // Lista
  filaDiv:      { height: 1, backgroundColor: DIVIDER },
  fila:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10 },
  filaTextos:   { flex: 1 },
  filaConcepto: { fontFamily: fonts.cuerpo, fontSize: 16, fontWeight: '700', color: TEXTO },
  filaFecha:    { fontFamily: fonts.label, fontSize: 12, color: MUTED, letterSpacing: 0.5, marginTop: 2 },
  filaMonto:    { fontFamily: fonts.cuerpo, fontSize: 16, fontWeight: '700', color: TEXTO },
  filaAccion:   { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 },

  // Banners
  bannerError:      { backgroundColor: '#2A1010', borderLeftWidth: 3, borderLeftColor: ROJO, borderRadius: 4, padding: 12 },
  bannerErrorTexto: { fontFamily: fonts.cuerpo, fontSize: 15, color: '#FFAAAA' },
  bannerInfo:       { borderWidth: 1, borderColor: DIVIDER, borderLeftWidth: 3, borderLeftColor: ORO, borderRadius: 4, padding: 12, gap: 6 },
  bannerInfoTexto:  { fontFamily: fonts.cuerpo, fontSize: 15, color: TEXTO },

  // Botón
  botonPrincipal:      { backgroundColor: ORO, paddingVertical: 15, borderRadius: 3, alignItems: 'center' },
  botonPrincipalOff:   { opacity: 0.6 },
  botonPrincipalTexto: { fontFamily: fonts.label, color: SOBRE_ORO, fontSize: 13, letterSpacing: 2.5, fontWeight: '700' },
})
