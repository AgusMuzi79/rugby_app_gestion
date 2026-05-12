import { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import DateTimePickerModal from 'react-native-modal-datetime-picker'
import { Ionicons } from '@expo/vector-icons'

const GOLD    = '#C9A84C'
const DARK    = '#1A1A1A'
const DIVIDER = '#D1C9B8'
const MUTED   = '#7C7267'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function dateToIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function hmToDate(hm: string): Date {
  const [h, m] = hm.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d
}

function dateToHm(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatearFechaEspanol(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export interface DatePickerFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  mode?: 'date' | 'time'
  placeholder?: string
  minimumDate?: Date
  maximumDate?: Date
  onClear?: () => void
}

export function DatePickerField({
  label,
  value,
  onChange,
  mode = 'date',
  placeholder,
  minimumDate,
  maximumDate,
  onClear,
}: DatePickerFieldProps) {
  const [visible, setVisible] = useState(false)

  const hasValue = value.trim().length > 0

  const displayText = !hasValue
    ? null
    : mode === 'date'
    ? formatearFechaEspanol(value)
    : `${value} hs`

  const pickerDate = !hasValue
    ? new Date()
    : mode === 'date'
    ? isoToDate(value)
    : hmToDate(value)

  function handleConfirm(date: Date) {
    setVisible(false)
    onChange(mode === 'date' ? dateToIso(date) : dateToHm(date))
  }

  const defaultPlaceholder = mode === 'date' ? 'Seleccionar fecha' : 'Seleccionar hora'

  return (
    <View>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {onClear && hasValue && (
          <TouchableOpacity onPress={onClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.limpiar}>Quitar</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={styles.campo}
        onPress={() => setVisible(true)}
        activeOpacity={0.75}
      >
        <Text style={[styles.texto, !hasValue && styles.placeholder]}>
          {displayText ?? (placeholder ?? defaultPlaceholder)}
        </Text>
        <Ionicons
          name={mode === 'date' ? 'calendar-outline' : 'time-outline'}
          size={18}
          color={MUTED}
        />
      </TouchableOpacity>

      <DateTimePickerModal
        isVisible={visible}
        mode={mode}
        date={pickerDate}
        onConfirm={handleConfirm}
        onCancel={() => setVisible(false)}
        minimumDate={minimumDate}
        maximumDate={maximumDate}
        locale="es"
        confirmTextIOS="Confirmar"
        cancelTextIOS="Cancelar"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  labelRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  label:      { fontSize: 10, letterSpacing: 2, color: GOLD },
  limpiar:    { fontSize: 11, color: MUTED, textDecorationLine: 'underline' },
  campo:      { borderWidth: 1.5, borderColor: DIVIDER, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff' },
  texto:      { flex: 1, fontSize: 15, color: DARK },
  placeholder:{ color: MUTED },
})
