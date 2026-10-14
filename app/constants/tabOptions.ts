import { StyleSheet } from 'react-native'
import { fonts } from '@/constants/theme'

const tabBarStyle = StyleSheet.create({
  bar: { backgroundColor: '#0E0E0E', borderTopColor: '#1A1A1A' },
}).bar

// Con etiqueta debajo del ícono (auditoría UX, T7): cada Tabs.Screen define su
// `title`, que también es lo que leen VoiceOver / TalkBack.
const tabBarLabelStyle = StyleSheet.create({
  label: { fontFamily: fonts.label, fontSize: 11 },
}).label

export const TAB_SCREEN_OPTIONS = {
  tabBarStyle,
  tabBarLabelStyle,
  tabBarActiveTintColor:   '#E8B53C',
  // #666666 daba 3.36:1 sobre la barra; con etiquetas de texto hace falta 4.5
  tabBarInactiveTintColor: '#8E8574',
  tabBarShowLabel:         true,
  headerShown:             false,
} as const
