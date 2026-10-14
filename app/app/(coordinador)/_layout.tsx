import { Tabs } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { TAB_SCREEN_OPTIONS } from '@/constants/tabOptions'

export default function CoordinadorLayout() {
  return (
    <Tabs screenOptions={TAB_SCREEN_OPTIONS}>
      <Tabs.Screen
        name="diario"
        options={{ title: 'Inicio', tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="calendario"
        options={{ title: 'Calendario', tabBarIcon: ({ color, size }) => <Feather name="calendar" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="jugadores"
        options={{ title: 'Jugadores', tabBarIcon: ({ color, size }) => <Feather name="users" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="cronica"
        options={{ title: 'Crónica', tabBarIcon: ({ color, size }) => <Feather name="activity" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="sobre"
        options={{ title: 'Mi perfil', tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} /> }}
      />
      <Tabs.Screen name="salir" options={{ href: null }} />
      <Tabs.Screen name="asistencia" options={{ href: null }} />
    </Tabs>
  )
}
