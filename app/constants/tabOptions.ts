import { StyleSheet } from 'react-native'
import { colors, fonts } from '@/constants/theme'

const tabBarStyle = StyleSheet.create({
  bar: { backgroundColor: colors.fondo, borderTopColor: colors.card },
}).bar

// Con etiqueta debajo del ícono (auditoría UX, T7): cada Tabs.Screen define su
// `title`, que también es lo que leen VoiceOver / TalkBack.
const tabBarLabelStyle = StyleSheet.create({
  label: { fontFamily: fonts.label, fontSize: 11 },
}).label

export const TAB_SCREEN_OPTIONS = {
  tabBarStyle,
  tabBarLabelStyle,
  tabBarActiveTintColor:   colors.oro,
  // #666666 daba 3.36:1 sobre la barra; con etiquetas de texto hace falta 4.5
  // (muted sobre fondo = 5.16:1; ver lib/contraste.check.ts)
  tabBarInactiveTintColor: colors.muted,
  tabBarShowLabel:         true,
  headerShown:             false,
} as const
