import { Tabs } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { TAB_SCREEN_OPTIONS } from '@/constants/tabOptions'

export default function SocioLayout() {
  return (
    <Tabs screenOptions={TAB_SCREEN_OPTIONS}>
      <Tabs.Screen
        name="carnet"
        options={{ tabBarIcon: ({ color, size }) => <Feather name="credit-card" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="cuotas"
        options={{ tabBarIcon: ({ color, size }) => <Feather name="dollar-sign" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="noticias"
        options={{ tabBarIcon: ({ color, size }) => <Feather name="rss" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="calendario"
        options={{ tabBarIcon: ({ color, size }) => <Feather name="calendar" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="sobre"
        options={{ tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} /> }}
      />
    </Tabs>
  )
}
