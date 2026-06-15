import { StyleSheet } from 'react-native'

const tabBarStyle = StyleSheet.create({
  bar: { backgroundColor: '#0E0E0E', borderTopColor: '#1A1A1A' },
}).bar

export const TAB_SCREEN_OPTIONS = {
  tabBarStyle,
  tabBarActiveTintColor:   '#E8B53C',
  tabBarInactiveTintColor: '#666666',
  tabBarShowLabel:         false,
  headerShown:             false,
} as const
