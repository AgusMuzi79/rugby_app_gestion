import { TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/constants/theme'

// Ojo de los campos de contraseña de auth. Antes era un ícono sin nombre:
// el lector de pantalla decía sólo "botón".
const HITSLOP = { top: 12, bottom: 12, left: 12, right: 12 }

interface Props {
  visible: boolean
  onToggle: () => void
  style?: StyleProp<ViewStyle>
}

export function BotonVerPassword({ visible, onToggle, style }: Props) {
  return (
    <TouchableOpacity
      style={style}
      onPress={onToggle}
      hitSlop={HITSLOP}
      accessibilityRole="button"
      accessibilityLabel={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
    >
      <Ionicons
        name={visible ? 'eye-off-outline' : 'eye-outline'}
        size={20}
        color={colors.muted}
      />
    </TouchableOpacity>
  )
}
