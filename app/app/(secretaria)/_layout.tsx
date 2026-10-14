import { Tabs } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { TAB_SCREEN_OPTIONS } from '@/constants/tabOptions'

export default function SecretariaLayout() {
  return (
    <Tabs screenOptions={TAB_SCREEN_OPTIONS}>
      <Tabs.Screen
        name="diario"
        options={{ title: 'Inicio', tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="socios"
        options={{ title: 'Socios', tabBarIcon: ({ color, size }) => <Feather name="users" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="noticias"
        options={{ title: 'Noticias', tabBarIcon: ({ color, size }) => <Feather name="file-text" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="sobre"
        options={{ title: 'Mi perfil', href: null, tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} /> }}
      />
    </Tabs>
  )
}
